import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { mergeOverlappingSlots } from '../_shared/conflicts.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { callOpenAIJson, OpenAIError, sha256 } from '../_shared/llm.ts'
import { buildAlternativePlan, validateGeneratedPlan } from '../_shared/plan-validation.ts'
import { generatedPlan } from '../_shared/schemas.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({
  trip_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative(),
  regenerate: z.boolean().default(false),
  idempotency_key: z.string().min(1).max(200),
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let runId: string | null = null
  try {
    const body = requestSchema.parse(await request.json())
    const { client, user } = await requireUser(request)

    const membership = await client
      .from('trip_members')
      .select('trip_id')
      .eq('trip_id', body.trip_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membership.error || !membership.data) {
      return jsonResponse({ error: 'NOT_A_MEMBER' }, 403)
    }

    const [tripResult, planResult, notesResult, busyResult] = await Promise.all([
      client.from('trips').select('id,starts_at,ends_at,timezone,origin,budget,currency').eq('id', body.trip_id).single(),
      client.from('plans').select('id,current_version').eq('id', body.plan_id).eq('trip_id', body.trip_id).single(),
      client
        .from('notes')
        .select('id,title,attrs,x,y')
        .eq('trip_id', body.trip_id)
        .eq('status', 'active')
        .is('deleted_at', null),
      client
        .from('personal_events')
        .select('start_at,end_at')
        .is('deleted_at', null)
        .order('start_at'),
    ])
    if (tripResult.error) throw tripResult.error
    if (planResult.error) throw planResult.error
    if (notesResult.error) throw notesResult.error
    if (busyResult.error) throw busyResult.error
    if (planResult.data.current_version !== body.expected_version) {
      return jsonResponse({ error: 'VERSION_CONFLICT' }, 409)
    }

    const inputHash = await sha256(
      JSON.stringify({
        trip: tripResult.data,
        notes: [...notesResult.data]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((note) => ({ id: note.id, title: note.title, attrs: note.attrs, x: note.x, y: note.y })),
        busy: busyResult.data,
        version: body.expected_version,
      }),
    )
    const runResult = await client
      .from('ai_runs')
      .insert({
        trip_id: body.trip_id,
        kind: 'generate_plan',
        requested_by: user.id,
        idempotency_key: body.idempotency_key,
        input_hash: inputHash,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select('id,status')
      .single()

    if (runResult.error?.code === '23505') {
      const existingRun = await client
        .from('ai_runs')
        .select('id,status')
        .eq('trip_id', body.trip_id)
        .eq('kind', 'generate_plan')
        .eq('idempotency_key', body.idempotency_key)
        .single()
      if (existingRun.error) throw existingRun.error
      return jsonResponse({ status: existingRun.data.status, run_id: existingRun.data.id, idempotent: true })
    }
    if (runResult.error) throw runResult.error
    runId = runResult.data.id

    const input = {
      trip: tripResult.data,
      notes: notesResult.data,
      busy_intervals: busyResult.data,
    }
    const system = [
      'Return exactly one JSON object with a slots array and no other text.',
      'Each slot must be {"start_at":"ISO 8601 with offset","end_at":"ISO 8601 with offset","options":[...]}.',
      'Each option must be {"note_id":"existing note UUID or null","title":"string","start_at":"ISO 8601 with offset","end_at":"ISO 8601 with offset","kind":"activity|travel|all_day|placeholder","attrs":{},"reason":"string"}.',
      'Every activity option must reference an id from notes in note_id and must represent that note. Never invent restaurants, destinations, shopping, or activities that are not in notes.',
      'Only travel or placeholder options may use a null note_id. Include every active note exactly once as an activity.',
      'Honor duration and time_hint from each note attrs, including exact requested clock times.',
      'Include at least one option in every slot. Respect the trip start, trip end, timezone, budget, and every busy interval.',
      'Do not overlap slots or busy intervals. Ensure every end_at is after start_at and every option fits inside its slot.',
      'When ideas compete for the same time range, return them as multiple options inside one slot so members can vote, never as separate slots.',
      'Notes that cannot all happen belong in one slot as competing options, for example several lunch wishes or geographically distant destinations that cannot fit within the trip.',
      'Build a realistic door-to-door itinerary from the trip origin. Never place activities at different locations back-to-back without travel time.',
      'Between consecutive activity groups at different locations, add one separate single-option travel slot with kind travel and note_id null.',
      'Each travel option attrs must be {"from_note_id":"previous note UUID or null for trip origin","to_note_id":"next note UUID","mode":"walking|transit|train|flight|car|other","duration_minutes":number,"distance_category":"local|regional|long_distance|international","estimated":true}.',
      'The travel option start_at and end_at must equal its estimated duration. Use at least 10 minutes for local, 45 for regional, 120 for long_distance, and 180 for international travel.',
      'Use local only for the same venue or genuinely nearby places. Use regional with at least 45 minutes for different locations in the same broad region when precise coordinates are unavailable.',
      'Use conservative door-to-door estimates including transfers, station or airport access, waiting, boarding, and arrival procedures. Do not invent exact timetables.',
      'Tokyo to Kyoto normally needs at least 180 minutes, Kyoto to Hokkaido at least 240 minutes, and Hokkaido to Korea at least 300 minutes door-to-door.',
      'If all notes plus realistic travel cannot fit inside the trip window, make incompatible activities competing options instead of compressing travel or creating an impossible itinerary.',
      'Set each travel title to a concise Japanese label such as 移動: 東京駅 → 京都 and explain that the duration is an AI estimate in reason.',
      'All user-facing title and reason values must be written in Japanese.',
      'If correction_context is present, repair every listed validation error and return the complete corrected plan.',
    ].join(' ')
    let parsed: z.infer<typeof generatedPlan> | null = null
    let validationErrors: string[] = []
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const requestInput =
          attempt === 0
            ? input
            : {
                ...input,
                correction_context: {
                  validation_errors: validationErrors,
                  previous_plan: parsed,
                },
              }
        parsed = generatedPlan.parse(await callOpenAIJson(system, requestInput))
        validationErrors = validateGeneratedPlan(parsed.slots, input)
        if (validationErrors.length === 0) break
      }
    } catch (error) {
      if (error instanceof OpenAIError) throw error
      if (error instanceof z.ZodError) throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
      throw error
    }
    if (parsed && validationErrors.length > 0) {
      const alternativeSlots = buildAlternativePlan(parsed.slots, input)
      if (alternativeSlots) {
        const alternativeErrors = validateGeneratedPlan(alternativeSlots, input)
        if (alternativeErrors.length === 0) {
          parsed = { slots: alternativeSlots }
          validationErrors = []
        }
      }
    }
    if (!parsed || validationErrors.length > 0) {
      throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
    }

    // OpenAIが重なる予定を別slotへ返した場合も、同じ時間帯は1slotへまとめて投票できる競合候補にする。
    const slots = mergeOverlappingSlots(parsed.slots)

    const applied = await client.rpc('apply_plan_command', {
      p_plan_id: body.plan_id,
      p_expected_version: body.expected_version,
      p_command: {
        type: 'replace_plan',
        summary: body.regenerate ? 'AIでプランを再生成' : 'AIでプランを生成',
        payload: { slots, regenerate: body.regenerate },
      },
    })
    if (applied.error) throw applied.error

    const service = createServiceClient()
    await service
      .from('ai_runs')
      .update({ status: 'completed', finished_at: new Date().toISOString() })
      .eq('id', runId)
    return jsonResponse({ run_id: runId, result: applied.data })
  } catch (error) {
    if (runId) {
      const service = createServiceClient()
      await service
        .from('ai_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: error instanceof OpenAIError ? error.code : 'GENERATE_PLAN_FAILED',
          error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        })
        .eq('id', runId)
    }
    return errorResponse(error, error instanceof OpenAIError ? error.status : 400)
  }
})

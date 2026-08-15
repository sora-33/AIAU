// チャットの未処理発言から付箋操作（add / update / hold）を抽出して適用する。
// docs/screen1-requirements.md「4. AI 入出力契約」/ backend-supabase-plan.md「10. Edge Functions」対応。
//
// 抽出器はアダプタで分離している:
//   LLM_PROVIDER=mock   … 規則ベースの模擬抽出（既定。API キー不要）
//   LLM_PROVIDER=openai … 将来: API キー取得後に実装を差し替える
// LLM が失敗しても DB は変更されない（run 単位でまとめて適用するため）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractMock } from './mock.ts'
import type { ExistingNote, IncomingMessage, NoteOperation } from './contract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isValidOperation(op: NoteOperation, noteIds: Set<string>): boolean {
  if (op.op === 'add') return typeof op.title === 'string' && op.title.trim().length > 0
  if (op.op === 'update') return typeof op.target === 'string' && noteIds.has(op.target)
  if (op.op === 'hold')
    return (
      typeof op.target === 'string' &&
      noteIds.has(op.target) &&
      typeof op.reason === 'string' &&
      op.reason.length > 0
    )
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const { trip_id } = (await req.json()) as { trip_id?: string }
  if (!trip_id) return json({ error: 'INVALID_INPUT' }, 400)

  // 呼び出し元 JWT と membership を再検証する（RLS 迂回前の再認可）
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'AUTH_REQUIRED' }, 401)

  const admin = createClient(url, serviceKey)
  const { data: membership, error: memberError } = await admin
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', trip_id)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (memberError) console.error('membership query failed:', memberError.message)
  if (!membership) return json({ error: 'NOT_A_MEMBER' }, 403)

  // 未処理発言を原子的に claim する（複数クライアントが同時に呼んでも二重適用しない）
  const { data: claimed, error: claimError } = await admin
    .from('messages')
    .update({ processed: true })
    .eq('trip_id', trip_id)
    .eq('processed', false)
    .is('deleted_at', null)
    .select('id, text, author_name')
  if (claimError) return json({ error: claimError.message }, 500)
  if (!claimed || claimed.length === 0) return json({ applied: 0, skipped: 0, claimed: 0 })

  const { data: notes, error: notesError } = await admin
    .from('notes')
    .select('id, title, status, user_touched')
    .eq('trip_id', trip_id)
  if (notesError) return json({ error: notesError.message }, 500)

  const provider = Deno.env.get('LLM_PROVIDER') ?? 'mock'
  let operations: NoteOperation[]
  if (provider === 'mock') {
    operations = extractMock(claimed as IncomingMessage[], (notes ?? []) as ExistingNote[])
  } else {
    // LLM provider は API キー取得後に実装する。未実装 provider は安全側（何もしない）
    operations = []
  }

  const noteIds = new Set((notes ?? []).map((n) => n.id))
  const valid = operations.filter((op) => isValidOperation(op, noteIds))
  if (valid.length === 0) return json({ applied: 0, skipped: 0, claimed: claimed.length })

  const { data: result, error: applyError } = await admin.rpc('apply_note_operations', {
    p_trip_id: trip_id,
    p_operations: valid,
  })
  if (applyError) return json({ error: applyError.message }, 500)

  return json({ ...result, claimed: claimed.length, provider })
})

import { describe, expect, it } from 'vitest'
import {
  buildAlternativePlan,
  validateGeneratedPlan,
  type GeneratedOptionInput,
  type GeneratedSlotInput,
  type PlanNoteInput,
} from '../../supabase/functions/_shared/plan-validation'

const ids = {
  tokyo: '11111111-1111-4111-8111-111111111111',
  kyoto: '22222222-2222-4222-8222-222222222222',
  hokkaido: '33333333-3333-4333-8333-333333333333',
  korea: '44444444-4444-4444-8444-444444444444',
}

const notes: PlanNoteInput[] = [
  { id: ids.tokyo, title: '東京駅', attrs: { duration: 60 } },
  { id: ids.kyoto, title: '京都', attrs: { duration: 60 } },
  { id: ids.hokkaido, title: '北海道', attrs: { duration: 60 } },
  { id: ids.korea, title: '韓国', attrs: { duration: 60 } },
]

const context = {
  trip: {
    starts_at: '2026-08-16T09:00:00+09:00',
    ends_at: '2026-08-22T21:00:00+09:00',
  },
  notes,
  busy_intervals: [],
}

function activity(noteId: string, title: string, startAt: string, endAt: string): GeneratedSlotInput {
  return {
    start_at: startAt,
    end_at: endAt,
    options: [{ note_id: noteId, title, start_at: startAt, end_at: endAt, kind: 'activity', attrs: { duration: 60 } }],
  }
}

function travel(
  fromNoteId: string | null,
  toNoteId: string,
  startAt: string,
  endAt: string,
  durationMinutes: number,
  distanceCategory: 'local' | 'regional' | 'long_distance' | 'international',
): GeneratedSlotInput {
  return {
    start_at: startAt,
    end_at: endAt,
    options: [
      {
        note_id: null,
        title: '移動',
        start_at: startAt,
        end_at: endAt,
        kind: 'travel',
        attrs: {
          from_note_id: fromNoteId,
          to_note_id: toNoteId,
          mode: 'train',
          duration_minutes: durationMinutes,
          distance_category: distanceCategory,
          estimated: true,
        },
      },
    ],
  }
}

describe('validateGeneratedPlan', () => {
  it('rejects distant activities placed back-to-back without travel slots', () => {
    const slots = [
      activity(ids.tokyo, '東京駅', '2026-08-16T15:16:00+09:00', '2026-08-16T16:16:00+09:00'),
      activity(ids.kyoto, '京都', '2026-08-16T16:16:00+09:00', '2026-08-16T17:16:00+09:00'),
      activity(ids.hokkaido, '北海道', '2026-08-16T17:16:00+09:00', '2026-08-16T18:16:00+09:00'),
      activity(ids.korea, '韓国', '2026-08-16T18:16:00+09:00', '2026-08-16T19:16:00+09:00'),
    ]

    expect(validateGeneratedPlan(slots, context)).toEqual(
      expect.arrayContaining([
        `MISSING_TRAVEL:${ids.tokyo}:${ids.kyoto}`,
        `MISSING_TRAVEL:${ids.kyoto}:${ids.hokkaido}`,
        `MISSING_TRAVEL:${ids.hokkaido}:${ids.korea}`,
      ]),
    )
  })

  it('falls back to competing alternatives when realistic travel cannot fit', () => {
    const impossible = [
      activity(ids.tokyo, '東京駅', '2026-08-16T15:16:00+09:00', '2026-08-16T16:16:00+09:00'),
      activity(ids.kyoto, '京都', '2026-08-16T16:16:00+09:00', '2026-08-16T17:16:00+09:00'),
      activity(ids.hokkaido, '北海道', '2026-08-16T17:16:00+09:00', '2026-08-16T18:16:00+09:00'),
      activity(ids.korea, '韓国', '2026-08-16T18:16:00+09:00', '2026-08-16T19:16:00+09:00'),
    ]
    const shortContext = { ...context, trip: { ...context.trip, ends_at: '2026-08-17T09:00:00+09:00' } }
    const alternative = buildAlternativePlan(impossible, shortContext)

    expect(alternative).not.toBeNull()
    expect(alternative).toHaveLength(1)
    expect(alternative![0].options).toHaveLength(4)
    expect(new Set(alternative![0].options.map((option) => option.start_at))).toHaveLength(1)
    expect(validateGeneratedPlan(alternative!, shortContext)).toEqual([])
  })

  it('accepts a realistic long-distance travel slot between activities', () => {
    const subsetContext = { ...context, notes: notes.slice(0, 2) }
    const slots = [
      activity(ids.tokyo, '東京駅', '2026-08-16T09:00:00+09:00', '2026-08-16T10:00:00+09:00'),
      travel(
        ids.tokyo,
        ids.kyoto,
        '2026-08-16T10:00:00+09:00',
        '2026-08-16T13:00:00+09:00',
        180,
        'long_distance',
      ),
      activity(ids.kyoto, '京都', '2026-08-16T13:00:00+09:00', '2026-08-16T14:00:00+09:00'),
    ]

    expect(validateGeneratedPlan(slots, subsetContext)).toEqual([])
  })

  it('rejects an unrealistically short route even when a travel slot exists', () => {
    const subsetContext = { ...context, notes: notes.slice(0, 2) }
    const slots = [
      activity(ids.tokyo, '東京駅', '2026-08-16T09:00:00+09:00', '2026-08-16T10:00:00+09:00'),
      travel(ids.tokyo, ids.kyoto, '2026-08-16T10:00:00+09:00', '2026-08-16T10:30:00+09:00', 30, 'local'),
      activity(ids.kyoto, '京都', '2026-08-16T10:30:00+09:00', '2026-08-16T11:30:00+09:00'),
    ]

    expect(validateGeneratedPlan(slots, subsetContext)).toContain(
      `TRAVEL_ROUTE_TOO_SHORT:${ids.tokyo}:${ids.kyoto}:180`,
    )
  })

  it('accepts geographically incompatible wishes as alternatives instead of an impossible sequence', () => {
    const startAt = '2026-08-16T09:00:00+09:00'
    const endAt = '2026-08-16T10:00:00+09:00'
    const options: GeneratedOptionInput[] = notes.map((note) => ({
      note_id: note.id,
      title: note.title,
      start_at: startAt,
      end_at: endAt,
      kind: 'activity',
      attrs: { duration: 60 },
    }))

    expect(validateGeneratedPlan([{ start_at: startAt, end_at: endAt, options }], context)).toEqual([])
  })

  it('requires travel from the trip origin to a different first destination', () => {
    const originContext = {
      ...context,
      trip: { ...context.trip, origin: '東京駅' },
      notes: [notes[1]],
    }
    const kyoto = activity(ids.kyoto, '京都', '2026-08-16T13:00:00+09:00', '2026-08-16T14:00:00+09:00')

    expect(validateGeneratedPlan([kyoto], originContext)).toContain(`MISSING_ORIGIN_TRAVEL:${ids.kyoto}`)
    expect(
      validateGeneratedPlan(
        [
          travel(null, ids.kyoto, '2026-08-16T09:00:00+09:00', '2026-08-16T12:00:00+09:00', 180, 'long_distance'),
          kyoto,
        ],
        originContext,
      ),
    ).toEqual([])
    const fallback = buildAlternativePlan([kyoto], originContext)
    expect(fallback).toHaveLength(2)
    expect(fallback![0].options[0].kind).toBe('travel')
    expect(validateGeneratedPlan(fallback!, originContext)).toEqual([])
  })

  it('rejects travel slots without explicit estimation metadata', () => {
    const subsetContext = { ...context, notes: notes.slice(0, 2) }
    const incompleteTravel: GeneratedSlotInput = {
      start_at: '2026-08-16T10:00:00+09:00',
      end_at: '2026-08-16T12:30:00+09:00',
      options: [
        {
          note_id: null,
          title: '移動',
          start_at: '2026-08-16T10:00:00+09:00',
          end_at: '2026-08-16T12:30:00+09:00',
          kind: 'travel',
          attrs: { from_note_id: ids.tokyo, to_note_id: ids.kyoto },
        },
      ],
    }
    const slots = [
      activity(ids.tokyo, '東京駅', '2026-08-16T09:00:00+09:00', '2026-08-16T10:00:00+09:00'),
      incompleteTravel,
      activity(ids.kyoto, '京都', '2026-08-16T12:30:00+09:00', '2026-08-16T13:30:00+09:00'),
    ]

    expect(validateGeneratedPlan(slots, subsetContext)).toEqual(
      expect.arrayContaining([
        'TRAVEL_CATEGORY_MISSING:1:0',
        'TRAVEL_DURATION_MISMATCH:1:0',
        'TRAVEL_MODE_MISSING:1:0',
        'TRAVEL_ESTIMATE_FLAG_MISSING:1:0',
      ]),
    )
  })
})

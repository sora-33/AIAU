export const travelCategoryMinimumMinutes = {
  local: 10,
  regional: 45,
  long_distance: 120,
  international: 180,
} as const

export type TravelCategory = keyof typeof travelCategoryMinimumMinutes

export type GeneratedOptionInput = {
  note_id?: string | null
  title: string
  start_at: string
  end_at: string
  kind?: 'activity' | 'travel' | 'all_day' | 'placeholder'
  attrs?: Record<string, unknown>
}

export type GeneratedSlotInput = {
  start_at: string
  end_at: string
  options: GeneratedOptionInput[]
}

export type PlanNoteInput = {
  id: string
  title: string
  attrs?: unknown
}

export type PlanValidationContext = {
  trip: { starts_at?: string | null; ends_at?: string | null; origin?: string | null }
  notes: PlanNoteInput[]
  busy_intervals: Array<{ start_at: string; end_at: string }>
}

type TimedEntry = {
  slotIndex: number
  optionIndex: number
  option: GeneratedOptionInput
  start: number
  end: number
}

type ActivityCluster = {
  start: number
  end: number
  entries: TimedEntry[]
}

const routeMinimumMinutes = new Map([
  ['JP-kansai|JP-kanto', 180],
  ['JP-hokkaido|JP-kansai', 240],
  ['JP-hokkaido|JP-kanto', 240],
  ['JP-hokkaido|KR', 300],
])

const locationScopes = [
  { id: 'JP-hokkaido', markers: ['北海道', '札幌', '函館', '旭川', '帯広', '釧路'] },
  { id: 'JP-tohoku', markers: ['青森', '岩手', '宮城', '仙台', '秋田', '山形', '福島'] },
  { id: 'JP-kanto', markers: ['東京', '横浜', '神奈川', '千葉', '埼玉', '茨城', '栃木', '群馬'] },
  { id: 'JP-chubu', markers: ['新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '名古屋'] },
  { id: 'JP-kansai', markers: ['京都', '大阪', '兵庫', '神戸', '奈良', '滋賀', '和歌山', '三重'] },
  { id: 'JP-chugoku', markers: ['鳥取', '島根', '岡山', '広島', '山口'] },
  { id: 'JP-shikoku', markers: ['徳島', '香川', '愛媛', '高知'] },
  { id: 'JP-kyushu', markers: ['福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄', '那覇'] },
  { id: 'KR', markers: ['韓国', 'ソウル', '釜山', '済州'] },
  { id: 'TW', markers: ['台湾', '台北', '高雄'] },
  { id: 'CN', markers: ['中国', '北京', '上海', '香港', 'マカオ'] },
  { id: 'US', markers: ['アメリカ', '米国', 'ニューヨーク', 'ロサンゼルス', 'ハワイ'] },
  { id: 'EU', markers: ['イギリス', 'フランス', 'ドイツ', 'イタリア', 'スペイン', 'ロンドン', 'パリ', 'ローマ'] },
]

function timestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN
  return Date.parse(value)
}

function overlaps(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && leftEnd > rightStart
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scalarString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function optionKind(option: GeneratedOptionInput): NonNullable<GeneratedOptionInput['kind']> {
  return option.kind ?? 'activity'
}

function durationMinutes(entry: TimedEntry): number {
  return (entry.end - entry.start) / 60_000
}

function noteLocationText(note: PlanNoteInput): string {
  const attrs = isRecord(note.attrs) ? note.attrs : {}
  return [note.title, scalarString(attrs.address), scalarString(attrs.location)].filter(Boolean).join(' ')
}

function inferLocationScope(note: PlanNoteInput): string | null {
  const text = noteLocationText(note)
  return locationScopes.find((scope) => scope.markers.some((marker) => text.includes(marker)))?.id ?? null
}

function coordinates(note: PlanNoteInput): { lat: number; lng: number } | null {
  if (!isRecord(note.attrs)) return null
  const lat = finiteNumber(note.attrs.lat)
  const lng = finiteNumber(note.attrs.lng)
  return lat === null || lng === null ? null : { lat, lng }
}

function distanceKilometers(left: PlanNoteInput, right: PlanNoteInput): number | null {
  const from = coordinates(left)
  const to = coordinates(right)
  if (!from || !to) return null
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(to.lat - from.lat)
  const longitudeDelta = radians(to.lng - from.lng)
  const latitude1 = radians(from.lat)
  const latitude2 = radians(to.lat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function minimumMinutesFromDistance(distance: number): number {
  if (distance < 0.2) return 0
  if (distance <= 2) return 10
  if (distance <= 10) return 20
  if (distance <= 30) return 30
  if (distance <= 80) return 60
  if (distance <= 300) return 120
  if (distance <= 800) return 180
  return 300
}

function minimumMinutesBetweenNotes(left: PlanNoteInput, right: PlanNoteInput): number {
  const distance = distanceKilometers(left, right)
  if (distance !== null) return minimumMinutesFromDistance(distance)
  const leftText = noteLocationText(left).replaceAll(/\s/g, '').toLowerCase()
  const rightText = noteLocationText(right).replaceAll(/\s/g, '').toLowerCase()
  if (leftText === rightText) return 0
  const leftScope = inferLocationScope(left)
  const rightScope = inferLocationScope(right)
  if (!leftScope || !rightScope) return travelCategoryMinimumMinutes.local
  if (leftScope === rightScope) return travelCategoryMinimumMinutes.regional
  const routeKey = [leftScope, rightScope].sort().join('|')
  const routeMinimum = routeMinimumMinutes.get(routeKey)
  if (routeMinimum) return routeMinimum
  if (!leftScope.startsWith('JP-') || !rightScope.startsWith('JP-')) return 300
  return travelCategoryMinimumMinutes.long_distance
}

function activityClusters(entries: TimedEntry[]): ActivityCluster[] {
  const parents = entries.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parents[root] !== root) root = parents[root]
    return root
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let index = 0; index < entries.length; index += 1) {
    for (let other = index + 1; other < entries.length; other += 1) {
      if (
        entries[index].slotIndex === entries[other].slotIndex ||
        overlaps(entries[index].start, entries[index].end, entries[other].start, entries[other].end)
      ) {
        union(index, other)
      }
    }
  }

  const grouped = new Map<number, TimedEntry[]>()
  for (let index = 0; index < entries.length; index += 1) {
    const root = find(index)
    const group = grouped.get(root) ?? []
    group.push(entries[index])
    grouped.set(root, group)
  }

  return [...grouped.values()]
    .map((group) => ({
      start: Math.min(...group.map((entry) => entry.start)),
      end: Math.max(...group.map((entry) => entry.end)),
      entries: group,
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
}

export function buildAlternativePlan(
  slots: GeneratedSlotInput[],
  context: PlanValidationContext,
): GeneratedSlotInput[] | null {
  const tripStart = timestamp(context.trip.starts_at)
  const tripEnd = timestamp(context.trip.ends_at)
  const activityByNote = new Map<string, GeneratedOptionInput>()
  for (const slot of slots) {
    for (const option of slot.options) {
      if (optionKind(option) === 'activity' && option.note_id && !activityByNote.has(option.note_id)) {
        activityByNote.set(option.note_id, option)
      }
    }
  }
  if (context.notes.some((note) => !activityByNote.has(note.id))) return null

  const durations = context.notes.map((note) => {
    const expected = isRecord(note.attrs) ? finiteNumber(note.attrs.duration) : null
    const source = activityByNote.get(note.id)
    const generated = source ? (timestamp(source.end_at) - timestamp(source.start_at)) / 60_000 : Number.NaN
    return Math.max(1, expected ?? (Number.isFinite(generated) && generated > 0 ? generated : 60))
  })
  const maximumActivityDuration = Math.max(...durations) * 60_000
  const generatedStarts = [...activityByNote.values()].map((option) => timestamp(option.start_at)).filter(Number.isFinite)
  const lowerBound = Number.isFinite(tripStart)
    ? tripStart
    : generatedStarts.length
      ? Math.min(...generatedStarts)
      : Date.now()
  const upperBound = Number.isFinite(tripEnd) ? tripEnd : lowerBound + 24 * 60 * 60 * 1000
  const singleDestination = context.notes.length === 1 ? context.notes[0] : null
  const origin = context.trip.origin?.trim()
  let originTravelMinutes = 0
  if (origin && singleDestination) {
    const normalizedOrigin = origin.replaceAll(/\s/g, '').toLowerCase()
    const normalizedDestination = noteLocationText(singleDestination).replaceAll(/\s/g, '').toLowerCase()
    if (!normalizedDestination.includes(normalizedOrigin) && !normalizedOrigin.includes(singleDestination.title.replaceAll(/\s/g, '').toLowerCase())) {
      originTravelMinutes = minimumMinutesBetweenNotes({ id: 'origin', title: origin }, singleDestination)
    }
  }
  const originTravelDuration = originTravelMinutes * 60_000
  const totalDuration = originTravelDuration + maximumActivityDuration
  const preferredActivityStart = generatedStarts.length ? Math.min(...generatedStarts) : lowerBound + originTravelDuration
  let start = Math.max(lowerBound, preferredActivityStart - originTravelDuration)
  const busy = context.busy_intervals
    .map((interval) => ({ start: timestamp(interval.start_at), end: timestamp(interval.end_at) }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end))
  while (start + totalDuration <= upperBound) {
    if (!busy.some((interval) => overlaps(start, start + totalDuration, interval.start, interval.end))) break
    start += 15 * 60_000
  }
  if (!Number.isFinite(start) || start + totalDuration > upperBound) return null

  const activityStart = start + originTravelDuration
  const options = context.notes.map((note, index) => {
    const source = activityByNote.get(note.id)!
    return {
      note_id: note.id,
      title: note.title,
      start_at: new Date(activityStart).toISOString(),
      end_at: new Date(activityStart + durations[index] * 60_000).toISOString(),
      kind: 'activity' as const,
      attrs: source.attrs ?? {},
      reason:
        context.notes.length === 1
          ? '出発地からの移動時間を含めて再構成しました'
          : '現実的な移動時間を含めるとすべてを順番に実行できないため、候補として比較します',
    }
  })
  const activitySlot = {
    start_at: new Date(activityStart).toISOString(),
    end_at: new Date(activityStart + maximumActivityDuration).toISOString(),
    options,
  }
  if (!origin || !singleDestination || originTravelMinutes === 0) return [activitySlot]

  const originScope = inferLocationScope({ id: 'origin', title: origin })
  const destinationScope = inferLocationScope(singleDestination)
  const international =
    originScope !== null &&
    destinationScope !== null &&
    (!originScope.startsWith('JP-') || !destinationScope.startsWith('JP-'))
  const distanceCategory: TravelCategory = international
    ? 'international'
    : originTravelMinutes >= travelCategoryMinimumMinutes.long_distance
      ? 'long_distance'
      : originTravelMinutes >= travelCategoryMinimumMinutes.regional
        ? 'regional'
        : 'local'
  const mode = distanceCategory === 'international' ? 'flight' : distanceCategory === 'long_distance' ? 'train' : 'transit'
  const travelEnd = activityStart
  const travelOption: GeneratedOptionInput = {
    note_id: null,
    title: `移動: ${origin} → ${singleDestination.title}`,
    start_at: new Date(start).toISOString(),
    end_at: new Date(travelEnd).toISOString(),
    kind: 'travel',
    attrs: {
      from_note_id: null,
      to_note_id: singleDestination.id,
      mode,
      duration_minutes: originTravelMinutes,
      distance_category: distanceCategory,
      estimated: true,
    },
    reason: '移動時間はAIによる概算です',
  }
  return [
    {
      start_at: travelOption.start_at,
      end_at: travelOption.end_at,
      options: [travelOption],
    },
    activitySlot,
  ]
}

export function validateGeneratedPlan(slots: GeneratedSlotInput[], context: PlanValidationContext): string[] {
  const errors: string[] = []
  const tripStart = timestamp(context.trip.starts_at)
  const tripEnd = timestamp(context.trip.ends_at)
  const noteMap = new Map(context.notes.map((note) => [note.id, note]))
  const noteCounts = new Map(context.notes.map((note) => [note.id, 0]))
  const entries: TimedEntry[] = []

  slots.forEach((slot, slotIndex) => {
    const slotStart = timestamp(slot.start_at)
    const slotEnd = timestamp(slot.end_at)
    if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd) || slotEnd <= slotStart) {
      errors.push(`INVALID_SLOT_TIME:${slotIndex}`)
    }
    if (Number.isFinite(tripStart) && slotStart < tripStart) errors.push(`SLOT_BEFORE_TRIP:${slotIndex}`)
    if (Number.isFinite(tripEnd) && slotEnd > tripEnd) errors.push(`SLOT_AFTER_TRIP:${slotIndex}`)

    slot.options.forEach((option, optionIndex) => {
      const start = timestamp(option.start_at)
      const end = timestamp(option.end_at)
      const entry = { slotIndex, optionIndex, option, start, end }
      entries.push(entry)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        errors.push(`INVALID_OPTION_TIME:${slotIndex}:${optionIndex}`)
        return
      }
      if (start < slotStart || end > slotEnd) errors.push(`OPTION_OUTSIDE_SLOT:${slotIndex}:${optionIndex}`)
      if (Number.isFinite(tripStart) && start < tripStart) errors.push(`OPTION_BEFORE_TRIP:${slotIndex}:${optionIndex}`)
      if (Number.isFinite(tripEnd) && end > tripEnd) errors.push(`OPTION_AFTER_TRIP:${slotIndex}:${optionIndex}`)
      if (
        optionKind(option) !== 'all_day' &&
        context.busy_intervals.some((busy) => overlaps(start, end, timestamp(busy.start_at), timestamp(busy.end_at)))
      ) {
        errors.push(`OPTION_OVERLAPS_BUSY:${slotIndex}:${optionIndex}`)
      }

      if (optionKind(option) === 'activity') {
        if (!option.note_id || !noteMap.has(option.note_id)) {
          errors.push(`INVALID_ACTIVITY_NOTE:${slotIndex}:${optionIndex}`)
        } else {
          noteCounts.set(option.note_id, (noteCounts.get(option.note_id) ?? 0) + 1)
          const note = noteMap.get(option.note_id)
          const expectedDuration = isRecord(note?.attrs) ? finiteNumber(note.attrs.duration) : null
          if (expectedDuration !== null && Math.abs(durationMinutes(entry) - expectedDuration) > 5) {
            errors.push(`ACTIVITY_DURATION_MISMATCH:${option.note_id}`)
          }
        }
      }

      if (optionKind(option) === 'travel') {
        if (option.note_id) errors.push(`TRAVEL_HAS_NOTE:${slotIndex}:${optionIndex}`)
        if (slot.options.length !== 1) errors.push(`TRAVEL_NOT_SINGLE_OPTION:${slotIndex}`)
        const attrs = isRecord(option.attrs) ? option.attrs : {}
        const category = scalarString(attrs.distance_category)
        const declaredDuration = finiteNumber(attrs.duration_minutes)
        const actualDuration = durationMinutes(entry)
        if (!category || !(category in travelCategoryMinimumMinutes)) {
          errors.push(`TRAVEL_CATEGORY_MISSING:${slotIndex}:${optionIndex}`)
        } else if (actualDuration < travelCategoryMinimumMinutes[category as TravelCategory]) {
          errors.push(`TRAVEL_TOO_SHORT:${slotIndex}:${optionIndex}`)
        }
        if (declaredDuration === null || Math.abs(actualDuration - declaredDuration) > 5) {
          errors.push(`TRAVEL_DURATION_MISMATCH:${slotIndex}:${optionIndex}`)
        }
        if (!scalarString(attrs.mode)) errors.push(`TRAVEL_MODE_MISSING:${slotIndex}:${optionIndex}`)
        if (attrs.estimated !== true) errors.push(`TRAVEL_ESTIMATE_FLAG_MISSING:${slotIndex}:${optionIndex}`)
        for (const key of ['from_note_id', 'to_note_id'] as const) {
          const noteId = attrs[key]
          if (noteId !== null && (typeof noteId !== 'string' || !noteMap.has(noteId))) {
            errors.push(`TRAVEL_${key.toUpperCase()}_INVALID:${slotIndex}:${optionIndex}`)
          }
        }
      }
    })
  })

  for (const [noteId, count] of noteCounts) {
    if (count !== 1) errors.push(`NOTE_ACTIVITY_COUNT:${noteId}:${count}`)
  }

  const timedEntries = entries.filter(
    (entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end) && optionKind(entry.option) !== 'all_day',
  )
  const travelEntries = timedEntries.filter((entry) => optionKind(entry.option) === 'travel')
  const nonTravelEntries = timedEntries.filter((entry) => optionKind(entry.option) !== 'travel')
  for (const travel of travelEntries) {
    if (
      nonTravelEntries.some((entry) => overlaps(travel.start, travel.end, entry.start, entry.end)) ||
      travelEntries.some(
        (entry) =>
          entry !== travel &&
          (entry.slotIndex < travel.slotIndex ||
            (entry.slotIndex === travel.slotIndex && entry.optionIndex < travel.optionIndex)) &&
          overlaps(travel.start, travel.end, entry.start, entry.end),
      )
    ) {
      errors.push(`TRAVEL_OVERLAP:${travel.slotIndex}:${travel.optionIndex}`)
    }
  }

  const activities = timedEntries.filter((entry) => optionKind(entry.option) === 'activity')
  const clusters = activityClusters(activities)
  const origin = context.trip.origin?.trim()
  const firstCluster = clusters[0]
  if (origin && firstCluster?.entries.length === 1) {
    const firstNoteId = firstCluster.entries[0].option.note_id
    const firstNote = firstNoteId ? noteMap.get(firstNoteId) : undefined
    const normalizedOrigin = origin.replaceAll(/\s/g, '').toLowerCase()
    const normalizedDestination = firstNote ? noteLocationText(firstNote).replaceAll(/\s/g, '').toLowerCase() : ''
    if (firstNote && !normalizedDestination.includes(normalizedOrigin) && !normalizedOrigin.includes(firstNote.title.replaceAll(/\s/g, '').toLowerCase())) {
      const requiredMinutes = minimumMinutesBetweenNotes({ id: 'origin', title: origin }, firstNote)
      const matching = travelEntries.find((entry) => {
        const attrs = isRecord(entry.option.attrs) ? entry.option.attrs : {}
        return entry.end <= firstCluster.start && attrs.from_note_id === null && attrs.to_note_id === firstNoteId
      })
      if (!matching) {
        errors.push(`MISSING_ORIGIN_TRAVEL:${firstNoteId}`)
      } else if (durationMinutes(matching) < requiredMinutes) {
        errors.push(`ORIGIN_TRAVEL_TOO_SHORT:${firstNoteId}:${requiredMinutes}`)
      }
    }
  }
  for (let index = 0; index < clusters.length - 1; index += 1) {
    const previous = clusters[index]
    const next = clusters[index + 1]
    const between = travelEntries.filter((entry) => entry.start >= previous.end && entry.end <= next.start)
    if (previous.entries.length === 1 && next.entries.length === 1) {
      const fromNoteId = previous.entries[0].option.note_id
      const toNoteId = next.entries[0].option.note_id
      const fromNote = fromNoteId ? noteMap.get(fromNoteId) : undefined
      const toNote = toNoteId ? noteMap.get(toNoteId) : undefined
      const requiredMinutes = fromNote && toNote ? minimumMinutesBetweenNotes(fromNote, toNote) : travelCategoryMinimumMinutes.local
      if (requiredMinutes === 0) continue
      const matching = between.find((entry) => {
        const attrs = isRecord(entry.option.attrs) ? entry.option.attrs : {}
        return attrs.from_note_id === fromNoteId && attrs.to_note_id === toNoteId
      })
      if (!matching) {
        errors.push(`MISSING_TRAVEL:${fromNoteId ?? 'unknown'}:${toNoteId ?? 'unknown'}`)
      } else if (durationMinutes(matching) < requiredMinutes) {
        errors.push(`TRAVEL_ROUTE_TOO_SHORT:${fromNoteId}:${toNoteId}:${requiredMinutes}`)
      }
    } else if (between.length === 0) {
      errors.push(`MISSING_TRAVEL_BETWEEN_GROUPS:${index}:${index + 1}`)
    }
  }

  return [...new Set(errors)]
}

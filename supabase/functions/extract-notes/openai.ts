// OpenAI 抽出器（LLM_PROVIDER=openai）。
// Structured Outputs（json_schema, strict）で契約スキーマを強制する。
// 必要な環境変数: OPENAI_API_KEY（LLM_MODEL は任意。既定 gpt-4o-mini）
import type { ExistingNote, IncomingMessage, NoteOperation } from './contract.ts'

const SYSTEM_PROMPT = `あなたは旅行計画のグループチャットから、付箋ボードへの操作を抽出するアシスタントです。
入力は existing_notes（現在の付箋一覧）と new_messages(未処理の発言)です。
出力は operations 配列のみです。

規則:
- 行きたい場所・やりたいこと・食べたいもの等の新しい話題 → op="add"。title は 30 文字以内の具体的な名詞句にする
- 既存付箋と同じ対象への追加情報（費用・希望時間帯・住所・所要時間など）→ op="update"。target に付箋 id、attrs に判明した属性だけを入れる
- その対象への明確な否定・撤回・中止 → op="hold"。target と reason（誰のどんな発言か簡潔に）が必須。削除という操作は存在しない
- user_touched=true の付箋を update / hold の対象にしてはならない
- すべての操作の source に根拠となる発言 id を入れる
- 挨拶・雑談・相槌・質問だけの発言からは何も生成しない
- 既存付箋と同じ対象を別の表現で再言及しただけなら、重複して add しない（確実に同一対象なら update、情報がなければ何も出さない）
- 同一対象か確信が持てない場合のみ add を選ぶ（誤った update で他人の付箋を書き換えるより、重複の方が安全）
- attrs のキーは address / lat / lng / duration / time_hint / cost のみ。値が不明なキーは null にする`

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operations'],
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'title', 'memo', 'target', 'reason', 'attrs', 'source'],
        properties: {
          op: { type: 'string', enum: ['add', 'update', 'hold'] },
          title: { type: ['string', 'null'], description: 'add のとき必須。30 文字以内' },
          memo: { type: ['string', 'null'] },
          target: { type: ['string', 'null'], description: 'update / hold のとき既存付箋の id' },
          reason: { type: ['string', 'null'], description: 'hold のとき必須' },
          attrs: {
            type: 'object',
            additionalProperties: false,
            required: ['address', 'lat', 'lng', 'duration', 'time_hint', 'cost'],
            properties: {
              address: { type: ['string', 'null'] },
              lat: { type: ['number', 'null'] },
              lng: { type: ['number', 'null'] },
              duration: { type: ['string', 'null'] },
              time_hint: { type: ['string', 'null'] },
              cost: { type: ['string', 'null'] },
            },
          },
          source: { type: 'string', description: '根拠となる発言 id' },
        },
      },
    },
  },
} as const

type RawOperation = {
  op: 'add' | 'update' | 'hold'
  title: string | null
  memo: string | null
  target: string | null
  reason: string | null
  attrs: Record<string, string | number | null>
  source: string
}

/** null 値を取り除いた attrs を返す */
function compactAttrs(attrs: RawOperation['attrs']): Record<string, string> | undefined {
  const entries = Object.entries(attrs ?? {}).filter(([, v]) => v !== null && v !== '')
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries.map(([k, v]) => [k, String(v)]))
}

export async function extractOpenAI(
  messages: IncomingMessage[],
  existingNotes: ExistingNote[],
): Promise<NoteOperation[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  const model = Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            existing_notes: existingNotes,
            new_messages: messages.map((m) => ({
              id: m.id,
              author: m.author_name,
              text: m.text,
            })),
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'note_operations', strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 300)}`)
  }

  const completion = await response.json()
  const content = completion.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty content')

  const parsed = JSON.parse(content) as { operations: RawOperation[] }
  return (parsed.operations ?? []).flatMap((raw): NoteOperation[] => {
    const attrs = compactAttrs(raw.attrs)
    if (raw.op === 'add' && raw.title) {
      return [
        {
          op: 'add',
          title: raw.title.slice(0, 60),
          memo: raw.memo ?? undefined,
          attrs,
          source: raw.source,
        },
      ]
    }
    if (raw.op === 'update' && raw.target) {
      return [{ op: 'update', target: raw.target, memo: raw.memo ?? undefined, attrs, source: raw.source }]
    }
    if (raw.op === 'hold' && raw.target && raw.reason) {
      return [{ op: 'hold', target: raw.target, reason: raw.reason, source: raw.source }]
    }
    return []
  })
}

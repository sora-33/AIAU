// 規則ベースの模擬抽出器。LLM API キー取得までのつなぎ（LLM_PROVIDER=mock）。
// 実 LLM と同じ契約（add / update / hold + source 必須）で操作を返すため、
// 差し替えてもフロント・RPC 側は変更不要。
import type { ExistingNote, IncomingMessage, NoteOperation } from './contract.ts'

const WANT_PATTERN =
  /(?:に|へ|を|で)?\s*(?:行きたい|行こう|いきたい|食べたい|たべたい|見たい|みたい|寄りたい|やりたい|したい|遊びたい)/
const CANCEL_PATTERN = /(?:やめ(?:る|よう|た)?|なしで?|キャンセル|中止|やっぱりいい|いらない)/
const COST_PATTERN = /([0-9][0-9,，]*)\s*円/

/** 発言中に既存付箋のタイトルが含まれていれば返す（保留中も対象） */
function findTargetNote(text: string, notes: ExistingNote[]): ExistingNote | undefined {
  return notes.find((n) => n.title.length >= 2 && text.includes(n.title))
}

/** 「〜に行きたい」等から対象語を取り出す */
function extractTitle(text: string): string | null {
  const match = text.match(WANT_PATTERN)
  if (!match || match.index === undefined) return null
  let head = text.slice(0, match.index).trim()
  // 文頭の相槌・接続詞と句読点以前を落とす
  const lastBreak = Math.max(head.lastIndexOf('。'), head.lastIndexOf('、'), head.lastIndexOf('！'))
  if (lastBreak >= 0) head = head.slice(lastBreak + 1).trim()
  head = head.replace(/^(?:あと|それと|じゃあ|やっぱり|私は|僕は|俺は)\s*/, '')
  if (head.length === 0 || head.length > 30) return null
  return head
}

export function extractMock(
  messages: IncomingMessage[],
  existingNotes: ExistingNote[],
): NoteOperation[] {
  const operations: NoteOperation[] = []
  // 同一バッチ内で追加した付箋タイトルも重複判定に使う
  const knownTitles = new Set(existingNotes.map((n) => n.title))

  for (const message of messages) {
    const target = findTargetNote(message.text, existingNotes)

    // 撤回（→ 保留。削除はしない）
    if (target && CANCEL_PATTERN.test(message.text)) {
      if (target.status === 'active' && !target.user_touched) {
        operations.push({
          op: 'hold',
          target: target.id,
          reason: `${message.author_name}の発言で撤回`,
          source: message.id,
        })
      }
      continue
    }

    // 既存付箋への追加情報（費用）
    const cost = message.text.match(COST_PATTERN)
    if (target && cost) {
      if (!target.user_touched) {
        operations.push({
          op: 'update',
          target: target.id,
          attrs: { cost: `${cost[1].replace(/[，,]/g, ',')}円` },
          source: message.id,
        })
      }
      continue
    }

    // 新規の行きたい場所・やりたいこと
    const title = extractTitle(message.text)
    if (title && !knownTitles.has(title)) {
      knownTitles.add(title)
      operations.push({ op: 'add', title, source: message.id })
    }
  }

  return operations
}

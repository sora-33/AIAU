// LLM 抽出器のフィクスチャテスト（screen1-requirements.md 6 章）。
// extract-notes の dry_run モードで DB に触れず抽出器だけを検証する。
//
// 使い方:
//   1. supabase start / supabase functions serve --env-file supabase/functions/.env
//   2. node scripts/llm-fixtures.mjs [--runs 3]
//
// LLM_PROVIDER=mock でも動くが、本来の目的は openai 設定後のスキーマ遵守・判定安定性の確認。
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 3

// --- フィクスチャ定義 -------------------------------------------------------
// notes: 既存付箋 / messages: 新規発言 / expect: 検証関数
const NOTE = (id, title, extra = {}) => ({ id, title, status: 'active', user_touched: false, ...extra })
const MSG = (id, text, author = 'てすと') => ({ id, text, author_name: author })

const fixtures = [
  {
    name: '① 新規の場所の列挙',
    notes: [],
    messages: [MSG('m1', '鎌倉の大仏見たいな'), MSG('m2', 'あと海鮮丼食べたい')],
    expect: (ops) =>
      ops.filter((o) => o.op === 'add').length === 2 &&
      ops.every((o) => o.op === 'add' && o.source),
  },
  {
    name: '② 既存付箋への追加情報 → update',
    notes: [NOTE('n1', '美術館')],
    messages: [MSG('m1', '美術館って入場料2000円らしいよ')],
    expect: (ops) =>
      ops.some((o) => o.op === 'update' && o.target === 'n1' && o.attrs?.cost) &&
      !ops.some((o) => o.op === 'add'),
  },
  {
    name: '③ 撤回 → hold（削除ではない）',
    notes: [NOTE('n1', 'ラーメン')],
    messages: [MSG('m1', 'ラーメンはなしでいいや')],
    expect: (ops) => ops.some((o) => o.op === 'hold' && o.target === 'n1' && o.reason),
  },
  {
    name: '④ 雑談のみ → 操作 0 件',
    notes: [NOTE('n1', '美術館')],
    messages: [MSG('m1', 'おはよー'), MSG('m2', '了解！たのしみ')],
    expect: (ops) => ops.length === 0,
  },
  {
    name: '⑤ 同じ場所の別表現 → 重複 add しない',
    notes: [NOTE('n1', '江ノ島水族館')],
    messages: [MSG('m1', '水族館いいねー、江ノ島のやつ行こう')],
    expect: (ops) => !ops.some((o) => o.op === 'add'),
  },
  {
    name: '⑥ user_touched 付箋は対象外',
    notes: [NOTE('n1', 'ラーメン', { user_touched: true })],
    messages: [MSG('m1', 'ラーメンやっぱりやめよう')],
    expect: (ops) => !ops.some((o) => (o.op === 'hold' || o.op === 'update') && o.target === 'n1'),
  },
]

// --- スキーマ検証（契約: docs/screen1-requirements.md 4 章） -----------------
function schemaOk(ops, noteIds) {
  if (!Array.isArray(ops)) return false
  return ops.every((o) => {
    if (!o.source) return false
    if (o.op === 'add') return typeof o.title === 'string' && o.title.length > 0
    if (o.op === 'update') return noteIds.has(o.target)
    if (o.op === 'hold') return noteIds.has(o.target) && typeof o.reason === 'string'
    return false
  })
}

// --- 実行 -------------------------------------------------------------------
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
await client.auth.signInAnonymously()

let provider = ''
const summary = []

for (const fixture of fixtures) {
  const noteIds = new Set(fixture.notes.map((n) => n.id))
  let pass = 0
  const failures = []
  for (let run = 1; run <= RUNS; run += 1) {
    const { data, error } = await client.functions.invoke('extract-notes', {
      body: { dry_run: true, messages: fixture.messages, notes: fixture.notes },
    })
    if (error) {
      failures.push(`run${run}: invoke error ${error.message}`)
      continue
    }
    provider = data.provider
    const ops = data.operations ?? []
    if (!schemaOk(ops, noteIds)) {
      failures.push(`run${run}: スキーマ違反 ${JSON.stringify(ops)}`)
    } else if (!fixture.expect(ops)) {
      failures.push(`run${run}: 期待不一致 ${JSON.stringify(ops)}`)
    } else {
      pass += 1
    }
  }
  summary.push({ name: fixture.name, pass, failures })
}

console.log(`\nprovider: ${provider} / 各 ${RUNS} 回実行\n`)
let totalPass = 0
let totalRuns = 0
for (const s of summary) {
  totalPass += s.pass
  totalRuns += RUNS
  console.log(`${s.pass === RUNS ? 'PASS' : 'FAIL'}  ${s.name}  (${s.pass}/${RUNS})`)
  for (const f of s.failures) console.log(`      ${f}`)
}
console.log(`\n合計: ${totalPass}/${totalRuns}`)
console.log(
  totalPass === totalRuns
    ? 'すべて安定 ✅'
    : '不安定な項目あり。プロンプトの例示追加・モデル変更・機能縮小（add のみ許可）を検討 ⚠️',
)
process.exit(totalPass === totalRuns ? 0 : 1)

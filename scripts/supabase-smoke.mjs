// ローカル Supabase の接続確認スクリプト。
// 使い方: supabase start 済みの状態で `node scripts/supabase-smoke.mjs`
// 確認内容: 匿名 Auth / create_trip・join_trip RPC / messages・notes CRUD / RLS 分離
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
let failed = 0

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

const a = createClient(url, key)
const b = createClient(url, key)

// 1. 匿名 Auth（S1-01）
const { data: authA, error: authErrA } = await a.auth.signInAnonymously()
check('匿名サインイン (ユーザー A)', !authErrA && !!authA?.user?.id, authErrA?.message)
const { error: authErrB } = await b.auth.signInAnonymously()
check('匿名サインイン (ユーザー B)', !authErrB, authErrB?.message)

// 2. create_trip RPC（旅行 + owner membership + 招待を原子的に作成）
const { data: created, error: createErr } = await a.rpc('create_trip', {
  p_title: 'スモークテスト旅行',
  p_nickname: 'テスターA',
})
check('create_trip RPC', !createErr && !!created?.trip_id && !!created?.invite_token, createErr?.message)
const tripId = created?.trip_id

// 3. messages / notes の CRUD（S1-05 相当）
const { error: msgErr } = await a.from('messages').insert({
  trip_id: tripId,
  author_id: authA.user.id,
  author_name: 'テスターA',
  text: '美術館に行きたい',
})
check('message INSERT', !msgErr, msgErr?.message)

const { data: noteRow, error: noteErr } = await a
  .from('notes')
  .insert({ trip_id: tripId, title: '美術館', origin: 'user', author_id: authA.user.id })
  .select()
  .single()
check('note INSERT', !noteErr, noteErr?.message)

const { error: moveErr } = await a.from('notes').update({ x: 120, y: 80, user_touched: true }).eq('id', noteRow?.id)
check('note UPDATE（位置保存）', !moveErr, moveErr?.message)

// 4. RLS: 未参加ユーザー B には見えない（S1-04 / RLS マトリクス）
// GRANT 拒否と区別するため「エラーなし + 0 件」を要求する
const { data: bTripsBefore, error: bTripsErr } = await b.from('trips').select('id').eq('id', tripId)
check('RLS: 未参加者に trips が見えない', !bTripsErr && (bTripsBefore ?? []).length === 0, bTripsErr?.message)
const { data: bMsgsBefore, error: bMsgsErr } = await b.from('messages').select('id').eq('trip_id', tripId)
check('RLS: 未参加者に messages が見えない', !bMsgsErr && (bMsgsBefore ?? []).length === 0, bMsgsErr?.message)

// 5. join_trip RPC（招待トークン検証 → membership 登録）
const { data: joinedTripId, error: joinErr } = await b.rpc('join_trip', {
  p_token: created?.invite_token,
  p_nickname: 'テスターB',
})
check('join_trip RPC', !joinErr && joinedTripId === tripId, joinErr?.message)

const { data: bMsgsAfter } = await b.from('messages').select('text').eq('trip_id', tripId)
check('参加後は messages が読める', (bMsgsAfter ?? []).length === 1)

// 6. 無効トークンの拒否
const { error: badJoinErr } = await b.rpc('join_trip', { p_token: 'ffff', p_nickname: 'X' })
check('無効トークンは NOT_FOUND', !!badJoinErr && badJoinErr.message.includes('NOT_FOUND'))

// 7. AI 抽出（extract-notes Edge Function、LLM_PROVIDER=mock）
async function say(client, user, name, text) {
  return client.from('messages').insert({
    trip_id: tripId,
    author_id: user,
    author_name: name,
    text,
  })
}
async function extract(client) {
  return client.functions.invoke('extract-notes', { body: { trip_id: tripId } })
}
const { data: authB } = await b.auth.getUser()

await say(a, authA.user.id, 'テスターA', 'ラーメン食べたい')
const { data: ex1, error: exErr1 } = await extract(a)
check('extract-notes: add が適用される', !exErr1 && (ex1?.applied ?? 0) >= 1, exErr1?.message)

const { data: aiNotes } = await a.from('notes').select('*').eq('trip_id', tripId).eq('origin', 'ai')
const ramen = (aiNotes ?? []).find((n) => n.title === 'ラーメン')
check('AI 付箋「ラーメン」が作成される', !!ramen)

await say(b, authB.user.id, 'テスターB', 'ラーメン 1200円らしいよ')
await extract(b)
const { data: ramenAfterCost } = await a.from('notes').select('*').eq('id', ramen?.id).single()
check('費用が既存付箋へ update される', ramenAfterCost?.attrs?.cost === '1200円',
  `attrs=${JSON.stringify(ramenAfterCost?.attrs)}`)

await say(a, authA.user.id, 'テスターA', 'ラーメンはやめよう')
await extract(a)
const { data: ramenHeld } = await a.from('notes').select('*').eq('id', ramen?.id).single()
check('撤回発言で hold（削除ではない）', ramenHeld?.status === 'held' && !!ramenHeld?.hold_reason)

// 8. undo（直近の AI 操作を取り消す）
const { data: undone, error: undoErr } = await a.rpc('undo_last_note_operation', {
  p_note_id: ramen?.id,
})
check('undo RPC', !undoErr && undone === true, undoErr?.message)
const { data: ramenUndone } = await a.from('notes').select('*').eq('id', ramen?.id).single()
check('undo で hold 前へ戻る', ramenUndone?.status === 'active')

// 9. user_touched の保護（人間が触った付箋へ AI は適用しない）
await a.from('notes').update({ user_touched: true }).eq('id', ramen?.id)
await say(a, authA.user.id, 'テスターA', 'ラーメンやっぱりいらない')
await extract(a)
const { data: ramenProtected } = await a.from('notes').select('*').eq('id', ramen?.id).single()
check('user_touched 付箋は hold されない', ramenProtected?.status === 'active')

console.log(failed === 0 ? '\nすべて PASS ✅' : `\n${failed} 件 FAIL ❌`)
process.exit(failed === 0 ? 0 : 1)

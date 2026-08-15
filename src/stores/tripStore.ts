import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Message, Note, Trip, TripMember } from '@/types'

type Status = 'idle' | 'loading' | 'ready' | 'error'

type TripState = {
  tripId: string | null
  trip: Trip | null
  members: TripMember[]
  messages: Message[]
  notes: Record<string, Note>
  status: Status
  error: string | null
  channel: RealtimeChannel | null

  enter: (tripId: string) => Promise<void>
  leave: () => void
  sendMessage: (text: string) => Promise<void>
  softDeleteMessage: (id: string) => Promise<void>
  addNote: (partial: Pick<Note, 'title'> & Partial<Note>) => Promise<void>
  updateNote: (id: string, patch: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  moveNoteLocal: (id: string, x: number, y: number) => void
  broadcastMove: (id: string, x: number, y: number) => void
  persistNotePosition: (id: string) => Promise<void>
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((item) => item.id === row.id)
  if (i === -1) return [...list, row]
  const next = [...list]
  next[i] = row
  return next
}

export const useTripStore = create<TripState>((set, get) => ({
  tripId: null,
  trip: null,
  members: [],
  messages: [],
  notes: {},
  status: 'idle',
  error: null,
  channel: null,

  async enter(tripId) {
    // 旅行切替時に旧 channel を解除し、状態を初期化する（S1-04 データ分離）
    get().leave()
    set({ tripId, status: 'loading', error: null })

    const [tripRes, membersRes, messagesRes, notesRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase.from('trip_members').select('*').eq('trip_id', tripId),
      supabase.from('messages').select('*').eq('trip_id', tripId).order('created_at'),
      supabase.from('notes').select('*').eq('trip_id', tripId),
    ])
    const err = tripRes.error ?? membersRes.error ?? messagesRes.error ?? notesRes.error
    if (err) {
      set({ status: 'error', error: err.message })
      return
    }

    const channel = supabase
      .channel(`trip:${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          const row = payload.new as Message
          set((s) => ({ messages: upsertById(s.messages, row) }))
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            set((s) => {
              const notes = { ...s.notes }
              delete notes[old.id]
              return { notes }
            })
            return
          }
          const row = payload.new as Note
          set((s) => ({ notes: { ...s.notes, [row.id]: row } }))
        },
      )
      .on('broadcast', { event: 'note-move' }, ({ payload }) => {
        // 他ユーザーのドラッグ中座標（揮発。DB は経由しない）
        const { id, x, y } = payload as { id: string; x: number; y: number }
        set((s) => (s.notes[id] ? { notes: { ...s.notes, [id]: { ...s.notes[id], x, y } } } : s))
      })
      .subscribe()

    set({
      trip: tripRes.data as Trip,
      members: membersRes.data as TripMember[],
      messages: messagesRes.data as Message[],
      notes: Object.fromEntries((notesRes.data as Note[]).map((n) => [n.id, n])),
      status: 'ready',
      channel,
    })
  },

  leave() {
    const { channel } = get()
    if (channel) supabase.removeChannel(channel)
    set({
      tripId: null,
      trip: null,
      members: [],
      messages: [],
      notes: {},
      status: 'idle',
      error: null,
      channel: null,
    })
  },

  async sendMessage(text) {
    const { tripId, members } = get()
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!tripId || !uid) return
    const nickname = members.find((m) => m.user_id === uid)?.nickname ?? '匿名ユーザー'
    const { error } = await supabase
      .from('messages')
      .insert({ trip_id: tripId, author_id: uid, author_name: nickname, text })
    if (error) throw error
  },

  async softDeleteMessage(id) {
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async addNote(partial) {
    const { tripId } = get()
    const { data: auth } = await supabase.auth.getUser()
    if (!tripId || !auth.user) return
    const { error } = await supabase.from('notes').insert({
      trip_id: tripId,
      origin: 'user',
      author_id: auth.user.id,
      x: 40 + Math.random() * 160,
      y: 40 + Math.random() * 160,
      ...partial,
    })
    if (error) throw error
  },

  async updateNote(id, patch) {
    // 人間の編集は user_touched を立てる（S1-14 保護）
    const { error } = await supabase
      .from('notes')
      .update({ ...patch, user_touched: true })
      .eq('id', id)
    if (error) throw error
  },

  async deleteNote(id) {
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) throw error
  },

  moveNoteLocal(id, x, y) {
    set((s) => (s.notes[id] ? { notes: { ...s.notes, [id]: { ...s.notes[id], x, y } } } : s))
  },

  broadcastMove(id, x, y) {
    get().channel?.send({ type: 'broadcast', event: 'note-move', payload: { id, x, y } })
  },

  async persistNotePosition(id) {
    const note = get().notes[id]
    if (!note) return
    await get().updateNote(id, { x: note.x, y: note.y })
  },
}))

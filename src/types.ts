export type Trip = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  timezone: string
  origin: string | null
  budget: number | null
  currency: string
  created_by: string
  created_at: string
  updated_at: string
}

export type TripMember = {
  trip_id: string
  user_id: string
  nickname: string
  role: 'owner' | 'member'
  joined_at: string
}

export type Message = {
  id: string
  trip_id: string
  author_id: string
  author_name: string
  text: string
  processed: boolean
  created_at: string
  deleted_at: string | null
}

export type NoteAttrs = {
  address?: string
  lat?: number
  lng?: number
  duration?: string
  time_hint?: string
  cost?: string
}

export type Note = {
  id: string
  trip_id: string
  title: string
  memo: string | null
  attrs: NoteAttrs
  origin: 'ai' | 'user'
  user_touched: boolean
  status: 'active' | 'held'
  hold_reason: string | null
  source_message_id: string | null
  author_id: string | null
  x: number
  y: number
  created_at: string
  updated_at: string
}

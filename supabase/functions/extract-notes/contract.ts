// AI 入出力契約（docs/screen1-requirements.md 4 章）
export type IncomingMessage = {
  id: string
  text: string
  author_name: string
}

export type ExistingNote = {
  id: string
  title: string
  status: 'active' | 'held'
  user_touched: boolean
}

export type NoteOperation =
  | { op: 'add'; title: string; memo?: string; attrs?: Record<string, string>; source: string }
  | { op: 'update'; target: string; attrs?: Record<string, string>; memo?: string; source: string }
  | { op: 'hold'; target: string; reason: string; source: string }

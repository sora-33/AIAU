import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NoteCard } from '@/components/NoteCard'
import { NoteEditDialog } from '@/components/NoteEditDialog'
import { useTripStore } from '@/stores/tripStore'
import type { Note } from '@/types'

export function NoteBoard() {
  const notes = useTripStore((s) => s.notes)
  const addNote = useTripStore((s) => s.addNote)
  const [editing, setEditing] = useState<Note | null>(null)

  return (
    <div className="relative h-full overflow-hidden bg-gray-50">
      <div className="absolute left-3 top-3 z-10">
        <Button size="sm" variant="outline" onClick={() => addNote({ title: '新しい付箋' })}>
          <Plus className="size-4" />
          付箋
        </Button>
      </div>
      {Object.values(notes).map((note) => (
        <NoteCard key={note.id} note={note} onEdit={setEditing} />
      ))}
      <NoteEditDialog note={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

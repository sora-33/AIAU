import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTripStore } from '@/stores/tripStore'
import type { Note } from '@/types'

export function NoteEditDialog({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const updateNote = useTripStore((s) => s.updateNote)
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setMemo(note.memo ?? '')
    }
  }, [note])

  async function handleSave() {
    if (!note || !title.trim()) return
    await updateNote(note.id, { title: title.trim(), memo: memo.trim() || null })
    onClose()
  }

  return (
    <Dialog open={note !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>付箋を編集</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500" htmlFor="note-title">
              タイトル
            </label>
            <input
              id="note-title"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500" htmlFor="note-memo">
              メモ
            </label>
            <textarea
              id="note-memo"
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

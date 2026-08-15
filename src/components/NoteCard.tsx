import { useRef } from 'react'
import { Bot, MoreVertical, Undo2, User } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTripStore } from '@/stores/tripStore'
import type { Note } from '@/types'

const BROADCAST_INTERVAL_MS = 50

export function NoteCard({ note, onEdit }: { note: Note; onEdit: (note: Note) => void }) {
  const moveNoteLocal = useTripStore((s) => s.moveNoteLocal)
  const broadcastMove = useTripStore((s) => s.broadcastMove)
  const persistNotePosition = useTripStore((s) => s.persistNotePosition)
  const updateNote = useTripStore((s) => s.updateNote)
  const deleteNote = useTripStore((s) => s.deleteNote)
  const undoLastAiOperation = useTripStore((s) => s.undoLastAiOperation)
  const dragging = useRef(false)
  const lastSent = useRef(0)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    const start = { px: e.clientX, py: e.clientY, x: note.x, y: note.y }

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const x = start.x + (ev.clientX - start.px)
      const y = Math.max(0, start.y + (ev.clientY - start.py))
      moveNoteLocal(note.id, x, y)
      const now = Date.now()
      if (now - lastSent.current >= BROADCAST_INTERVAL_MS) {
        lastSent.current = now
        broadcastMove(note.id, x, y) // ドラッグ中は broadcast のみ（S1-08）
      }
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persistNotePosition(note.id) // pointerup でのみ DB 保存
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const held = note.status === 'held'

  return (
    <div
      className={`absolute w-48 cursor-grab select-none rounded-md border bg-yellow-100 p-2 shadow-sm active:cursor-grabbing ${
        held ? 'opacity-50' : ''
      }`}
      style={{ transform: `translate(${note.x}px, ${note.y}px)`, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onEdit(note)}
    >
      <div className="flex items-start justify-between gap-1">
        <p className={`text-sm font-semibold text-gray-800 ${held ? 'line-through' : ''}`}>
          {note.title}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger
            data-no-drag
            render={
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800"
                aria-label="メニュー"
              />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-no-drag>
            <DropdownMenuItem onClick={() => onEdit(note)}>編集</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                updateNote(note.id, {
                  status: held ? 'active' : 'held',
                  hold_reason: held ? null : '手動で保留',
                })
              }
            >
              {held ? '保留を解除' : '保留にする'}
            </DropdownMenuItem>
            {note.origin === 'ai' && (
              <DropdownMenuItem
                onClick={async () => {
                  const reverted = await undoLastAiOperation(note.id)
                  toast[reverted ? 'success' : 'info'](
                    reverted ? 'AI の操作を取り消しました' : '取り消せる AI 操作がありません',
                  )
                }}
              >
                <Undo2 className="size-3.5" />
                AI の操作を取り消す
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-red-600" onClick={() => deleteNote(note.id)}>
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {note.memo && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{note.memo}</p>}
      <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
        {note.origin === 'ai' ? <Bot className="size-3" /> : <User className="size-3" />}
        {note.origin === 'ai' ? 'AI' : '手動'}
        {held && note.hold_reason && <span>・{note.hold_reason}</span>}
      </div>
    </div>
  )
}

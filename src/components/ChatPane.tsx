import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTripStore } from '@/stores/tripStore'

export function ChatPane({ myUserId }: { myUserId: string }) {
  const messages = useTripStore((s) => s.messages)
  const sendMessage = useTripStore((s) => s.sendMessage)
  const softDeleteMessage = useTripStore((s) => s.softDeleteMessage)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    try {
      await sendMessage(trimmed)
    } catch {
      toast.error('送信に失敗しました')
      setText(trimmed)
    }
  }

  return (
    <div className="flex h-full flex-col border-l bg-white">
      <div className="border-b px-4 py-2 text-sm font-semibold text-gray-700">チャット</div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className="group text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-800">{m.author_name}</span>
              <span className="text-xs text-gray-400">
                {new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(
                  new Date(m.created_at),
                )}
              </span>
              {m.author_id === myUserId && !m.deleted_at && (
                <button
                  type="button"
                  className="invisible text-gray-400 hover:text-red-500 group-hover:visible"
                  onClick={() => softDeleteMessage(m.id)}
                  aria-label="発言を削除"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
            {m.deleted_at ? (
              <p className="italic text-gray-400">削除された発言</p>
            ) : (
              <p className="whitespace-pre-wrap text-gray-700">{m.text}</p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
      >
        <input
          className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="行きたい場所ややりたいことを話す…"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" size="sm">
          送信
        </Button>
      </form>
    </div>
  )
}

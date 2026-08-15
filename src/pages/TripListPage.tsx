import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import type { Trip } from '@/types'

export function TripListPage() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<Trip[]>([])
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [nickname, setNickname] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`旅行一覧の取得に失敗: ${error.message}`)
        else setTrips(data as Trip[])
      })
  }, [])

  async function handleCreate() {
    if (!title.trim() || !nickname.trim()) return
    setCreating(true)
    const { data, error } = await supabase.rpc('create_trip', {
      p_title: title.trim(),
      p_nickname: nickname.trim(),
    })
    setCreating(false)
    if (error) {
      toast.error(`作成に失敗: ${error.message}`)
      return
    }
    const { trip_id, invite_token } = data as { trip_id: string; invite_token: string }
    // 生トークンはこの応答でしか得られないため、再表示用に保存する（MVP 割り切り）
    localStorage.setItem(`invite:${trip_id}`, invite_token)
    navigate(`/trips/${trip_id}`)
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">AIAU — マイ旅行</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          新しい旅行
        </Button>
      </div>
      {trips.length === 0 ? (
        <p className="text-sm text-gray-500">
          まだ旅行がありません。「新しい旅行」から作成するか、招待 URL から参加してください。
        </p>
      ) : (
        <ul className="space-y-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                to={`/trips/${t.id}`}
                className="block rounded-md border bg-white px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-semibold">{t.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しい旅行を作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="trip-title">
                旅行タイトル
              </label>
              <input
                id="trip-title"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: 鎌倉日帰り"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="trip-nickname">
                この旅行でのニックネーム
              </label>
              <input
                id="trip-nickname"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例: はやし"
                value={nickname}
                maxLength={30}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? '作成中…' : '作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

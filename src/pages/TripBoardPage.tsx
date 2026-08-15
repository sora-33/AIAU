import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ChatPane } from '@/components/ChatPane'
import { NoteBoard } from '@/components/NoteBoard'
import { supabase } from '@/lib/supabase'
import { useTripStore } from '@/stores/tripStore'

export function TripBoardPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const trip = useTripStore((s) => s.trip)
  const status = useTripStore((s) => s.status)
  const error = useTripStore((s) => s.error)
  const enter = useTripStore((s) => s.enter)
  const leave = useTripStore((s) => s.leave)
  const [myUserId, setMyUserId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? ''))
  }, [])

  useEffect(() => {
    if (!tripId) return
    enter(tripId)
    return () => leave() // 旅行切替・離脱時に channel を解除（S1-04）
  }, [tripId, enter, leave])

  function copyInviteUrl() {
    const token = tripId ? localStorage.getItem(`invite:${tripId}`) : null
    if (!token) {
      toast.error('この端末には招待トークンがありません（作成者の端末でコピーできます）')
      return
    }
    navigator.clipboard.writeText(`${location.origin}/join/${token}`)
    toast.success('招待 URL をコピーしました')
  }

  if (status === 'error') {
    return (
      <main className="p-6">
        <p className="text-sm text-red-600">読み込みに失敗しました: {error}</p>
        <Link to="/" className="text-sm text-blue-600 underline">
          旅行一覧へ戻る
        </Link>
      </main>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b bg-white px-4 py-2">
        <Link to="/" className="text-gray-500 hover:text-gray-800" aria-label="旅行一覧へ">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="flex-1 truncate text-sm font-bold">
          {status === 'loading' ? '読み込み中…' : (trip?.title ?? '')}
        </h1>
        <Button size="sm" variant="outline" onClick={copyInviteUrl}>
          <Link2 className="size-4" />
          招待 URL
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <NoteBoard />
        <ChatPane myUserId={myUserId} />
      </div>
    </div>
  )
}

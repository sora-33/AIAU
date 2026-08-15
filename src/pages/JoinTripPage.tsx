import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export function JoinTripPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleJoin() {
    if (!token || !nickname.trim()) return
    setJoining(true)
    const { data, error } = await supabase.rpc('join_trip', {
      p_token: token,
      p_nickname: nickname.trim(),
    })
    setJoining(false)
    if (error) {
      toast.error(
        error.message.includes('NOT_FOUND')
          ? '招待リンクが無効です（失効・期限切れの可能性）'
          : `参加に失敗: ${error.message}`,
      )
      return
    }
    navigate(`/trips/${data as string}`)
  }

  return (
    <main className="mx-auto max-w-sm p-6 pt-20">
      <h1 className="mb-1 text-xl font-bold">旅行に参加</h1>
      <p className="mb-4 text-sm text-gray-500">この旅行で使うニックネームを入力してください。</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleJoin()
        }}
      >
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="ニックネーム"
          value={nickname}
          maxLength={30}
          onChange={(e) => setNickname(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={joining}>
          {joining ? '参加中…' : '参加する'}
        </Button>
      </form>
    </main>
  )
}

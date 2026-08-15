import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { ensureAnonSession } from '@/lib/supabase'
import { JoinTripPage } from '@/pages/JoinTripPage'
import { TripBoardPage } from '@/pages/TripBoardPage'
import { TripListPage } from '@/pages/TripListPage'

type AuthState = 'connecting' | 'ready' | 'failed'

function App() {
  const [auth, setAuth] = useState<AuthState>('connecting')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    ensureAnonSession()
      .then(() => setAuth('ready'))
      .catch((e: Error) => {
        setAuth('failed')
        setDetail(e.message)
      })
  }, [])

  if (auth === 'connecting') {
    return <main className="flex min-h-screen items-center justify-center text-sm text-gray-500">Supabase に接続中…</main>
  }
  if (auth === 'failed') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold text-red-600">Supabase への接続に失敗しました</p>
        <p className="max-w-md text-xs text-gray-500">{detail}</p>
        <p className="max-w-md text-xs text-gray-500">
          .env.local の VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY と、ローカルの場合は
          `supabase start` の起動状態を確認してください。
        </p>
      </main>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TripListPage />} />
        <Route path="/join/:token" element={<JoinTripPage />} />
        <Route path="/trips/:tripId" element={<TripBoardPage />} />
      </Routes>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  )
}

export default App

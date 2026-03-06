'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function LoginPageV1_1() {
  const supabase = createClient()
  const router = useRouter()

  // URL에서 에러 파라미터 읽기
  const [loginError, setLoginError] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      const desc = params.get('desc')
      setLoginError(desc || '로그인 중 오류가 발생했어요. 다시 시도해주세요.')
    }
  }, [])

  // 이미 로그인되어 있으면 대시보드로
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push('/dashboard')
      }
    })
  }, [router, supabase])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) console.error('Login error:', error)
  }

  const handleKakaoLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) console.error('Login error:', error)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Header basePath="" />
      <div className="flex items-center justify-center px-4 py-20">
        <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-md text-center">
          <div className="text-5xl mb-4">✂️</div>
          <h1 className="text-2xl font-bold mb-2">페이퍼돌리에 오신 걸 환영해요!</h1>
          <p className="text-gray-500 mb-8">3초면 시작! 로그인하고 바로 만들어보세요</p>

          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              ⚠️ {loginError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl hover:border-pink-300 hover:shadow-md transition cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l2.85 2.22L5.84 7.93" />
            </svg>
            <span className="font-medium text-gray-700">Google로 시작하기</span>
          </button>

          <button
            onClick={handleKakaoLogin}
            className="w-full mt-3 flex items-center justify-center gap-3 px-6 py-4 bg-[#FEE500] border-2 border-[#FEE500] rounded-2xl hover:shadow-md transition cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#000000" d="M12 3C6.477 3 2 6.463 2 10.691c0 2.726 1.8 5.117 4.508 6.47-.152.552-.978 3.553-1.01 3.764 0 0-.02.166.088.23.108.063.235.013.235.013.31-.044 3.588-2.35 4.158-2.752.648.094 1.318.143 2.002.143 5.523 0 10-3.463 10-7.691S17.523 3 12 3z" />
            </svg>
            <span className="font-medium text-[#191919]">카카오로 시작하기</span>
          </button>

          <p className="mt-6 text-xs text-gray-400">
            로그인 시 이용약관 및 개인정보처리방침에 동의합니다.
          </p>
        </div>
      </div>
      <Footer  />
    </div>
  )
}

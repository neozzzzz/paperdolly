import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
// Note: auth callback needs inline createServerClient because it must
// call exchangeCodeForSession which sets cookies differently than createClient()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const searchParams = url.searchParams
  
  // X-Forwarded-Host가 있으면 실제 클라이언트 origin 사용
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = forwardedHost 
    ? `${forwardedProto}://${forwardedHost}` 
    : url.origin

  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/dashboard'

  // OAuth 에러 체크
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(`${origin}/login?error=${error}&desc=${encodeURIComponent(errorDescription || '')}`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('Exchange error:', exchangeError.message)
      return NextResponse.redirect(`${origin}/login?error=exchange&desc=${encodeURIComponent(exchangeError.message)}`)
    }

    console.log('Auth success, user:', data.user?.email)
    
    const redirectUrl = `${origin}${next}`
    return NextResponse.redirect(redirectUrl)
  }

  // code도 error도 없는 경우
  return NextResponse.redirect(`${origin}/login?error=no_code`)
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 이력 조회
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { data, error } = await supabase
    .from('paperdolly_generations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// 이력 저장
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const body = await request.json()
  const { features, style, coloringUrl, colorUrl } = body

  const { data, error } = await supabase
    .from('paperdolly_generations')
    .insert({
      user_id: user.id,
      features,
      style,
      coloring_url: coloringUrl,
      color_url: colorUrl,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { themeId, action } = await request.json()

  if (action === 'add') {
    const { error } = await supabase
      .from('paperdolly_favorites')
      .upsert({ user_id: user.id, theme_id: themeId }, { onConflict: 'user_id,theme_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('paperdolly_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('theme_id', themeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

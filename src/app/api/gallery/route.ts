import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 공개 갤러리 - 모든 사용자의 도안 (최신 50개)
export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('paperdolly_generations')
    .select('id, features, style, coloring_url, color_url, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

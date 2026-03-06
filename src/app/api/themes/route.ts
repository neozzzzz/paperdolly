import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Get active themes
  const { data: themes, error } = await supabase
    .from('paperdolly_themes')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get user favorites if logged in
  let favoriteIds: string[] = []
  if (user) {
    const { data: favs } = await supabase
      .from('paperdolly_favorites')
      .select('theme_id')
      .eq('user_id', user.id)
    favoriteIds = favs?.map(f => f.theme_id) || []
  }

  // Get user's recent generation themes to deprioritize
  let recentThemeNames: string[] = []
  if (user) {
    const { data: gens } = await supabase
      .from('paperdolly_generations')
      .select('style')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    recentThemeNames = gens?.map(g => g.style) || []
  }

  // Sort: favorites first, then non-recent, then recent (shuffle within groups)
  const shuffle = <T,>(arr: T[]) => arr.sort(() => Math.random() - 0.5)

  const favThemes = themes?.filter(t => favoriteIds.includes(t.id)) || []
  const nonFavThemes = themes?.filter(t => !favoriteIds.includes(t.id)) || []
  const nonRecent = nonFavThemes.filter(t => !recentThemeNames.includes(t.name))
  const recent = nonFavThemes.filter(t => recentThemeNames.includes(t.name))

  const sorted = [...shuffle(favThemes), ...shuffle(nonRecent), ...shuffle(recent)]

  return NextResponse.json({
    themes: sorted.map(t => ({
      ...t,
      isFavorite: favoriteIds.includes(t.id),
    })),
  })
}

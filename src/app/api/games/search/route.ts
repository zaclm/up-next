import { NextResponse, type NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { db } from '@/lib/db'
import { searchIgdb, igdbEnabled } from '@/lib/igdb'
import type { CatalogResult } from '@/lib/types'

export async function GET(request: NextRequest) {
  const me = await getMe()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [], igdb: igdbEnabled() })

  // Games already in Up Next come first, so friends end up on the same entry.
  const local = await db()<
    { id: string; igdb_id: string | null; title: string; cover_url: string | null; genres: string[]; release_year: number | null }[]
  >`
    select id, igdb_id, title, cover_url, genres, release_year
    from public.games
    where title ilike ${'%' + q.replace(/[%_]/g, '') + '%'}
    order by (lower(title) = lower(${q})) desc, length(title)
    limit 8
  `
  const results: CatalogResult[] = local.map((g) => ({
    key: `game-${g.id}`,
    igdb_id: g.igdb_id ? Number(g.igdb_id) : null,
    game_id: Number(g.id),
    title: g.title,
    cover_url: g.cover_url,
    genres: g.genres,
    release_year: g.release_year,
  }))

  let igdbError: string | null = null
  try {
    const seen = new Set(results.map((r) => r.igdb_id).filter(Boolean))
    for (const r of await searchIgdb(q)) {
      if (!seen.has(r.igdb_id)) results.push(r)
    }
  } catch (e) {
    igdbError = e instanceof Error ? e.message : 'IGDB search failed'
  }

  return NextResponse.json({ results: results.slice(0, 14), igdb: igdbEnabled(), igdbError })
}

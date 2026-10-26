import { NextResponse, type NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { db } from '@/lib/db'
import { searchIgdb, igdbEnabled } from '@/lib/igdb'
import { emptyCandidate, looserQuery, mergeCandidates, rankCandidates, type Candidate } from '@/lib/search/rank'
import { steamArt, steamCover, steamSearch, steamSuggest, type SteamHit } from '@/lib/search/steam'
import type { CatalogResult } from '@/lib/types'

// Game search: Up Next's own games, Steam and IGDB are asked at the same time, the answers
// are merged into one entry per game and ranked by how well the name matches plus how
// likely it is to be the game meant. If a source is slow or down, the others still answer.

type LocalRow = {
  id: string
  title: string
  cover_url: string | null
  genres: string[]
  release_year: number | null
  igdb_id: string | null
  steam_appid: string | null
  players: string
}

function fromSteam(hits: SteamHit[], kind: 'suggest' | 'search', offset = 0): Candidate[] {
  return hits.map((h, i) => ({
    ...emptyCandidate(h.name),
    steam_appid: h.appid,
    cover_url: steamCover(h.appid),
    cover_fallback: h.image,
    steamSuggestRank: kind === 'suggest' ? i + offset : null,
    steamSearchRank: kind === 'search' ? i + offset : null,
  }))
}

export async function GET(request: NextRequest) {
  const me = await getMe()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ results: [] })

  const loose = looserQuery(q)
  const started = Date.now()
  const [local, suggest, search, searchLoose, igdb] = await Promise.allSettled([
    db()<LocalRow[]>`select * from public.search_games(${q}, 10)`,
    steamSuggest(q),
    steamSearch(q),
    loose ? steamSearch(loose) : Promise.resolve([] as SteamHit[]),
    searchIgdb(q),
  ])

  const failed: string[] = []
  const value = <T,>(r: PromiseSettledResult<T>, name: string, empty: T): T => {
    if (r.status === 'fulfilled') return r.value
    failed.push(`${name}: ${(r.reason as Error)?.message ?? r.reason}`)
    return empty
  }

  const localC: Candidate[] = value(local, 'upnext', [] as LocalRow[]).map((g) => ({
    ...emptyCandidate(g.title),
    game_id: Number(g.id),
    igdb_id: g.igdb_id ? Number(g.igdb_id) : null,
    steam_appid: g.steam_appid ? Number(g.steam_appid) : null,
    cover_url: g.cover_url,
    genres: g.genres,
    release_year: g.release_year,
    players: Number(g.players),
  }))
  const igdbC = value(igdb, 'igdb', [] as Candidate[])
  const suggestC = fromSteam(value(suggest, 'steam-suggest', []), 'suggest')
  const searchC = fromSteam(value(search, 'steam-search', []), 'search')
  const looseC = fromSteam(value(searchLoose, 'steam-loose', []), 'search', 3)

  const ranked = rankCandidates(q, mergeCandidates([localC, igdbC, suggestC, searchC, looseC]), 12)

  // Games only Steam knows get their real cover: new games keep it at an address only
  // Steam's store service can tell us.
  const steamOnly = ranked.filter(({ c }) => c.steam_appid !== null && c.game_id === null && c.igdb_id === null)
  if (steamOnly.length) {
    try {
      const art = await steamArt(steamOnly.map(({ c }) => c.steam_appid!))
      for (const { c } of steamOnly) {
        const a = art.get(c.steam_appid!)
        if (a?.cover || a?.header) {
          c.cover_url = a.cover ?? a.header
          c.cover_fallback = a.header ?? c.cover_fallback
        }
      }
    } catch (e) {
      failed.push(`steam-art: ${(e as Error).message}`)
    }
  }
  const results: CatalogResult[] = ranked.map(({ c }) => ({
    key: c.game_id !== null ? `game-${c.game_id}` : c.igdb_id !== null ? `igdb-${c.igdb_id}` : `steam-${c.steam_appid}`,
    igdb_id: c.igdb_id,
    steam_appid: c.steam_appid,
    game_id: c.game_id,
    title: c.title,
    cover_url: c.cover_url,
    cover_fallback: c.cover_fallback,
    genres: c.genres,
    release_year: c.release_year,
    players: c.players,
    source: c.game_id !== null ? 'upnext' : c.igdb_id !== null ? 'igdb' : 'steam',
  }))

  // One line per search in the server logs, to check sources and ranking (game names only).
  console.log(
    '[search]',
    JSON.stringify({
      q,
      ms: Date.now() - started,
      counts: { upnext: localC.length, igdb: igdbC.length, suggest: suggestC.length, steam: searchC.length, loose: looseC.length },
      top: results.slice(0, 3).map((r) => r.title),
      failed,
    }),
  )

  return NextResponse.json(
    { results, igdb: igdbEnabled() },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}

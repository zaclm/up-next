import 'server-only'
import { igdbConfig } from './env'
import { emptyCandidate, igdbFragment, type Candidate } from './search/rank'

// IGDB (owned by Twitch) is the full game catalog, including games that aren't on Steam
// (Valorant, Fortnite, console games). Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET from
// https://dev.twitch.tv/console/apps. Keys stay on the server; IGDB does not allow browser calls.

let token: { value: string; expires: number } | null = null

async function getToken(clientId: string, clientSecret: string) {
  if (token && token.expires > Date.now() + 60_000) return token.value
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(4000) },
  )
  if (!res.ok) throw new Error(`Twitch token request failed (${res.status})`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 }
  return token.value
}

type IgdbGame = {
  id: number
  name: string
  cover?: { image_id: string }
  genres?: { name: string }[]
  first_release_date?: number
  total_rating_count?: number
  parent_game?: number
}

export function igdbEnabled() {
  return igdbConfig() !== null
}

const FIELDS = 'fields name,cover.image_id,genres.name,first_release_date,total_rating_count,parent_game;'

function esc(s: string) {
  return s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

async function post(path: string, body: string, retry = true): Promise<unknown> {
  const cfg = igdbConfig()!
  const access = await getToken(cfg.clientId, cfg.clientSecret)
  const res = await fetch(`https://api.igdb.com/v4/${path}`, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(4500),
    headers: { 'Client-ID': cfg.clientId, Authorization: `Bearer ${access}`, 'Content-Type': 'text/plain' },
    body,
  })
  if (res.status === 401 && retry) {
    token = null
    return post(path, body, false)
  }
  if (!res.ok) throw new Error(`IGDB ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

function toCandidate(g: IgdbGame, rank: number | null): Candidate {
  return {
    ...emptyCandidate(g.name),
    igdb_id: g.id,
    cover_url: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
    genres: (g.genres ?? []).map((x) => x.name).slice(0, 3),
    release_year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    igdbRank: rank,
    igdbRatings: g.total_rating_count ?? 0,
    igdbIsAddon: g.parent_game != null,
  }
}

/**
 * Two requests side by side: IGDB's own word search, and names containing what was typed or
 * the start of its longest word (most-rated first, for typos). Plain /games requests: the
 * combined "multiquery" form came back empty in production.
 */
export async function searchIgdb(query: string): Promise<Candidate[]> {
  if (!igdbConfig()) return []
  const q = esc(query)
  const frag = igdbFragment(query)
  const contains = frag ? `(name ~ *"${q}"* | name ~ *"${esc(frag)}"*)` : `name ~ *"${q}"*`
  const [search, named] = await Promise.allSettled([
    post('games', `search "${q}"; ${FIELDS} where version_parent = null; limit 20;`) as Promise<IgdbGame[]>,
    post('games', `${FIELDS} where ${contains} & version_parent = null; sort total_rating_count desc; limit 30;`) as Promise<IgdbGame[]>,
  ])
  if (search.status === 'rejected' && named.status === 'rejected') throw search.reason
  for (const r of [search, named]) if (r.status === 'rejected') console.error('[search] IGDB request failed:', (r.reason as Error).message)
  const out: Candidate[] = []
  if (search.status === 'fulfilled') search.value.forEach((g, i) => out.push(toCandidate(g, i)))
  if (named.status === 'fulfilled') named.value.forEach((g) => out.push(toCandidate(g, null)))
  return out
}

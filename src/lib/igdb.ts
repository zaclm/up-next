import 'server-only'
import { igdbConfig } from './env'
import type { CatalogResult } from './types'

// IGDB (owned by Twitch) is the game catalog: names, covers, genres.
// Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET from https://dev.twitch.tv/console/apps.
// Keys stay on the server; IGDB does not allow browser calls.

let token: { value: string; expires: number } | null = null

async function getToken(clientId: string, clientSecret: string) {
  if (token && token.expires > Date.now() + 60_000) return token.value
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST', cache: 'no-store' },
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
}

export function igdbEnabled() {
  return igdbConfig() !== null
}

export async function searchIgdb(query: string): Promise<CatalogResult[]> {
  const cfg = igdbConfig()
  if (!cfg) return []
  const access = await getToken(cfg.clientId, cfg.clientSecret)
  const safe = query.replace(/["\\]/g, ' ').slice(0, 80)
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Client-ID': cfg.clientId,
      Authorization: `Bearer ${access}`,
      'Content-Type': 'text/plain',
    },
    body: `search "${safe}"; fields name,cover.image_id,genres.name,first_release_date; where version_parent = null; limit 12;`,
  })
  if (!res.ok) throw new Error(`IGDB search failed (${res.status})`)
  const games = (await res.json()) as IgdbGame[]
  return games.map((g) => ({
    key: `igdb-${g.id}`,
    igdb_id: g.id,
    game_id: null,
    title: g.name,
    cover_url: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
    genres: (g.genres ?? []).map((x) => x.name).slice(0, 3),
    release_year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
  }))
}

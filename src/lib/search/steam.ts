import 'server-only'

// Steam's public store search (no key needed). Two endpoints:
//  * suggest: what the Steam search box shows while typing. It corrects typos
//    ("heldiver" -> HELLDIVERS 2) and ranks popular games first.
//  * storesearch: matches the start of words ("the fin" -> THE FINALS).
// Results are cached for a while, since people type the same few games and Steam limits
// how often one server may ask.

import { cleanSteamName, parseSuggest, type SteamHit } from './steam-parse'
export type { SteamHit }

const TTL = 15 * 60 * 1000
const cache = new Map<string, { at: number; value: SteamHit[] }>()

async function cached(key: string, load: () => Promise<SteamHit[]>) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const value = await load()
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), value })
  return value
}

async function get(url: string) {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3500),
    headers: { 'Accept-Language': 'en-US,en;q=0.8' },
  })
  if (!res.ok) throw new Error(`Steam ${new URL(url).pathname} answered ${res.status}`)
  return res
}

/** Steam's tall library art, the same shape as our covers. Not every game has one. */
export function steamCover(appid: number) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`
}
/** The wide store header, which every game has. Used when the tall art is missing. */
export function steamHeader(appid: number) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`
}

export function steamSuggest(query: string) {
  const q = query.trim().slice(0, 80)
  return cached(`s:${q.toLowerCase()}`, async () => {
    const url =
      'https://store.steampowered.com/search/suggest?f=games&cc=US&realm=1&l=english&use_store_query=1&use_search_spellcheck=1&term=' +
      encodeURIComponent(q)
    return parseSuggest(await (await get(url)).text())
  })
}

export function steamSearch(query: string) {
  const q = query.trim().slice(0, 80)
  return cached(`q:${q.toLowerCase()}`, async () => {
    const url = 'https://store.steampowered.com/api/storesearch/?l=english&cc=US&term=' + encodeURIComponent(q)
    const body = (await (await get(url)).json()) as { items?: { type: string; id: number; name: string; tiny_image?: string }[] }
    return (body.items ?? [])
      .filter((i) => i.type === 'app')
      .map((i) => ({ appid: i.id, name: cleanSteamName(i.name), image: i.tiny_image ?? null }))
  })
}

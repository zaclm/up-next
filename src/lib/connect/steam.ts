import 'server-only'
import { asUser, db } from '@/lib/db'
import { steamArt } from '@/lib/search/steam'
import { cleanSteamName } from '@/lib/search/steam-parse'
import { steamApiBase, steamApiKey, steamOpenIdUrl } from './config'
import { OWNED_GAMES_PARAMS, isValidCheck, parseFriendList, parseOwnedGames, parsePlayers, readOpenIdReturn, type Owned } from './steam-core'

async function steamGet(path: string, params: Record<string, string>) {
  const key = steamApiKey()
  if (!key) throw new Error('no-key')
  const url = `${steamApiBase()}${path}?${new URLSearchParams({ ...params, key, format: 'json' })}`
  return fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
}

/** Asks Steam to confirm a sign-in it sent back. Returns the Steam id, or a reason it failed. */
export async function verifySteamReturn(params: URLSearchParams, expectedReturnTo: string) {
  const endpoint = steamOpenIdUrl()
  const read = readOpenIdReturn(params, endpoint, expectedReturnTo)
  if (!read.ok) return read
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: read.check.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok || !isValidCheck(await res.text())) return { ok: false as const, reason: 'not-confirmed' }
  return { ok: true as const, steamId: read.steamId }
}

export async function steamPlayer(steamId: string) {
  if (!steamApiKey()) return null
  try {
    const res = await steamGet('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId })
    return res.ok ? (parsePlayers(await res.json())[0] ?? null) : null
  } catch {
    return null
  }
}

async function ownedGames(steamId: string): Promise<Owned> {
  const res = await steamGet('/IPlayerService/GetOwnedGames/v1/', { steamid: steamId, ...OWNED_GAMES_PARAMS })
  if (res.status === 401 || res.status === 403) return { status: 'private', games: [], reported: 0 }
  if (!res.ok) throw new Error(`GetOwnedGames answered ${res.status}`)
  return parseOwnedGames(await res.json(), cleanSteamName)
}

/** Steam friends' ids, or null when the friends list is private. */
async function friendIds(steamId: string): Promise<string[] | null> {
  const res = await steamGet('/ISteamUser/GetFriendList/v1/', { steamid: steamId, relationship: 'friend' })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new Error(`GetFriendList answered ${res.status}`)
  return parseFriendList(await res.json())
}

/**
 * From Steam's store, for games Up Next doesn't have a cover for yet: the real cover, and the
 * name when GetOwnedGames left it out. 20 games per request.
 */
async function storeDetails(games: { appid: number; name: string }[]) {
  const covers = new Map<number, string>()
  const names = new Map<number, string>()
  if (!games.length) return { covers, names }
  const appids = games.map((g) => g.appid)
  const have = await db()<{ steam_appid: string }[]>`
    select steam_appid from public.games where steam_appid = any(${appids}::bigint[]) and cover_url is not null`
  const known = new Set(have.map((r) => Number(r.steam_appid)))
  const wanted = games.filter((g) => !known.has(g.appid) || !g.name).map((g) => g.appid)
  const chunks: number[][] = []
  for (let i = 0; i < wanted.length; i += 20) chunks.push(wanted.slice(i, i + 20))
  for (let i = 0; i < chunks.length; i += 4) {
    const results = await Promise.allSettled(chunks.slice(i, i + 4).map((c) => steamArt(c)))
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const [appid, art] of r.value) {
        if (!known.has(appid) && (art.cover ?? art.header)) covers.set(appid, (art.cover ?? art.header)!)
        if (art.name) names.set(appid, art.name)
      }
    }
  }
  return { covers, names }
}

export type SyncResult =
  | { ok: true; status: 'ok' | 'private' | 'empty'; added: number; total: number; friends: number | null }
  | { ok: false; reason: 'no-key' | 'not-linked' | 'error' }

/** Imports the games a player owns on Steam and saves their Steam friends. */
export async function syncSteam(userId: string): Promise<SyncResult> {
  if (!steamApiKey()) return { ok: false, reason: 'no-key' }
  const [account] = await db()<{ steam_id: string }[]>`select steam_id from public.steam_accounts where user_id = ${userId}`
  if (!account) return { ok: false, reason: 'not-linked' }
  try {
    const [owned, friends, player] = await Promise.all([
      ownedGames(account.steam_id),
      friendIds(account.steam_id).catch(() => null),
      steamPlayer(account.steam_id),
    ])
    const { covers, names } = await storeDetails(owned.games)
    const payload = owned.games.map((g) => ({ ...g, name: g.name || names.get(g.appid) || '', cover_url: covers.get(g.appid) ?? null }))
    const result = await asUser(userId, async (tx) => {
      if (player?.name || player?.avatar) {
        await tx`update public.steam_accounts set persona_name = coalesce(${player.name}, persona_name),
                 avatar_url = coalesce(${player.avatar}, avatar_url) where user_id = ${userId}`
      }
      const [row] = await tx<{ r: { added: number; total: number } }[]>`
        select public.steam_sync(${tx.json(payload)}::jsonb, ${owned.status}) as r`
      let friendCount: number | null = null
      if (friends) {
        const [f] = await tx<{ n: number }[]>`select public.steam_save_friends(${friends}::text[]) as n`
        friendCount = f.n
      }
      return { ...row.r, friends: friendCount }
    })
    console.log(
      '[steam] sync',
      JSON.stringify({
        status: owned.status,
        reported: owned.reported,
        games: owned.games.length,
        unnamed: payload.filter((g) => !g.name).length,
        added: result.added,
        total: result.total,
        friends: result.friends,
      }),
    )
    return { ok: true, status: owned.status, added: result.added, total: result.total, friends: result.friends }
  } catch (e) {
    console.error('[steam] sync failed:', (e as Error).message)
    await asUser(userId, (tx) => tx`select public.steam_sync('[]'::jsonb, 'error')`).catch(() => {})
    return { ok: false, reason: 'error' }
  }
}

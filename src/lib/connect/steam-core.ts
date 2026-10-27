// Steam sign-in (OpenID 2.0) and Steam Web API answers, as plain functions so tests can load
// them. The network calls live in ./steam.ts.

export const STEAM_OPENID = 'https://steamcommunity.com/openid/login'
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'
const CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

/** Where to send the player to sign in with Steam. Steam sends them back to returnTo. */
export function openIdLoginUrl(endpoint: string, returnTo: string, realm: string) {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  })
  return `${endpoint}?${params}`
}

/**
 * Checks what Steam sent back before asking Steam to confirm it: the right endpoint, our own
 * return address, and a Steam id. Returns the Steam id and the fields to confirm, or a reason.
 */
export function readOpenIdReturn(
  params: URLSearchParams,
  endpoint: string,
  expectedReturnTo: string,
): { ok: true; steamId: string; check: URLSearchParams } | { ok: false; reason: string } {
  if (params.get('openid.mode') !== 'id_res') return { ok: false, reason: params.get('openid.mode') === 'cancel' ? 'cancelled' : 'bad-mode' }
  if (params.get('openid.op_endpoint') !== endpoint) return { ok: false, reason: 'bad-endpoint' }
  if (params.get('openid.return_to') !== expectedReturnTo) return { ok: false, reason: 'bad-return' }
  const claimed = params.get('openid.claimed_id') ?? ''
  const match = claimed.match(CLAIMED_ID)
  if (!match || params.get('openid.identity') !== claimed) return { ok: false, reason: 'bad-id' }
  const check = new URLSearchParams()
  for (const [k, v] of params) if (k.startsWith('openid.')) check.set(k, v)
  check.set('openid.mode', 'check_authentication')
  return { ok: true, steamId: match[1], check }
}

/** Steam's answer to check_authentication is key:value lines; "is_valid:true" means genuine. */
export function isValidCheck(body: string) {
  return body.split('\n').some((line) => line.trim() === 'is_valid:true')
}

export type OwnedGame = { appid: number; name: string; playtime: number; playtime_2weeks: number; last_played: number }
export type Owned = { status: 'ok' | 'private' | 'empty'; games: OwnedGame[] }

type RawOwned = {
  response?: {
    game_count?: number
    games?: { appid: number; name?: string; playtime_forever?: number; playtime_2weeks?: number; rtime_last_played?: number }[]
  }
}

/**
 * IPlayerService/GetOwnedGames. A private "Game details" setting answers with an empty
 * response (no game_count); an account with no games answers game_count: 0.
 */
export function parseOwnedGames(body: RawOwned, clean: (name: string) => string = (n) => n): Owned {
  const r = body.response ?? {}
  if (r.game_count === undefined && !r.games) return { status: 'private', games: [] }
  const games = (r.games ?? [])
    .filter((g) => Number.isSafeInteger(g.appid) && g.appid > 0 && g.name)
    .map((g) => ({
      appid: g.appid,
      name: clean(g.name!),
      playtime: Math.max(0, Math.round(g.playtime_forever ?? 0)),
      playtime_2weeks: Math.max(0, Math.round(g.playtime_2weeks ?? 0)),
      last_played: Math.max(0, Math.round(g.rtime_last_played ?? 0)),
    }))
    .filter((g) => g.name)
  return { status: games.length ? 'ok' : 'empty', games }
}

/** ISteamUser/GetFriendList: the friends' Steam ids. */
export function parseFriendList(body: { friendslist?: { friends?: { steamid?: string }[] } }) {
  return (body.friendslist?.friends ?? []).map((f) => f.steamid ?? '').filter((id) => /^\d{17}$/.test(id))
}

export type SteamPlayer = { steamId: string; name: string | null; avatar: string | null }

/** ISteamUser/GetPlayerSummaries: name and picture. */
export function parsePlayers(body: { response?: { players?: { steamid: string; personaname?: string; avatarfull?: string; avatarmedium?: string }[] } }) {
  return (body.response?.players ?? []).map(
    (p): SteamPlayer => ({ steamId: p.steamid, name: p.personaname ?? null, avatar: p.avatarmedium ?? p.avatarfull ?? null }),
  )
}

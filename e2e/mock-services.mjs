// A stand-in for Steam (sign-in + Web API) and Discord (OAuth + API) for local tests.
// It answers in the same shapes as the real services. Start it with e2e/serve.mjs.

import http from 'node:http'

export const MOCK_PORT = 3999
const HERE = `http://localhost:${MOCK_PORT}`

const day = 86400
const now = Math.floor(Date.now() / 1000)

export const steamAccounts = {
  '76561198000000001': {
    name: 'zac_steam',
    games: [
      { appid: 553850, name: 'HELLDIVERS™ 2', playtime_forever: 7200, playtime_2weeks: 300, rtime_last_played: now - 2 * day },
      { appid: 548430, name: 'Deep Rock Galactic', playtime_forever: 3000, rtime_last_played: now - 40 * day },
      { appid: 1966720, name: 'Lethal Company', playtime_forever: 1800, rtime_last_played: now - 20 * day },
      { appid: 1145350, name: 'Hades II', playtime_forever: 900, playtime_2weeks: 120, rtime_last_played: now - day },
      { appid: 620, name: 'Portal 2', playtime_forever: 30, rtime_last_played: now - 900 * day },
      { appid: 105600, name: 'Terraria', playtime_forever: 0 },
      // Like the real API: left out unless asked for with include_free_sub / skip_unvetted_apps=false
      { appid: 230410, name: 'Warframe', playtime_forever: 0, free_sub: true },
      { appid: 1364780, name: 'Street Fighter 6', playtime_forever: 600, rtime_last_played: now - 10 * day, unvetted: true },
      // Listed without a name: the store knows it
      { appid: 999999, playtime_forever: 0 },
    ],
    friends: ['76561198000000002', '76561198000000004', '76561198000000099'],
  },
  '76561198000000002': { name: 'karim_steam', games: [{ appid: 553850, name: 'HELLDIVERS™ 2', playtime_forever: 4000 }], friends: ['76561198000000001'] },
  '76561198000000004': {
    name: 'ilyas_steam',
    games: [
      { appid: 892970, name: 'Valheim', playtime_forever: 2400, playtime_2weeks: 60, rtime_last_played: now - 3 * day },
      { appid: 1145350, name: 'Hades II', playtime_forever: 120 },
    ],
    friends: ['76561198000000001'],
  },
  '76561198000000005': { name: 'private_steam', private: true, games: [], friends: null },
}

export const discordAccounts = {
  zac: { id: '100000000000000001', guilds: [
    { id: '900000000000000001', name: 'Friday Gamers', approximate_member_count: 12 },
    { id: '900000000000000002', name: 'Big Public Server', approximate_member_count: 48000 },
  ] },
  mehdi: { id: '100000000000000002', guilds: [
    { id: '900000000000000001', name: 'Friday Gamers', approximate_member_count: 12 },
    { id: '900000000000000003', name: 'Cousins', approximate_member_count: 7 },
  ] },
}

const issued = new Set()

function page(title, buttons) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:sans-serif;padding:24px"><h1>${title}</h1>${buttons
    .map(([href, label]) => `<p><a href="${href}" style="font-size:18px">${label}</a></p>`)
    .join('')}</body>`
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

async function readBody(req) {
  let data = ''
  for await (const chunk of req) data += chunk
  return data
}

export function startMock() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, HERE)
    const q = url.searchParams
    const path = url.pathname

    // ---- Steam sign-in (OpenID 2.0) ----
    if (path === '/openid/login' && req.method === 'GET') {
      const returnTo = q.get('openid.return_to')
      const buttons = Object.entries(steamAccounts).map(([id, a]) => [
        `/openid/approve?steamid=${id}&return_to=${encodeURIComponent(returnTo)}`,
        `Sign in as ${a.name}`,
      ])
      return send(res, 200, page('Steam sign-in (test)', buttons), 'text/html')
    }
    if (path === '/openid/approve') {
      const id = q.get('steamid')
      const returnTo = q.get('return_to')
      const nonce = `${new Date().toISOString()}${Math.random().toString(36).slice(2, 8)}`
      issued.add(nonce)
      const claimed = `https://steamcommunity.com/openid/id/${id}`
      const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': `${HERE}/openid/login`,
        'openid.claimed_id': claimed,
        'openid.identity': claimed,
        'openid.return_to': returnTo,
        'openid.response_nonce': nonce,
        'openid.assoc_handle': '1234567890',
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'test-signature',
      })
      res.writeHead(302, { Location: `${returnTo}${returnTo.includes('?') ? '&' : '?'}${params}` })
      return res.end()
    }
    if (path === '/openid/login' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req))
      const nonce = body.get('openid.response_nonce')
      const ok = body.get('openid.mode') === 'check_authentication' && body.get('openid.sig') === 'test-signature' && issued.delete(nonce)
      return send(res, 200, `ns:http://specs.openid.net/auth/2.0\nis_valid:${ok}\n`, 'text/plain')
    }

    // ---- Steam Web API ----
    if (path.startsWith('/I') && !q.get('key') && !path.startsWith('/IStoreBrowseService')) return send(res, 403, 'Forbidden', 'text/plain')
    if (path === '/IPlayerService/GetOwnedGames/v1/') {
      const a = steamAccounts[q.get('steamid')]
      if (!a || a.private) return send(res, 200, { response: {} })
      const games = a.games
        .filter((g) => !g.free_sub || q.get('include_free_sub') === 'true')
        .filter((g) => !g.unvetted || q.get('skip_unvetted_apps') === 'false')
        .map(({ free_sub, unvetted, ...g }) => g)
      return send(res, 200, { response: { game_count: games.length, games } })
    }
    if (path === '/ISteamUser/GetFriendList/v1/') {
      const a = steamAccounts[q.get('steamid')]
      if (!a || !a.friends) return send(res, 401, '<html>Unauthorized</html>', 'text/html')
      return send(res, 200, { friendslist: { friends: a.friends.map((steamid) => ({ steamid, relationship: 'friend', friend_since: now - 365 * day })) } })
    }
    if (path === '/ISteamUser/GetPlayerSummaries/v2/') {
      const players = (q.get('steamids') ?? '').split(',').filter((id) => steamAccounts[id])
        .map((steamid) => ({ steamid, personaname: steamAccounts[steamid].name, communityvisibilitystate: steamAccounts[steamid].private ? 1 : 3 }))
      return send(res, 200, { response: { players } })
    }
    if (path === '/IStoreBrowseService/GetItems/v1') {
      const input = JSON.parse(q.get('input_json') ?? '{}')
      const storeNames = { 999999: 'Mystery Game' }
      return send(res, 200, { response: { store_items: (input.ids ?? []).map(({ appid }) => ({ appid, ...(storeNames[appid] ? { name: storeNames[appid] } : {}) })) } })
    }

    // ---- Discord ----
    if (path === '/discord/authorize') {
      const buttons = Object.keys(discordAccounts).map((who) => [
        `/discord/approve?who=${who}&redirect_uri=${encodeURIComponent(q.get('redirect_uri'))}&state=${q.get('state')}`,
        `Authorize as ${who}`,
      ])
      buttons.push([`${q.get('redirect_uri')}?error=access_denied&state=${q.get('state')}`, 'Cancel'])
      return send(res, 200, page('Discord (test)', buttons), 'text/html')
    }
    if (path === '/discord/approve') {
      res.writeHead(302, { Location: `${q.get('redirect_uri')}?code=code-${q.get('who')}&state=${q.get('state')}` })
      return res.end()
    }
    if (path === '/discord/api/oauth2/token' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req))
      const who = (body.get('code') ?? '').replace(/^code-/, '')
      if (!discordAccounts[who] || body.get('client_secret') !== 'test-secret') return send(res, 400, { error: 'invalid_grant' })
      return send(res, 200, { access_token: `token-${who}`, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds' })
    }
    if (path === '/discord/api/oauth2/token/revoke') return send(res, 200, {})
    const who = (req.headers.authorization ?? '').replace(/^Bearer token-/, '')
    if (path === '/discord/api/users/@me') return discordAccounts[who] ? send(res, 200, { id: discordAccounts[who].id, username: who }) : send(res, 401, {})
    if (path === '/discord/api/users/@me/guilds') return discordAccounts[who] ? send(res, 200, discordAccounts[who].guilds) : send(res, 401, {})

    send(res, 404, { error: 'not found', path })
  })
  return new Promise((resolve) => server.listen(MOCK_PORT, () => resolve(server)))
}

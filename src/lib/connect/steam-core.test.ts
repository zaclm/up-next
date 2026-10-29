import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNED_GAMES_PARAMS, isValidCheck, openIdLoginUrl, parseFriendList, parseOwnedGames, readOpenIdReturn, STEAM_OPENID } from './steam-core.ts'

const RETURN = 'https://up-next-three.vercel.app/api/steam/callback?state=abc'
const ID = '76561198000000001'
const claimed = `https://steamcommunity.com/openid/id/${ID}`

function steamReturn(over: Record<string, string> = {}) {
  return new URLSearchParams({
    state: 'abc',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID,
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': RETURN,
    'openid.response_nonce': '2026-10-27T10:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'sig=',
    ...over,
  })
}

test('the Steam sign-in link asks Steam to pick the account', () => {
  const url = new URL(openIdLoginUrl(STEAM_OPENID, RETURN, 'https://up-next-three.vercel.app'))
  assert.equal(url.origin + url.pathname, STEAM_OPENID)
  assert.equal(url.searchParams.get('openid.mode'), 'checkid_setup')
  assert.equal(url.searchParams.get('openid.return_to'), RETURN)
  assert.equal(url.searchParams.get('openid.claimed_id'), 'http://specs.openid.net/auth/2.0/identifier_select')
})

test('a genuine-looking return gives the Steam id and the fields to confirm', () => {
  const r = readOpenIdReturn(steamReturn(), STEAM_OPENID, RETURN)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.steamId, ID)
  assert.equal(r.check.get('openid.mode'), 'check_authentication')
  assert.equal(r.check.get('openid.sig'), 'sig=')
  assert.equal(r.check.get('state'), null, 'only openid.* fields go back to Steam')
})

test('returns that could be forged are refused before asking Steam', () => {
  assert.deepEqual(readOpenIdReturn(steamReturn({ 'openid.op_endpoint': 'https://evil.example/openid/login' }), STEAM_OPENID, RETURN), { ok: false, reason: 'bad-endpoint' })
  assert.deepEqual(readOpenIdReturn(steamReturn({ 'openid.return_to': 'https://evil.example/cb' }), STEAM_OPENID, RETURN), { ok: false, reason: 'bad-return' })
  assert.deepEqual(readOpenIdReturn(steamReturn({ 'openid.claimed_id': 'https://evil.example/openid/id/76561198000000001' }), STEAM_OPENID, RETURN), { ok: false, reason: 'bad-id' })
  assert.deepEqual(readOpenIdReturn(steamReturn({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000002' }), STEAM_OPENID, RETURN), { ok: false, reason: 'bad-id' })
  assert.deepEqual(readOpenIdReturn(steamReturn({ 'openid.mode': 'cancel' }), STEAM_OPENID, RETURN), { ok: false, reason: 'cancelled' })
})

test('only "is_valid:true" from Steam counts as confirmed', () => {
  assert.equal(isValidCheck('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'), true)
  assert.equal(isValidCheck('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'), false)
  assert.equal(isValidCheck('<html>is_valid:true is not a line</html>'), false)
})

test('owned games: private, empty and normal answers', () => {
  assert.deepEqual(parseOwnedGames({ response: {} }), { status: 'private', games: [], reported: 0 })
  assert.deepEqual(parseOwnedGames({ response: { game_count: 0 } }), { status: 'empty', games: [], reported: 0 })
  const r = parseOwnedGames(
    {
      response: {
        game_count: 4,
        games: [
          { appid: 553850, name: 'HELLDIVERS™ 2', playtime_forever: 7200.4, playtime_2weeks: 300, rtime_last_played: 1793000000 },
          { appid: 0, name: 'bad' },
          { appid: 2403620 },
          { appid: 553850, name: 'duplicate' },
        ],
      },
    },
    (n) => n.replace('™', ''),
  )
  assert.equal(r.status, 'ok')
  assert.equal(r.reported, 4)
  assert.deepEqual(r.games, [
    { appid: 553850, name: 'HELLDIVERS 2', playtime: 7200, playtime_2weeks: 300, last_played: 1793000000 },
    { appid: 2403620, name: '', playtime: 0, playtime_2weeks: 0, last_played: 0 },
  ])
})

test('the import asks Steam for free and profile-limited games too', () => {
  assert.equal(OWNED_GAMES_PARAMS.include_free_sub, 'true')
  assert.equal(OWNED_GAMES_PARAMS.include_played_free_games, 'true')
  assert.equal(OWNED_GAMES_PARAMS.skip_unvetted_apps, 'false')
})

test('friend list keeps only real Steam ids', () => {
  assert.deepEqual(parseFriendList({ friendslist: { friends: [{ steamid: ID }, { steamid: 'x' }, {}] } }), [ID])
  assert.deepEqual(parseFriendList({}), [])
})

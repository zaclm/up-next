import 'server-only'
import { asUser } from '@/lib/db'
import { discordApiBase, discordClient } from './config'

// "Find friends from my Discord servers" (opt-in). Discord doesn't let apps read friends lists,
// so we read which servers the player is in, keep only small ones (100 members or fewer),
// and forget the Discord token straight away.

export const DISCORD_SCOPES = 'identify guilds'

type Guild = { id: string; name: string; approximate_member_count?: number }

export async function saveDiscordServers(userId: string, code: string, redirectUri: string) {
  const client = discordClient()
  if (!client) return { ok: false as const, reason: 'no-key' }
  const api = discordApiBase()
  const tokenRes = await fetch(`${api}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!tokenRes.ok) {
    console.error('[discord] token exchange answered', tokenRes.status)
    return { ok: false as const, reason: 'failed' }
  }
  const token = (await tokenRes.json()) as { access_token?: string }
  if (!token.access_token) return { ok: false as const, reason: 'failed' }
  const auth = { Authorization: `Bearer ${token.access_token}` }
  try {
    const [meRes, guildsRes] = await Promise.all([
      fetch(`${api}/users/@me`, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
      fetch(`${api}/users/@me/guilds?with_counts=true`, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
    ])
    if (!meRes.ok || !guildsRes.ok) return { ok: false as const, reason: 'failed' }
    const me = (await meRes.json()) as { id: string }
    const guilds = ((await guildsRes.json()) as Guild[]).map((g) => ({
      id: g.id,
      name: g.name,
      member_count: g.approximate_member_count ?? null,
    }))
    const saved = await asUser(userId, async (tx) => {
      const [row] = await tx<{ r: { kept: number; all: number } }[]>`
        select public.discord_save(${me.id}, ${tx.json(guilds)}::jsonb) as r`
      return row.r
    })
    console.log('[discord] servers saved', JSON.stringify(saved))
    return { ok: true as const, ...saved }
  } finally {
    // We never keep the token: hand it back to Discord.
    void fetch(`${api}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, token: token.access_token }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }
}

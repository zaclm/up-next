import { NextResponse, type NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { discordAuthorizeUrl, discordClient } from '@/lib/connect/config'
import { DISCORD_SCOPES } from '@/lib/connect/discord'
import { startState } from '@/lib/connect/state'

// "Find friends from my Discord servers": asks Discord for the list of servers you're in.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const next = searchParams.get('next') ?? '/friends'
  if (!(await getMe())) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin))
  const client = discordClient()
  if (!client) return NextResponse.redirect(new URL('/friends?discord=no-key', origin))
  const response = NextResponse.redirect(origin)
  const state = startState(response, 'upnext_discord', next)
  const url = new URL(discordAuthorizeUrl())
  url.search = new URLSearchParams({
    client_id: client.id,
    response_type: 'code',
    redirect_uri: `${origin}/api/discord/callback`,
    scope: DISCORD_SCOPES,
    state,
  }).toString()
  response.headers.set('Location', url.toString())
  return response
}

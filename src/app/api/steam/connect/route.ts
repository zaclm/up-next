import { NextResponse, type NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { steamOpenIdUrl } from '@/lib/connect/config'
import { openIdLoginUrl } from '@/lib/connect/steam-core'
import { startState } from '@/lib/connect/state'

// "Connect Steam": sends the player to Steam's own sign-in page.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const next = searchParams.get('next') ?? '/account'
  if (!(await getMe())) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin))
  const response = NextResponse.redirect(origin) // replaced below once the state exists
  const state = startState(response, 'upnext_steam', next)
  const url = openIdLoginUrl(steamOpenIdUrl(), `${origin}/api/steam/callback?state=${state}`, origin)
  response.headers.set('Location', url)
  return response
}

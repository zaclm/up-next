import { NextResponse, type NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { asUser, isPostgresError } from '@/lib/db'
import { steamPlayer, syncSteam, verifySteamReturn } from '@/lib/connect/steam'
import { finishState } from '@/lib/connect/state'

export const maxDuration = 60

// Steam sends the player back here after they sign in. We confirm it with Steam, link the
// account, import their games and friends, then go back to where they started.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const back = (next: string, result: string) => {
    const url = new URL(next, origin)
    url.searchParams.set('steam', result)
    return url
  }
  const response = NextResponse.redirect(new URL('/account', origin))
  const state = searchParams.get('state')
  const saved = finishState(request, response, 'upnext_steam', state)
  const me = await getMe()
  if (!me) return NextResponse.redirect(new URL('/login', origin))
  if (!saved) {
    response.headers.set('Location', back('/account', 'expired').toString())
    return response
  }

  const verified = await verifySteamReturn(searchParams, `${origin}/api/steam/callback?state=${state}`).catch(() => ({
    ok: false as const,
    reason: 'unreachable',
  }))
  if (!verified.ok) {
    console.log('[steam] connect refused:', verified.reason)
    response.headers.set('Location', back(saved.next, verified.reason === 'cancelled' ? 'cancelled' : 'failed').toString())
    return response
  }

  const player = await steamPlayer(verified.steamId)
  try {
    await asUser(me.id, (tx) => tx`select public.steam_link(${verified.steamId}, ${player?.name ?? null}, ${player?.avatar ?? null})`)
  } catch (e) {
    const taken = isPostgresError(e) && e.message.includes('another player')
    response.headers.set('Location', back(saved.next, taken ? 'taken' : 'failed').toString())
    return response
  }

  const sync = await syncSteam(me.id)
  const result = sync.ok ? (sync.status === 'ok' ? `imported-${sync.added}` : sync.status) : sync.reason
  response.headers.set('Location', back(saved.next, result).toString())
  return response
}

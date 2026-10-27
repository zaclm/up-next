import { NextResponse, type NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { saveDiscordServers } from '@/lib/connect/discord'
import { finishState } from '@/lib/connect/state'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const response = NextResponse.redirect(new URL('/friends', origin))
  const saved = finishState(request, response, 'upnext_discord', searchParams.get('state'))
  const me = await getMe()
  if (!me) return NextResponse.redirect(new URL('/login', origin))
  const back = (result: string) => {
    const url = new URL(saved?.next ?? '/friends', origin)
    url.searchParams.set('discord', result)
    response.headers.set('Location', url.toString())
    return response
  }
  if (!saved) return back('expired')
  const code = searchParams.get('code')
  if (!code) return back(searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed')
  const result = await saveDiscordServers(me.id, code, `${origin}/api/discord/callback`).catch((e) => {
    console.error('[discord] connect failed:', (e as Error).message)
    return { ok: false as const, reason: 'failed' }
  })
  return back(result.ok ? 'connected' : result.reason)
}

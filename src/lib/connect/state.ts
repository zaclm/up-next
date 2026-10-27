import 'server-only'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { safePath } from '@/lib/format'

// A one-time value tying "Connect Steam/Discord" to the browser that started it, so another
// site can't finish a connection on someone else's account. Kept for 10 minutes.

type Saved = { state: string; next: string }

export function startState(response: NextResponse, name: string, next: string) {
  const state = randomBytes(24).toString('hex')
  response.cookies.set(name, JSON.stringify({ state, next: safePath(next) } satisfies Saved), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !!process.env.VERCEL,
    path: '/api',
    maxAge: 600,
  })
  return state
}

export function finishState(request: NextRequest, response: NextResponse, name: string, state: string | null): Saved | null {
  response.cookies.delete({ name, path: '/api' })
  let saved: Saved
  try {
    saved = JSON.parse(request.cookies.get(name)?.value ?? '') as Saved
  } catch {
    return null
  }
  if (!state || !saved?.state || state.length !== saved.state.length) return null
  if (!timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))) return null
  return { state: saved.state, next: safePath(saved.next) }
}

import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { db } from './db'
import { authMode } from './env'
import { createSupabaseServer } from './supabase/server'
import { isLocale, type Locale } from '@/i18n/config'

export const DEV_COOKIE = 'upnext_dev_uid'

export type Me = {
  id: string
  name: string
  hue: number
  avatarUrl: string | null
  locale: Locale | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function currentUserId(): Promise<string | null> {
  if (authMode() === 'dev') {
    return (await cookies()).get(DEV_COOKIE)?.value ?? null
  }
  // Session checks read the clock, so they must run at request time, never while a page
  // is being prerendered or prefetched.
  await connection()
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** The signed-in player, or null. Read once per request. */
export const getMe = cache(async (): Promise<Me | null> => {
  const id = await currentUserId()
  if (!id || !UUID.test(id)) return null
  const rows = await db()<{ id: string; display_name: string; avatar_hue: number; avatar_url: string | null; locale: string | null }[]>`
    select id, display_name, avatar_hue, avatar_url, locale from public.profiles where id = ${id}
  `
  const p = rows[0]
  return p
    ? { id: p.id, name: p.display_name, hue: p.avatar_hue, avatarUrl: p.avatar_url, locale: isLocale(p.locale) ? p.locale : null }
    : null
})

export async function requireMe(next?: string): Promise<Me> {
  const me = await getMe()
  if (!me) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  return me
}

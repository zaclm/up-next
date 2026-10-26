import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { getMe } from '@/lib/auth'
import { DEFAULT_LOCALE, LANG_COOKIE, fromAcceptLanguage, isLocale, type Locale } from './config'
import { dictionaries, type Messages } from './messages'

/**
 * The reader's language: the one they picked on this device (cookie), else the one saved on
 * their profile, else their browser's, else English.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const picked = (await cookies()).get(LANG_COOKIE)?.value
  if (isLocale(picked)) return picked
  const me = await getMe()
  if (me?.locale) return me.locale
  return fromAcceptLanguage((await headers()).get('accept-language')) ?? DEFAULT_LOCALE
})

export type T = Messages & { locale: Locale }

export async function getT(): Promise<T> {
  const locale = await getLocale()
  return { ...dictionaries[locale], locale }
}

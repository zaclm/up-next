// Languages Up Next speaks. English is the source; French and Arabic follow it key for key.

export const LOCALES = ['en', 'fr', 'ar'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LANG_COOKIE = 'upnext_lang'

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', ar: 'العربية' }

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

/** For dates, lists and plurals. Arabic keeps Western digits (0-9), as used in Morocco. */
export function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'fr' ? 'fr-FR' : 'en-GB'
}

/** Best match from a browser's Accept-Language header. */
export function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const code = part.split(';')[0]?.trim().slice(0, 2).toLowerCase()
    if (isLocale(code)) return code
  }
  return null
}

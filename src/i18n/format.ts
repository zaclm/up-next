import { intlLocale, type Locale } from './config'

type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

/** Picks the plural form for n ("{n}" in the text becomes the number). Arabic has six forms. */
export function plural(locale: Locale, n: number, forms: Forms): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  // Exact 0/1/2 forms first where a language uses them as words ("no games", "one game").
  const text = (n === 0 && forms.zero) || forms[rule] || forms.other
  return text.replace('{n}', String(n))
}

/** "Karim, Zac and Omar" / "Karim, Zac et Omar" / "Karim وZac وOmar" */
export function joinNames(locale: Locale, names: string[]): string {
  return new Intl.ListFormat(intlLocale(locale), { style: 'long', type: 'conjunction' }).format(names)
}

/** "Oct 2026" / "oct. 2026" / "أكتوبر 2026" */
export function monthYear(locale: Locale, iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(intlLocale(locale), { month: 'short', year: 'numeric' })
}

/** "26 Oct 2026" style, for tables. */
export function dayMonthYear(locale: Locale, iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "5 minutes ago" / "il y a 5 minutes" / "قبل 5 دقائق". */
export function relativeTime(locale: Locale, iso: string | null, now: number): string {
  if (!iso) return ''
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(Math.round(seconds), 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day')
  return dayMonthYear(locale, iso)
}

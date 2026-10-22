/** 8 -> "8", 8.5 -> "8.5", null -> "–" */
export function fmtScore(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '–'
  const n = Math.round(Number(v) * 10) / 10
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Same rule as the database: After only, Before only, or 30% Before + 70% After. */
export function personalScore(before: number | null, after: number | null): number | null {
  if (after === null) return before
  if (before === null) return after
  return Math.round(3 * before + 7 * after) / 10
}

export function clampScore(v: number) {
  return Math.min(10, Math.max(1, Math.round(v * 2) / 2))
}

export function isValidScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10 && Number.isInteger(v * 2)
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function listNames(names: string[]) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function shortDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

// Only same-site paths for "next" redirects: "//host" and "/\host" would leave the site.
export function safePath(v: unknown) {
  const s = typeof v === 'string' ? v : ''
  return /^\/(?![/\\])/.test(s) && !s.includes('\\') ? s : '/'
}

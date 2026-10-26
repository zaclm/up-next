// Ranking game search results from several catalogs (Up Next itself, Steam, IGDB).
// Pure functions, no I/O, so they can be tested on their own (npm run test:search).

/**
 * The comparable form of a title. Must match public.title_key() in the database:
 * lower case, no ™ ® ©, dots and apostrophes dropped (R.E.P.O. -> repo, Baldur's -> baldurs),
 * "&" as "and", other punctuation as spaces, no leading "the".
 */
export function titleKey(t: string): string {
  const k = t
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[™®©]/g, '')
    .replace(/[.'’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const stripped = k.replace(/^the /, '')
  return stripped || k
}

const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'in', 'on', 'to', 'for'])

export function tokens(k: string) {
  return k.split(' ').filter(Boolean)
}

/** Edit distance where swapping two neighbouring letters counts as one edit. */
export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

/** True when q's letters appear in order at the start of t, with up to 2 letters skipped ("finl" in "final"). */
function skippedLetters(q: string, t: string) {
  if (q.length < 3 || q[0] !== t[0]) return false
  let j = 0
  let skipped = 0
  for (const ch of q) {
    while (j < t.length && t[j] !== ch) {
      j++
      skipped++
      if (skipped > 2) return false
    }
    if (j >= t.length) return false
    j++
  }
  return true
}

/** How well one typed word matches one word of a title, 0 to 1. */
export function wordMatch(q: string, t: string): number {
  if (q === t) return 1
  if (t.startsWith(q)) return q.length >= 2 || t.length <= 2 ? 0.9 : 0.5
  if (q.length >= 3 && skippedLetters(q, t)) return 0.85
  if (q.length < 4) return 0
  const allowed = q.length >= 8 ? 2 : 1
  let best = Infinity
  for (let k = Math.max(1, q.length - 1); k <= Math.min(t.length, q.length + 1); k++) {
    best = Math.min(best, editDistance(q, t.slice(0, k)))
  }
  if (t.length < q.length - 1) best = Math.min(best, editDistance(q, t))
  if (best <= allowed) return best === 1 ? 0.75 : 0.6
  return 0
}

/** How well a title matches what was typed, 0 to 1000. */
export function relevance(query: string, title: string): number {
  const qk = titleKey(query)
  const tk = titleKey(title)
  if (!qk || !tk) return 0
  if (tk === qk) return 1000
  if (tk.startsWith(qk)) return 900 - Math.min(150, (tk.length - qk.length) * 4)

  const qt = tokens(qk)
  const tt = tokens(tk)
  let total = 0
  let lastIndex = -1
  let inOrder = true
  let firstAtStart = false
  const used = new Set<number>()
  qt.forEach((q, qi) => {
    let best = 0
    let bestJ = -1
    tt.forEach((t, j) => {
      if (used.has(j)) return
      const s = wordMatch(q, t)
      if (s > best) {
        best = s
        bestJ = j
      }
    })
    if (bestJ >= 0) {
      used.add(bestJ)
      if (bestJ < lastIndex) inOrder = false
      lastIndex = bestJ
      if (qi === 0 && bestJ === 0) firstAtStart = true
    }
    total += STOP.has(q) ? best * 0.3 : best
  })
  const weight = qt.reduce((n, q) => n + (STOP.has(q) ? 0.3 : 1), 0)
  const coverage = weight ? total / weight : 0
  if (coverage < 0.5) return tk.includes(qk) ? 550 : 0

  const extra = tt.filter((t, j) => !used.has(j) && !STOP.has(t)).length
  let score = 700 * coverage + (firstAtStart ? 90 : 0) + (inOrder ? 40 : 0) - Math.min(140, extra * 18)
  if (tk.includes(qk)) score = Math.max(score, 600)
  return Math.round(score)
}

const ADDON =
  /\b(soundtrack|ost|dlc|season pass|pack|bundle|upgrade|artbook|art book|demo|playtest|dedicated server|sdk|costume|skin|skins|outfit|cosmetic|kit|currency|coins|supporter|wallpaper|set|expansion pass|character pass|battle pass)\b/i

/** Soundtracks, DLC packs, demos and the like: still findable, but below the game itself. */
export function looksLikeAddon(title: string, query: string) {
  const m = title.match(ADDON)
  if (!m) return false
  return !titleKey(query).split(' ').includes(m[1].toLowerCase().split(' ')[0])
}

export type Candidate = {
  title: string
  game_id: number | null
  igdb_id: number | null
  steam_appid: number | null
  cover_url: string | null
  cover_fallback: string | null
  genres: string[]
  release_year: number | null
  players: number
  steamSuggestRank: number | null
  steamSearchRank: number | null
  igdbRank: number | null
  igdbRatings: number
  igdbIsAddon: boolean
}

export function emptyCandidate(title: string): Candidate {
  return {
    title,
    game_id: null,
    igdb_id: null,
    steam_appid: null,
    cover_url: null,
    cover_fallback: null,
    genres: [],
    release_year: null,
    players: 0,
    steamSuggestRank: null,
    steamSearchRank: null,
    igdbRank: null,
    igdbRatings: 0,
    igdbIsAddon: false,
  }
}

/** Final ordering score: how well the title matches, plus how likely it's the game people mean. */
export function scoreCandidate(query: string, c: Candidate): number {
  const rel = relevance(query, c.title)
  if (rel === 0) return 0
  let s = rel
  if (c.steamSuggestRank !== null) s += Math.max(0, 140 - c.steamSuggestRank * 25)
  if (c.steamSearchRank !== null) s += Math.max(0, 100 - c.steamSearchRank * 10)
  if (c.igdbRank !== null) s += Math.max(0, 60 - c.igdbRank * 5)
  s += Math.min(150, Math.round(40 * Math.log10(1 + c.igdbRatings)))
  if (c.game_id !== null) s += Math.min(200, 60 + 40 * c.players)
  if (looksLikeAddon(c.title, query)) s -= 450
  if (c.igdbIsAddon && rel < 1000) s -= 300
  return s
}

/**
 * Merges results that are the same game (same Steam/IGDB id, or same title), keeping the
 * best of each: the Up Next row if there is one, IGDB's tidy name and cover, Steam's app id.
 */
export function mergeCandidates(groups: Candidate[][]): Candidate[] {
  const out: Candidate[] = []
  const byKey = new Map<string, Candidate>()
  const bySteam = new Map<number, Candidate>()
  const byIgdb = new Map<number, Candidate>()
  for (const group of groups) {
    for (const c of group) {
      const key = titleKey(c.title)
      let into =
        (c.steam_appid !== null ? bySteam.get(c.steam_appid) : undefined) ??
        (c.igdb_id !== null ? byIgdb.get(c.igdb_id) : undefined) ??
        byKey.get(key)
      // Two different games with the same name (e.g. two "Doom"s on IGDB) stay separate.
      if (into && ((c.igdb_id !== null && into.igdb_id !== null && c.igdb_id !== into.igdb_id) ||
          (c.steam_appid !== null && into.steam_appid !== null && c.steam_appid !== into.steam_appid))) {
        into = undefined
      }
      if (!into) {
        const fresh = { ...c }
        out.push(fresh)
        if (!byKey.has(key)) byKey.set(key, fresh)
        if (fresh.steam_appid !== null) bySteam.set(fresh.steam_appid, fresh)
        if (fresh.igdb_id !== null) byIgdb.set(fresh.igdb_id, fresh)
        continue
      }
      // The Up Next row's title wins; otherwise IGDB's (Steam's is often all caps).
      if (into.game_id === null && c.game_id !== null) into.title = c.title
      else if (into.game_id === null && into.igdb_id === null && c.igdb_id !== null) into.title = c.title
      into.game_id ??= c.game_id
      into.igdb_id ??= c.igdb_id
      into.steam_appid ??= c.steam_appid
      if (c.game_id !== null && c.cover_url) into.cover_url = c.cover_url
      else if (!into.cover_url || (into.game_id === null && c.igdb_id !== null && c.cover_url)) into.cover_url = c.cover_url ?? into.cover_url
      into.cover_fallback ??= c.cover_fallback
      if (!into.genres.length) into.genres = c.genres
      into.release_year ??= c.release_year
      into.players = Math.max(into.players, c.players)
      into.steamSuggestRank ??= c.steamSuggestRank
      into.steamSearchRank ??= c.steamSearchRank
      into.igdbRank ??= c.igdbRank
      into.igdbRatings = Math.max(into.igdbRatings, c.igdbRatings)
      into.igdbIsAddon ||= c.igdbIsAddon
      if (into.steam_appid !== null) bySteam.set(into.steam_appid, into)
      if (into.igdb_id !== null) byIgdb.set(into.igdb_id, into)
    }
  }
  return out
}

export function rankCandidates(query: string, all: Candidate[], limit = 12) {
  const scored = all
    .map((c) => ({ c, s: scoreCandidate(query, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.title.length - b.c.title.length)
  const strong = scored.filter((x) => x.s >= 450)
  return (strong.length >= 3 ? strong : scored).slice(0, limit)
}

/**
 * Looser versions of the query to find games despite a typo in the last word:
 * "the finl" -> "the fin". Steam's search matches word starts, so the shorter form
 * still brings up THE FINALS.
 */
export function looserQuery(query: string): string | null {
  const words = query.trim().split(/\s+/)
  const last = words[words.length - 1]
  if (!last || last.length < 4) return null
  words[words.length - 1] = last.slice(0, 3)
  const q = words.join(' ')
  return q.length >= 3 ? q : null
}

/** The part of the query IGDB should look for inside names: the start of its longest word. */
export function igdbFragment(query: string): string | null {
  const words = titleKey(query).split(' ').filter((w) => !STOP.has(w))
  const longest = words.sort((a, b) => b.length - a.length)[0]
  if (!longest || longest.length < 4) return null
  return longest.slice(0, longest.length >= 7 ? 4 : 3)
}

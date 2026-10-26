// Reading Steam's search answers. Kept free of server-only imports so tests can load it.

export type SteamHit = { appid: number; name: string; image: string | null }

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** "HELLDIVERS™ 2" -> "HELLDIVERS 2" */
export function cleanSteamName(name: string) {
  return decodeEntities(name).replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
}

export function parseSuggest(html: string): SteamHit[] {
  const hits: SteamHit[] = []
  for (const chunk of html.split(/<a\s/i).slice(1)) {
    const app = chunk.match(/store\.steampowered\.com\/app\/(\d+)/)
    if (!app) continue // bundles and packages
    const name = chunk.match(/class="match_name[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, '')
    if (!name) continue
    const image = chunk.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null
    hits.push({ appid: Number(app[1]), name: cleanSteamName(name), image })
  }
  return hits
}

/** One app's artwork as Steam's store service (IStoreBrowseService/GetItems) describes it. */
export type SteamAssets = {
  asset_url_format?: string
  library_capsule?: string
  header?: string
  main_capsule?: string
}

const ASSET_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/'

/**
 * Full image addresses from Steam's asset description. Newer games keep their art under a
 * hashed folder, so this is the only reliable way to get their tall cover.
 */
export function assetUrls(a: SteamAssets | undefined | null): { cover: string | null; header: string | null } {
  const fmt = a?.asset_url_format
  if (!fmt || !fmt.includes('${FILENAME}')) return { cover: null, header: null }
  const url = (file?: string) => (file ? ASSET_BASE + fmt.replace('${FILENAME}', file) : null)
  return { cover: url(a.library_capsule), header: url(a.header) ?? url(a.main_capsule) }
}

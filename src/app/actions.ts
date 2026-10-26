'use server'

import { redirect } from 'next/navigation'
import { refresh, revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { asUser, db, isPostgresError, type Tx } from '@/lib/db'
import { DEV_COOKIE, requireMe, type Me } from '@/lib/auth'
import { authMode } from '@/lib/env'
import { createSupabaseServer } from '@/lib/supabase/server'
import { isValidScore, safePath } from '@/lib/format'
import { steamArt } from '@/lib/search/steam'

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string }

function friendly(e: { code?: string; message: string }) {
  switch (e.code) {
    case '23514':
      return 'Scores go from 1 to 10 in half steps.'
    case '23505':
      return 'That already exists.'
    case '22P02':
      return 'Something in that request looks wrong.'
    default:
      return e.message
  }
}

/** Runs a change as the signed-in player and turns database refusals into messages. */
async function run<T>(fn: (tx: Tx, me: Me) => Promise<T>): Promise<Result<T>> {
  const me = await requireMe()
  try {
    const data = await asUser(me.id, (tx) => fn(tx, me))
    return { ok: true, data }
  } catch (e) {
    if (isPostgresError(e)) return { ok: false, error: friendly(e) }
    throw e
  }
}

function score(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!isValidScore(n)) throw new Error('Scores go from 1 to 10 in half steps.')
  return n
}

function ids(values: unknown[]): number[] {
  return values.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuids(values: unknown[]): string[] {
  return values.map(String).filter((v) => UUID.test(v))
}

// ----- Lists -----------------------------------------------------------------------------

export async function createList(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const res = await run((tx) => tx<{ id: string }[]>`select public.create_list(${name}) as id`)
  if (res.ok) {
    revalidatePath('/', 'layout')
    redirect(`/lists/${res.data[0].id}`)
  }
}

export async function joinList(formData: FormData): Promise<Result<null>> {
  const code = String(formData.get('code') ?? '')
  const res = await run((tx) => tx<{ id: string }[]>`select public.join_list(${code}) as id`)
  if (!res.ok) return res
  revalidatePath('/', 'layout')
  redirect(`/lists/${res.data[0].id}`)
}

export async function leaveList(listId: string) {
  const res = await run((tx) => tx`select public.leave_list(${listId}::uuid)`)
  if (res.ok) {
    revalidatePath('/', 'layout')
    redirect('/lists')
  }
  return res
}

export async function updateList(listId: string, name: string | null, playableOnly: boolean | null): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.update_list(${listId}::uuid, ${name}, ${playableOnly})`
    return null
  })
  if (res.ok) refresh()
  return res
}

export async function newInvite(listId: string): Promise<Result<string>> {
  const res = await run(async (tx) => {
    const [r] = await tx<{ code: string }[]>`select public.new_invite(${listId}::uuid) as code`
    return r.code
  })
  if (res.ok) refresh()
  return res
}

export async function linkCategory(listId: string, categoryId: number): Promise<Result<number>> {
  const res = await run(async (tx) => {
    const [r] = await tx<{ n: number }[]>`select public.link_category(${listId}::uuid, ${categoryId}::bigint) as n`
    return r.n
  })
  if (res.ok) refresh()
  return res
}

export async function unlinkCategory(listId: string, categoryId: number): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.unlink_category(${listId}::uuid, ${categoryId}::bigint)`
    return null
  })
  if (res.ok) refresh()
  return res
}

// ----- List picture and "new since your last visit" ----------------------------------------

const IMAGE_LIMIT = 400_000

/** Checks the file really is the image type it claims (by its first bytes). */
function imageType(buf: Buffer): 'image/webp' | 'image/jpeg' | 'image/png' | null {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png'
  return null
}

export async function setListImage(listId: string, formData: FormData): Promise<Result> {
  const file = formData.get('image')
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: 'Pick a picture first.' }
  if (file.size > IMAGE_LIMIT) return { ok: false, error: 'That picture is too big. Try another one.' }
  const buf = Buffer.from(await file.arrayBuffer())
  const mime = imageType(buf)
  if (!mime) return { ok: false, error: 'Use a JPG, PNG or WebP picture.' }
  const res = await run(async (tx) => {
    await tx`select public.set_list_image(${listId}::uuid, ${mime}, ${buf})`
    return null
  })
  if (res.ok) refresh()
  return res
}

export async function clearListImage(listId: string): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.clear_list_image(${listId}::uuid)`
    return null
  })
  if (res.ok) refresh()
  return res
}

/** The "Played games" switch on a list's Up next tab (saved per member, per list). */
export async function setIncludePlayed(listId: string, on: boolean): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.set_include_played(${listId}::uuid, ${on})`
    return null
  })
  if (res.ok) refresh()
  return res
}

/** Called when a member opens a list: games added before now stop counting as new. */
export async function markListSeen(listId: string): Promise<void> {
  await run(async (tx) => {
    await tx`select public.mark_list_seen(${listId}::uuid)`
    return null
  })
}

// ----- Games in lists ----------------------------------------------------------------------

export async function addGamesToLists(gameIds: number[], listIds: string[]): Promise<Result<number>> {
  const g = ids(gameIds)
  const l = uuids(listIds)
  if (!g.length || !l.length) return { ok: false, error: 'Pick at least one game and one list.' }
  const res = await run(async (tx) => {
    const [r] = await tx<{ n: number }[]>`select public.add_games_to_lists(${g}::bigint[], ${l}::uuid[]) as n`
    return r.n
  })
  if (res.ok) refresh()
  return res
}

export async function setListGameStatus(
  listId: string,
  gameId: number,
  status: 'active' | 'played' | 'hidden',
): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.set_list_game_status(${listId}::uuid, ${gameId}::bigint, ${status})`
    return null
  })
  if (res.ok) refresh()
  return res
}

export async function removeListGame(listId: string, gameId: number) {
  const res = await run((tx) => tx`select public.remove_list_game(${listId}::uuid, ${gameId}::bigint)`)
  if (res.ok) redirect(`/lists/${listId}`)
  return res
}

// ----- Scores and library --------------------------------------------------------------------

export async function saveScore(input: {
  gameId: number
  before: number | null
  after: number | null
  canPlay: boolean
}): Promise<Result> {
  let before: number | null
  let after: number | null
  try {
    before = score(input.before)
    after = score(input.after)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  if (before === null && after === null) return { ok: false, error: 'Give it a Before or an After score.' }
  const res = await run(async (tx) => {
    await tx`select public.save_score(${input.gameId}::bigint, ${before}::numeric, ${after}::numeric, ${input.canPlay})`
    return null
  })
  if (res.ok) refresh()
  return res
}

const COVER_HOSTS = /^(images\.igdb\.com|[a-z0-9-]+\.(akamai|fastly|cloudflare)\.steamstatic\.com|shared\.steamstatic\.com|steamcdn-a\.akamaihd\.net)$/

/** Only covers from the game catalogs we use (or the sample covers when developing). */
function allowedCover(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/dev-covers/')) return url
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && COVER_HOSTS.test(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * A cover that loads, checked once before it is saved for everyone. Steam picks are looked up
 * in Steam's store service when the address we have doesn't answer (new games keep their art
 * at addresses only that service knows).
 */
async function workingCover(url: string | null, fallback: string | null, steamAppid: number | null): Promise<string | null> {
  const ok = async (u: string | null) => {
    if (!u) return false
    if (!/steamstatic\.com|akamaihd\.net/.test(u)) return true
    try {
      return (await fetch(u, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(2500) })).ok
    } catch {
      return false
    }
  }
  if (await ok(url)) return url
  if (steamAppid) {
    try {
      const a = (await steamArt([steamAppid])).get(steamAppid)
      const best = allowedCover(a?.cover ?? null) ?? allowedCover(a?.header ?? null)
      if (best) return best
    } catch {
      // fall through
    }
  }
  return (await ok(fallback)) ? fallback : null
}

export async function addGameToLibrary(input: {
  gameId: number | null
  igdbId: number | null
  steamAppid?: number | null
  title: string
  coverUrl: string | null
  coverFallback?: string | null
  genres: string[]
  releaseYear: number | null
  before: number | null
  canPlay: boolean
  categoryIds: number[]
  newCategories: string[]
  listIds: string[]
}): Promise<Result<number>> {
  let before: number | null
  try {
    before = score(input.before)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  if (before === null) return { ok: false, error: 'Give it a Before score (how hyped are you?).' }
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'A game needs a name.' }
  const steamAppid = Number.isSafeInteger(input.steamAppid) && input.steamAppid! > 0 ? input.steamAppid! : null
  const coverUrl = await workingCover(allowedCover(input.coverUrl), allowedCover(input.coverFallback ?? null), steamAppid)

  const res = await run(async (tx) => {
    let gameId = input.gameId
    if (gameId) {
      // A game already in Up Next: fill in a missing cover or catalog id from this pick.
      await tx`select public.fill_game_details(${gameId}::bigint, ${coverUrl}, ${input.igdbId}::bigint, ${steamAppid}::bigint)`
    } else {
      const [g] = await tx<{ id: string }[]>`
        select public.upsert_game(${title}, ${input.igdbId}::bigint, ${coverUrl},
          ${input.genres.slice(0, 5).map(String)}::text[], ${input.releaseYear}::smallint, ${steamAppid}::bigint) as id`
      gameId = Number(g.id)
    }
    await tx`select public.save_score(${gameId}::bigint, ${before}::numeric, null, ${input.canPlay})`
    const cats = ids(input.categoryIds)
    for (const name of input.newCategories.map((n) => n.trim()).filter(Boolean).slice(0, 5)) {
      const [c] = await tx<{ id: string }[]>`select public.create_category(${name}) as id`
      cats.push(Number(c.id))
    }
    await tx`select public.set_game_categories(${gameId}::bigint, ${cats}::bigint[])`
    const lists = uuids(input.listIds)
    if (lists.length) await tx`select public.add_games_to_lists(${[gameId]}::bigint[], ${lists}::uuid[])`
    return gameId
  })
  if (res.ok) refresh()
  return res
}

export async function setGameCategories(gameId: number, categoryIds: number[], newCategories: string[] = []): Promise<Result> {
  const res = await run(async (tx) => {
    const cats = ids(categoryIds)
    for (const name of newCategories.map((n) => n.trim()).filter(Boolean).slice(0, 5)) {
      const [c] = await tx<{ id: string }[]>`select public.create_category(${name}) as id`
      cats.push(Number(c.id))
    }
    await tx`select public.set_game_categories(${gameId}::bigint, ${cats}::bigint[])`
    return null
  })
  if (res.ok) refresh()
  return res
}

export async function createCategory(name: string): Promise<Result<number>> {
  const res = await run(async (tx) => {
    const [c] = await tx<{ id: string }[]>`select public.create_category(${name}) as id`
    return Number(c.id)
  })
  if (res.ok) refresh()
  return res
}

export async function deleteCategory(categoryId: number): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.delete_category(${categoryId}::bigint)`
    return null
  })
  if (res.ok) refresh()
  return res
}

export async function removeFromLibrary(gameId: number) {
  const res = await run((tx) => tx`select public.remove_from_library(${gameId}::bigint)`)
  if (res.ok) redirect('/library')
  return res
}

export async function updateProfileName(formData: FormData): Promise<Result> {
  const name = String(formData.get('name') ?? '').trim()
  const res = await run(async (tx) => {
    await tx`select public.update_profile(${name})`
    return null
  })
  if (res.ok) refresh()
  return res
}

// ----- Sign in / out -----------------------------------------------------------------------------

const safeNext = safePath

async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function signInWithDiscord(formData: FormData) {
  const supabase = await createSupabaseServer()
  const next = safeNext(formData.get('next'))
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, scopes: 'identify email' },
  })
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? 'Discord sign-in failed')}`)
  redirect(data.url)
}

export async function signInWithPassword(_: unknown, formData: FormData): Promise<Result<string>> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  })
  if (error) return { ok: false, error: error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message }
  redirect(safeNext(formData.get('next')))
}

export async function signUpWithPassword(_: unknown, formData: FormData): Promise<Result<string>> {
  const supabase = await createSupabaseServer()
  const name = String(formData.get('name') ?? '').trim()
  const next = safeNext(formData.get('next'))
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
    options: {
      data: { display_name: name },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })
  if (error) return { ok: false, error: error.message }
  if (!data.session) return { ok: true, data: 'Check your email to confirm your account, then sign in.' }
  redirect(next)
}

export async function signOut() {
  if (authMode() === 'dev') {
    ;(await cookies()).delete(DEV_COOKIE)
  } else {
    const supabase = await createSupabaseServer()
    await supabase.auth.signOut()
  }
  redirect('/login')
}

// Local testing only: switch between sample players.
export async function devSignIn(formData: FormData) {
  if (authMode() !== 'dev') throw new Error('Not available')
  const id = String(formData.get('userId') ?? '')
  if (!UUID.test(id)) redirect('/login')
  ;(await cookies()).set(DEV_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect(safeNext(formData.get('next')))
}

export async function devCreatePlayer(formData: FormData) {
  if (authMode() !== 'dev') throw new Error('Not available')
  const name = String(formData.get('name') ?? '').trim().slice(0, 40)
  if (!name) redirect('/login')
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${Date.now()}@upnext.local`
  const [u] = await db()<{ id: string }[]>`
    insert into auth.users (email, raw_user_meta_data) values (${email}, ${db().json({ display_name: name })})
    returning id`
  ;(await cookies()).set(DEV_COOKIE, u.id, { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect(safeNext(formData.get('next')))
}

'use server'

import { redirect } from 'next/navigation'
import { refresh, revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { asUser, db, isPostgresError, type Tx } from '@/lib/db'
import { DEV_COOKIE, getMe, requireMe, type Me } from '@/lib/auth'
import { authMode } from '@/lib/env'
import { createSupabaseServer } from '@/lib/supabase/server'
import { isValidScore, safePath } from '@/lib/format'
import { steamArt } from '@/lib/search/steam'
import { sendAfterReminders, sendInviteEmail } from '@/lib/email'
import { syncSteam } from '@/lib/connect/steam'
import { after } from 'next/server'
import { getT } from '@/i18n/server'
import { LANG_COOKIE, isLocale } from '@/i18n/config'
import type { Messages } from '@/i18n/messages'

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string }

type ErrorKey = { [K in keyof Messages['errors']]: Messages['errors'][K] extends string ? K : never }[keyof Messages['errors']]

/** The database's refusals, by their (English) message, in the reader's language. */
const SQL_MESSAGES: Record<string, ErrorKey> = {
  'A game needs a name': 'needName',
  'Category not found': 'categoryNotFound',
  'Game not found in this list': 'gameNotInList',
  'Game not found': 'gameNotFound',
  'Give it a Before or an After score': 'giveScore',
  'List not found': 'listNotFound',
  'Only the list creator can bring this game back': 'creatorBringBack',
  'Only the person who added it can remove it': 'adderOnly',
  'Only the person who created the list can change this': 'creatorOnly',
  'Only the person who created the list can hide games': 'creatorHide',
  'Sign in first': 'signInFirst',
  "That invite code doesn't match a list": 'badInvite',
  'Unknown status': 'unknownStatus',
  'Unknown language': 'badRequest',
  'Bad request': 'badRequest',
  'Connect Steam first': 'connectSteamFirst',
  'That Steam account is already connected to another player': 'steamTaken',
  'You can only invite friends you can see here': 'cantInvite',
}

async function fail(key: ErrorKey): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getT()).errors[key] }
}

async function friendly(e: { code?: string; message: string }) {
  const t = (await getT()).errors
  switch (e.code) {
    case '23514':
      return t.scoreRange
    case '23505':
      return t.exists
    case '22P02':
      return t.badRequest
    default: {
      const key = SQL_MESSAGES[e.message]
      return key ? t[key] : e.message
    }
  }
}

/** Runs a change as the signed-in player and turns database refusals into messages. */
async function run<T>(fn: (tx: Tx, me: Me) => Promise<T>): Promise<Result<T>> {
  const me = await requireMe()
  try {
    const data = await asUser(me.id, (tx) => fn(tx, me))
    return { ok: true, data }
  } catch (e) {
    if (isPostgresError(e)) return { ok: false, error: await friendly(e) }
    throw e
  }
}

function score(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!isValidScore(n)) throw new RangeError('score')
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
  if (!(file instanceof Blob) || file.size === 0) return fail('pickPicture')
  if (file.size > IMAGE_LIMIT) return fail('pictureTooBig')
  const buf = Buffer.from(await file.arrayBuffer())
  const mime = imageType(buf)
  if (!mime) return fail('pictureType')
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

/** "Didn't play": stop asking for an After score on a game the group played without you. */
export async function skipAfter(listId: string, gameId: number): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.skip_after(${listId}::uuid, ${gameId}::bigint)`
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
  if (!g.length || !l.length) return fail('pickGameAndList')
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
  const res = await run(async (tx, me) => {
    await tx`select public.set_list_game_status(${listId}::uuid, ${gameId}::bigint, ${status})`
    return me.id
  })
  if (!res.ok) return res
  refresh()
  if (status === 'played') {
    const actor = res.data
    // Emails go out after the response, so marking a game played stays instant.
    after(() => sendAfterReminders(listId, gameId, actor).catch((e) => console.error('[email]', (e as Error).message)))
  }
  return { ok: true, data: null }
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
  } catch {
    return fail('scoreRange')
  }
  if (before === null && after === null) return fail('giveScore')
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
  } catch {
    return fail('scoreRange')
  }
  if (before === null) return fail('giveBefore')
  const title = input.title.trim()
  if (!title) return fail('needName')
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

/** Account → Email reminders. */
export async function setEmailReminders(on: boolean): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.set_email_reminders(${on})`
    return null
  })
  if (res.ok) refresh()
  return res
}

// ----- Steam, Discord, friends ----------------------------------------------------------------

/** Account → Steam → Sync again. */
export async function syncSteamNow(): Promise<Result<{ status: string; added: number; total: number }>> {
  const me = await requireMe()
  const res = await syncSteam(me.id)
  refresh()
  if (!res.ok) return { ok: false, error: (await getT()).steam.syncFailed[res.reason] }
  return { ok: true, data: { status: res.status, added: res.added, total: res.total } }
}

export async function disconnectSteam(): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.steam_unlink()`
    return null
  })
  if (res.ok) refresh()
  return res
}

export async function disconnectDiscord(): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.discord_unlink()`
    return null
  })
  if (res.ok) refresh()
  return res
}

/** To score → Played on Steam → Not now. */
export async function skipSteamNudge(gameId: number): Promise<Result> {
  const res = await run(async (tx) => {
    await tx`select public.skip_steam_nudge(${gameId}::bigint)`
    return null
  })
  if (res.ok) refresh()
  return res
}

/** Find friends → Invite to a list. Emails them too, when emails are set up and they keep them on. */
export async function inviteToList(listId: string, userId: string): Promise<Result<boolean>> {
  if (!UUID.test(listId) || !UUID.test(userId)) return fail('badRequest')
  const res = await run(async (tx, me) => {
    const [row] = await tx<{ ok: boolean }[]>`select public.invite_to_list(${listId}::uuid, ${userId}::uuid) as ok`
    return { sent: row.ok, from: me.id }
  })
  if (!res.ok) return res
  if (res.data.sent) {
    const from = res.data.from
    after(() => sendInviteEmail(listId, userId, from).catch((e) => console.error('[email]', (e as Error).message)))
  }
  refresh()
  return { ok: true, data: res.data.sent }
}

/** Lists → an invite → Join (true) or No thanks (false). */
export async function answerInvite(listId: string, accept: boolean): Promise<Result> {
  if (!UUID.test(listId)) return fail('badRequest')
  const res = await run(async (tx) => {
    await tx`select public.answer_invite(${listId}::uuid, ${accept})`
    return null
  })
  if (!res.ok) return res
  revalidatePath('/', 'layout')
  if (accept) redirect(`/lists/${listId}`)
  return res
}

// ----- Language ------------------------------------------------------------------------------

/** The app's language: kept on this device for a year, and on the profile for other devices. */
export async function setLanguage(locale: string): Promise<void> {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LANG_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const me = await getMe()
  if (me) {
    try {
      await asUser(me.id, (tx) => tx`select public.set_locale(${locale})`)
    } catch (e) {
      // The device keeps the choice even if the profile can't be updated right now.
      console.error('[set-locale]', (e as Error).message)
    }
  }
  revalidatePath('/', 'layout')
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
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? (await getT()).errors.discordFailed)}`)
  redirect(data.url)
}

export async function signInWithPassword(_: unknown, formData: FormData): Promise<Result<string>> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  })
  if (error) return error.message === 'Invalid login credentials' ? fail('wrongPassword') : { ok: false, error: error.message }
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
  if (!data.session) return { ok: true, data: (await getT()).errors.checkEmail }
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

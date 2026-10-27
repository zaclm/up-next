import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { asUser, isPostgresError } from './db'
import { requireMe } from './auth'
import type { Board, Connections, FriendSuggestion, Library, ListGame, ListInvite, ListSummary, QueueItem, SteamNudge } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Turns database errors into the right page outcome (404 or sign-in). */
async function read<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isPostgresError(e)) {
      if (e.code === 'P0002') notFound()
      if (e.code === '28000') redirect('/login')
    }
    throw e
  }
}

export async function getBoard(listId: string): Promise<Board> {
  if (!UUID.test(listId)) notFound()
  const me = await requireMe(`/lists/${listId}`)
  return read(() =>
    asUser(me.id, async (tx) => {
      const [row] = await tx<{ b: Board }[]>`select public.list_board(${listId}::uuid) as b`
      return row.b
    }),
  )
}

export async function getListGame(listId: string, gameId: string): Promise<ListGame> {
  if (!UUID.test(listId) || !/^\d+$/.test(gameId)) notFound()
  const me = await requireMe()
  return read(() =>
    asUser(me.id, async (tx) => {
      const [row] = await tx<{ g: ListGame }[]>`select public.list_game(${listId}::uuid, ${gameId}::bigint) as g`
      return row.g
    }),
  )
}

export async function getMyLists(): Promise<ListSummary[]> {
  const me = await requireMe()
  return read(() =>
    asUser(me.id, async (tx) => {
      const [row] = await tx<{ l: ListSummary[] }[]>`select public.my_lists() as l`
      return row.l
    }),
  )
}

export async function getQueue(): Promise<QueueItem[]> {
  const me = await requireMe()
  return read(() =>
    asUser(me.id, async (tx) => {
      const [row] = await tx<{ q: QueueItem[] }[]>`select public.score_queue() as q`
      return row.q
    }),
  )
}

export async function getLibrary(): Promise<Library> {
  const me = await requireMe()
  return read(() =>
    asUser(me.id, async (tx) => {
      const [row] = await tx<{ l: Library }[]>`select public.my_library() as l`
      return row.l
    }),
  )
}

/** Runs one read-only database function as the signed-in player and returns its value. */
async function mine<T>(query: (tx: Parameters<Parameters<typeof asUser>[1]>[0]) => Promise<{ v: T }[]>): Promise<T> {
  const me = await requireMe()
  return read(() => asUser(me.id, async (tx) => (await query(tx))[0].v))
}

export const getConnections = () => mine<Connections>((tx) => tx`select public.my_connections() as v`)
export const getSteamNudges = () => mine<SteamNudge[]>((tx) => tx`select public.steam_nudges() as v`)
export const getFriendSuggestions = () => mine<FriendSuggestion[]>((tx) => tx`select public.friend_suggestions() as v`)
export const getInvites = () => mine<ListInvite[]>((tx) => tx`select public.my_invites() as v`)

export function isUuid(v: string) {
  return UUID.test(v)
}

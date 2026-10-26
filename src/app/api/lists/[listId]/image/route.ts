import type { NextRequest } from 'next/server'
import { getMe } from '@/lib/auth'
import { asUser, isPostgresError } from '@/lib/db'
import { isUuid } from '@/lib/data'

// Serves a list's picture to its members. The URL carries ?v=<version>, so browsers can keep
// each version for good and fetch again only when someone picks a new picture.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  const me = await getMe()
  if (!me) return new Response('Sign in first', { status: 401 })
  if (!isUuid(listId)) return new Response('Not found', { status: 404 })
  try {
    const rows = await asUser(me.id, (tx) => tx<{ mime: string; data: Buffer }[]>`select mime, data from public.list_image(${listId}::uuid)`)
    const img = rows[0]
    if (!img) return new Response('Not found', { status: 404 })
    return new Response(new Uint8Array(img.data), {
      headers: {
        'Content-Type': img.mime,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    if (isPostgresError(e) && (e.code === 'P0002' || e.code === '28000')) return new Response('Not found', { status: 404 })
    throw e
  }
}

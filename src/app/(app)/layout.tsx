import { Suspense } from 'react'
import { BottomNav, Sidebar } from '@/components/nav'
import { requireMe } from '@/lib/auth'
import { getMyLists, getQueue } from '@/lib/data'
import { PageSkeleton } from '@/components/skeletons'

export const instant = false

async function Chrome() {
  const me = await requireMe()
  const [lists, queue] = await Promise.all([getMyLists(), getQueue()])
  const links = lists.map((l) => ({
    id: l.id,
    name: l.name,
    needs_score: l.needs_score,
    cover: l.next?.cover_url ?? l.covers[0] ?? null,
    next_title: l.next?.title ?? null,
  }))
  const firstListId = lists[0]?.id ?? null
  return (
    <>
      <Sidebar lists={links} queueCount={queue.length} me={me} firstListId={firstListId} />
      <BottomNav queueCount={queue.length} firstListId={firstListId} />
    </>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<div className="hidden w-[248px] shrink-0 border-r border-[#1e2026] lg:block" />}>
        <Chrome />
      </Suspense>
      <div className="min-w-0 flex-1 pb-[96px] lg:pb-0">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </div>
    </div>
  )
}

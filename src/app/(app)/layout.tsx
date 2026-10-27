import { Suspense } from 'react'
import { BottomNav, Sidebar } from '@/components/nav'
import { requireMe } from '@/lib/auth'
import { getInvites, getMyLists, getQueue } from '@/lib/data'
import { PageSkeleton } from '@/components/skeletons'
import { LocaleRoot } from '@/i18n/root'

export const instant = false

async function Chrome() {
  const me = await requireMe()
  const [lists, queue, invites] = await Promise.all([getMyLists(), getQueue(), getInvites()])
  const links = lists.map((l) => ({
    id: l.id,
    name: l.name,
    needs_score: l.needs_score,
    image_version: l.image_version,
    new_count: l.new_count,
  }))
  const firstListId = lists[0]?.id ?? null
  return (
    <>
      <Sidebar lists={links} queueCount={queue.length} inviteCount={invites.length} me={me} firstListId={firstListId} />
      <BottomNav queueCount={queue.length} inviteCount={invites.length} firstListId={firstListId} lists={links} />
    </>
  )
}

const sidebarPlaceholder = <div className="hidden w-[248px] shrink-0 border-e border-[#1e2026] lg:block" />

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh">
          {sidebarPlaceholder}
          <div className="min-w-0 flex-1">
            <PageSkeleton />
          </div>
        </div>
      }
    >
      <LocaleRoot className="flex min-h-dvh">
        <Suspense fallback={sidebarPlaceholder}>
          <Chrome />
        </Suspense>
        <div className="min-w-0 flex-1 pb-[96px] lg:pb-0">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </div>
      </LocaleRoot>
    </Suspense>
  )
}

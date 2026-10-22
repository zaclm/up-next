'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, Cover, Icon, cx } from './ui'

type ListLink = { id: string; name: string; needs_score: number; cover: string | null; next_title: string | null }

function useActive() {
  const path = usePathname()
  return {
    path,
    upNext: path === '/' || /^\/lists\/[^/]+(\/(games|settings).*)?$/.test(path),
    score: path.startsWith('/score'),
    library: path.startsWith('/library'),
    lists: path === '/lists' || path.startsWith('/join'),
  }
}

export function Sidebar({
  lists,
  queueCount,
  me,
  firstListId,
}: {
  lists: ListLink[]
  queueCount: number
  me: { name: string; hue: number; avatarUrl: string | null }
  firstListId: string | null
}) {
  const a = useActive()
  const item = (on: boolean) =>
    cx('flex min-h-9 items-center gap-2.5 rounded-lg px-2.5', on ? 'bg-line-soft font-medium text-ink' : 'text-soft hover:text-ink')
  return (
    <aside
      aria-label="Navigation"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-[#1e2026] px-3 py-5 lg:flex"
    >
      <Link href="/" className="flex items-center gap-2.5 px-2 py-1 text-ink">
        <Icon.next size={26} className="text-accent" strokeWidth={2.2} />
        <span className="font-display text-[19px] font-bold tracking-tight">Up Next</span>
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <Link href={firstListId ? `/lists/${firstListId}` : '/lists'} className={item(a.upNext)} aria-current={a.upNext ? 'page' : undefined}>
          <Icon.next size={18} />
          Up next
        </Link>
        <Link href="/score" className={item(a.score)} aria-current={a.score ? 'page' : undefined}>
          <Icon.star size={18} />
          <span className="flex-1">To score</span>
          {queueCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-ground">{queueCount}</span>
          )}
        </Link>
        <Link href="/library" className={item(a.library)} aria-current={a.library ? 'page' : undefined}>
          <Icon.library size={18} />
          My library
        </Link>
      </nav>

      <section aria-labelledby="side-lists" className="flex flex-col gap-2">
        <div className="flex items-center justify-between pl-2.5">
          <h2 id="side-lists" className="text-[12.5px] font-medium text-muted">
            Shared lists
          </h2>
          <Link href="/lists#new" aria-label="New list" className="flex size-7 items-center justify-center rounded-lg text-muted hover:text-ink">
            <Icon.plus size={16} />
          </Link>
        </div>
        <div className="flex flex-col gap-0.5">
          {lists.map((l) => {
            const on = a.path.startsWith(`/lists/${l.id}`)
            return (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                aria-current={on ? 'page' : undefined}
                className={cx('flex min-h-12 items-center gap-2.5 rounded-lg px-2.5 py-1.5', on ? 'bg-line-soft' : 'hover:bg-[#15171b]')}
              >
                <Cover src={l.cover} title={l.next_title ?? l.name} className="w-[27px] shrink-0 rounded" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{l.name}</span>
                  <span className={cx('text-[12.5px]', l.needs_score ? 'text-accent' : 'text-muted')}>
                    {l.needs_score ? `${l.needs_score} to score` : 'All scored'}
                  </span>
                </span>
              </Link>
            )
          })}
          {lists.length === 0 && <p className="px-2.5 text-[13px] text-muted">No lists yet.</p>}
        </div>
        <Link href="/lists#join" className="self-start rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:text-ink">
          Join with a code
        </Link>
      </section>

      <Link href="/account" className="mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#15171b]">
        <Avatar name={me.name} hue={me.hue} url={me.avatarUrl} size={28} />
        <span className="flex-1 truncate font-medium">{me.name}</span>
        <span className="text-xs text-muted">Account</span>
      </Link>
    </aside>
  )
}

export function BottomNav({ queueCount, firstListId }: { queueCount: number; firstListId: string | null }) {
  const a = useActive()
  const tab = (on: boolean) =>
    cx('relative flex min-h-[52px] flex-col items-center justify-center gap-1 text-xs', on ? 'font-semibold text-ink' : 'text-muted')
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-nav px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden"
    >
      <Link href={firstListId ? `/lists/${firstListId}` : '/lists'} className={tab(a.upNext)} aria-current={a.upNext ? 'page' : undefined}>
        <Icon.next size={22} className={a.upNext ? 'text-accent' : undefined} />
        Up next
      </Link>
      <Link href="/score" className={tab(a.score)} aria-current={a.score ? 'page' : undefined}>
        <Icon.star size={22} className={a.score ? 'text-accent' : undefined} />
        To score
        {queueCount > 0 && (
          <span className="absolute top-0.5 left-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-ground">
            {queueCount}
          </span>
        )}
      </Link>
      <Link href="/library" className={tab(a.library)} aria-current={a.library ? 'page' : undefined}>
        <Icon.library size={22} className={a.library ? 'text-accent' : undefined} />
        Library
      </Link>
      <Link href="/lists" className={tab(a.lists)} aria-current={a.lists ? 'page' : undefined}>
        <Icon.people size={22} className={a.lists ? 'text-accent' : undefined} />
        Lists
      </Link>
    </nav>
  )
}

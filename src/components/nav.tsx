'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Avatar, Icon, cx } from './ui'
import { ListIcon } from './list-icon'
import { useT } from '@/i18n/client'

type ListLink = { id: string; name: string; needs_score: number; image_version: number | null; new_count: number }

/**
 * New-game counts as the server last reported them, minus lists opened since. The navigation
 * stays on screen between pages, so without this a list you just opened would keep its dot.
 */
function useNewCounts(lists: ListLink[], path: string) {
  const [opened, setOpened] = useState<Record<string, number>>({})
  const current = lists.find((l) => path.startsWith(`/lists/${l.id}`))
  useEffect(() => {
    if (current && current.new_count > 0 && opened[current.id] !== current.new_count) {
      setOpened((o) => ({ ...o, [current.id]: current.new_count }))
    }
  }, [current, opened])
  return (l: ListLink) => (l.id === current?.id || opened[l.id] === l.new_count ? 0 : l.new_count)
}

function useActive() {
  const path = usePathname()
  return {
    path,
    upNext: path === '/' || /^\/lists\/[^/]+(\/(games|settings).*)?$/.test(path),
    score: path.startsWith('/score'),
    library: path.startsWith('/library'),
    lists: path === '/lists' || path.startsWith('/join') || path.startsWith('/friends'),
    friends: path.startsWith('/friends'),
  }
}

export function Sidebar({
  lists,
  queueCount,
  inviteCount,
  me,
  firstListId,
}: {
  lists: ListLink[]
  queueCount: number
  inviteCount: number
  me: { name: string; hue: number; avatarUrl: string | null }
  firstListId: string | null
}) {
  const a = useActive()
  const t = useT()
  const newFor = useNewCounts(lists, a.path)
  const item = (on: boolean) =>
    cx('flex min-h-9 items-center gap-2.5 rounded-lg px-2.5', on ? 'bg-line-soft font-medium text-ink' : 'text-soft hover:text-ink')
  return (
    <aside
      aria-label={t.nav.navigation}
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 overflow-y-auto border-e border-[#1e2026] px-3 py-5 lg:flex"
    >
      <Link href="/" dir="ltr" className="flex items-center gap-2.5 self-start px-2 py-1 text-ink">
        <Icon.next size={26} className="text-accent" strokeWidth={2.2} />
        <span className="font-display text-[19px] font-bold tracking-tight">Up Next</span>
      </Link>

      <nav aria-label={t.nav.main} className="flex flex-col gap-0.5">
        <Link href={firstListId ? `/lists/${firstListId}` : '/lists'} className={item(a.upNext)} aria-current={a.upNext ? 'page' : undefined}>
          <Icon.next size={18} className="rtl:-scale-x-100" />
          {t.nav.upNext}
        </Link>
        <Link href="/score" className={item(a.score)} aria-current={a.score ? 'page' : undefined}>
          <Icon.star size={18} />
          <span className="flex-1">{t.nav.toScore}</span>
          {queueCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-ground">{queueCount}</span>
          )}
        </Link>
        <Link href="/library" className={item(a.library)} aria-current={a.library ? 'page' : undefined}>
          <Icon.library size={18} />
          {t.nav.library}
        </Link>
        <Link href="/friends" className={item(a.friends)} aria-current={a.friends ? 'page' : undefined}>
          <Icon.userPlus size={18} />
          {t.nav.friends}
        </Link>
      </nav>

      <section aria-labelledby="side-lists" className="flex flex-col gap-2">
        <div className="flex items-center justify-between ps-2.5">
          <h2 id="side-lists" className="text-[12.5px] font-medium text-muted">
            {t.nav.sharedLists}
          </h2>
          <Link href="/lists#new" aria-label={t.nav.newList} className="flex size-7 items-center justify-center rounded-lg text-muted hover:text-ink">
            <Icon.plus size={16} />
          </Link>
        </div>
        {inviteCount > 0 && (
          <Link href="/lists#invites" className="flex min-h-9 items-center gap-2 self-start rounded-lg bg-accent-tint px-2.5 text-[13px] font-semibold text-accent">
            <Icon.userPlus size={16} />
            {t.nav.invites(inviteCount)}
          </Link>
        )}
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
                <ListIcon id={l.id} name={l.name} version={l.image_version} size={34} newCount={newFor(l)} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{l.name}</span>
                  <span className={cx('text-[12.5px]', l.needs_score ? 'text-accent' : 'text-muted')}>
                    {l.needs_score ? t.nav.toScoreCount(l.needs_score) : t.nav.allScored}
                  </span>
                </span>
              </Link>
            )
          })}
          {lists.length === 0 && <p className="px-2.5 text-[13px] text-muted">{t.nav.noLists}</p>}
        </div>
        <Link href="/lists#join" className="self-start rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:text-ink">
          {t.nav.joinWithCode}
        </Link>
      </section>

      <Link href="/account" className="mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#15171b]">
        <Avatar name={me.name} hue={me.hue} url={me.avatarUrl} size={28} />
        <span className="flex-1 truncate font-medium">{me.name}</span>
        <span className="text-xs text-muted">{t.nav.account}</span>
      </Link>
    </aside>
  )
}

export function BottomNav({
  queueCount,
  inviteCount,
  firstListId,
  lists,
}: {
  queueCount: number
  inviteCount: number
  firstListId: string | null
  lists: ListLink[]
}) {
  const a = useActive()
  const t = useT()
  const newFor = useNewCounts(lists, a.path)
  const newTotal = lists.reduce((n, l) => n + newFor(l), 0)
  const tab = (on: boolean) =>
    cx('relative flex min-h-[52px] flex-col items-center justify-center gap-1 text-xs', on ? 'font-semibold text-ink' : 'text-muted')
  return (
    <nav
      aria-label={t.nav.main}
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-nav px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden"
    >
      <Link href={firstListId ? `/lists/${firstListId}` : '/lists'} className={tab(a.upNext)} aria-current={a.upNext ? 'page' : undefined}>
        <Icon.next size={22} className={cx('rtl:-scale-x-100', a.upNext && 'text-accent')} />
        {t.nav.upNext}
      </Link>
      <Link href="/score" className={tab(a.score)} aria-current={a.score ? 'page' : undefined}>
        <Icon.star size={22} className={a.score ? 'text-accent' : undefined} />
        {t.nav.toScore}
        {queueCount > 0 && (
          <span className="absolute top-0.5 start-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-ground">
            {queueCount}
          </span>
        )}
      </Link>
      <Link href="/library" className={tab(a.library)} aria-current={a.library ? 'page' : undefined}>
        <Icon.library size={22} className={a.library ? 'text-accent' : undefined} />
        {t.nav.libraryShort}
      </Link>
      <Link href="/lists" className={tab(a.lists)} aria-current={a.lists ? 'page' : undefined}>
        <Icon.people size={22} className={a.lists ? 'text-accent' : undefined} />
        {t.nav.lists}
        {inviteCount > 0 ? (
          <span
            aria-label={t.nav.invites(inviteCount)}
            className="absolute top-0.5 start-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-ground"
          >
            {inviteCount}
          </span>
        ) : (
          newTotal > 0 && (
            <span
              aria-label={t.nav.newInLists(newTotal)}
              className="absolute top-0.5 start-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[11px] font-bold text-white"
            >
              {newTotal > 9 ? '9+' : newTotal}
            </span>
          )
        )}
      </Link>
    </nav>
  )
}

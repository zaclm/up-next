import Link from 'next/link'
import type { Metadata } from 'next'
import { getMyLists } from '@/lib/data'
import { fmtScore, plural } from '@/lib/format'
import { AvatarStack, Icon, SectionHeading, btn, card, cx } from '@/components/ui'
import { CreateListForm, JoinListForm } from '@/components/list-forms'
import { ListIcon } from '@/components/list-icon'

export const metadata: Metadata = { title: 'My lists' }

export default async function ListsPage() {
  const lists = await getMyLists()
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">My lists</h1>
          <p className="text-[13px] text-muted lg:text-sm">
            {lists.length ? `${plural(lists.length, 'shared list')} · your scores fill in everywhere` : 'Make a list for your group, or join one with a code'}
          </p>
        </div>
        <Link href="/account" className="text-[13px] text-muted hover:text-ink lg:hidden">
          Account
        </Link>
      </header>

      {lists.length > 0 && (
        <section aria-label="Your lists" className="flex flex-col gap-3">
          {lists.map((l) => (
            <article key={l.id} className={cx(card, 'flex flex-col gap-3 p-4')}>
              <Link href={`/lists/${l.id}`} className="flex gap-4">
                <ListIcon id={l.id} name={l.name} version={l.image_version} size={72} newCount={l.new_count} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-display text-lg leading-6 font-semibold">{l.name}</h2>
                  <span className="truncate text-[13px] text-muted">
                    {l.next ? `Next: ${l.next.title} · ${fmtScore(l.next.group_score)}` : 'Nothing ranked yet'}
                  </span>
                  {l.new_count > 0 && (
                    <span className="text-[12.5px] font-medium text-[#f87171]">
                      {l.new_count === 1 ? '1 new game since you last looked' : `${l.new_count} new games since you last looked`}
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-2">
                    <AvatarStack people={l.members} size={24} max={4} />
                    <span className="text-[12.5px] text-muted">{plural(l.member_count, 'member')}</span>
                  </span>
                </span>
              </Link>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className={cx('text-[13px]', l.needs_score ? 'font-medium text-ink' : 'text-muted')}>
                  {l.needs_score ? `${plural(l.needs_score, 'game')} ${l.needs_score === 1 ? 'needs' : 'need'} your score` : 'All scored'}
                </span>
                <Link href={`/library?list=${l.id}`} className={cx(btn.score, 'text-[13.5px]')}>
                  <Icon.plus size={16} />
                  Add games
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}

      <section aria-labelledby="new-h" className="flex flex-col gap-3">
        <SectionHeading id="new-h" title="New list" note="You can invite people with a link or a code once it exists" />
        <CreateListForm />
      </section>

      <section aria-labelledby="join-h" className="flex flex-col gap-3">
        <SectionHeading id="join-h" title="Join a friend's list" />
        <JoinListForm />
      </section>
    </main>
  )
}

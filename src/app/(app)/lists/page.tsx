import Link from 'next/link'
import type { Metadata } from 'next'
import { getInvites, getMyLists } from '@/lib/data'
import { fmtScore } from '@/lib/format'
import { getT } from '@/i18n/server'
import { AvatarStack, Icon, SectionHeading, btn, card, cx } from '@/components/ui'
import { CreateListForm, JoinListForm } from '@/components/list-forms'
import { ListIcon } from '@/components/list-icon'
import { InviteCard } from '@/components/invites'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.myLists }
}

export default async function ListsPage() {
  const [lists, invites, t] = await Promise.all([getMyLists(), getInvites(), getT()])
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">{t.lists.title}</h1>
          <p className="text-[13px] text-muted lg:text-sm">
            {lists.length ? t.lists.subtitleSome(lists.length) : t.lists.subtitleNone}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <Link href="/friends" aria-label={t.nav.friends} className={cx(btn.secondary, 'min-h-10 px-3 text-[13.5px]')}>
            <Icon.userPlus size={18} />
            <span className="hidden sm:inline">{t.nav.friends}</span>
          </Link>
          <Link href="/account" className="flex min-h-10 items-center px-2 text-[13px] text-muted hover:text-ink lg:hidden">
            {t.nav.account}
          </Link>
        </span>
      </header>

      {invites.length > 0 && (
        <section aria-labelledby="invites-h" id="invites" className="flex scroll-mt-6 flex-col gap-3">
          <SectionHeading id="invites-h" title={<>{t.invites.title} <span className="font-normal text-muted">· {invites.length}</span></>} />
          {invites.map((i) => (
            <InviteCard key={i.list_id} invite={i} />
          ))}
        </section>
      )}

      {lists.length > 0 && (
        <section aria-label={t.lists.yourLists} className="flex flex-col gap-3">
          {lists.map((l) => (
            <article key={l.id} className={cx(card, 'flex flex-col gap-3 p-4')}>
              <Link href={`/lists/${l.id}`} className="flex gap-4">
                <ListIcon id={l.id} name={l.name} version={l.image_version} size={72} newCount={l.new_count} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-display text-lg leading-6 font-semibold">{l.name}</h2>
                  <span className="truncate text-[13px] text-muted">
                    {l.next ? t.lists.next(l.next.title, fmtScore(l.next.group_score)) : t.lists.nothingRanked}
                  </span>
                  {l.new_count > 0 && (
                    <span className="text-[12.5px] font-medium text-[#f87171]">
                      {t.lists.newSince(l.new_count)}
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-2">
                    <AvatarStack people={l.members} size={24} max={4} />
                    <span className="text-[12.5px] text-muted">{t.common.members(l.member_count)}</span>
                  </span>
                </span>
              </Link>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className={cx('text-[13px]', l.needs_score ? 'font-medium text-ink' : 'text-muted')}>
                  {l.needs_score ? t.lists.needYourScore(l.needs_score) : t.lists.allScored}
                </span>
                <Link href={`/library?list=${l.id}`} className={cx(btn.score, 'text-[13.5px]')}>
                  <Icon.plus size={16} />
                  {t.lists.addGames}
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}

      <section aria-labelledby="new-h" className="flex flex-col gap-3">
        <SectionHeading id="new-h" title={t.lists.newListTitle} note={t.lists.newListNote} />
        <CreateListForm />
      </section>

      <section aria-labelledby="join-h" className="flex flex-col gap-3">
        <SectionHeading id="join-h" title={t.lists.joinTitle} />
        <JoinListForm />
      </section>
    </main>
  )
}

import Link from 'next/link'
import type { Metadata } from 'next'
import { getBoard, getLibrary } from '@/lib/data'
import { getT } from '@/i18n/server'
import { Avatar, Cover, Icon, SectionHeading, card, cx } from '@/components/ui'
import { InviteBox, LinkCategoryControl, PlayableSwitch, RenameList } from '@/components/list-forms'
import { LeaveListButton, StatusButton } from '@/components/list-actions'
import { ListPictureEditor } from '@/components/list-picture'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.listSettings }
}

export default async function ListSettingsPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  const [board, library, t] = await Promise.all([getBoard(listId), getLibrary(), getT()])
  const { list } = board
  const linkedIds = new Set(board.linked_categories.map((c) => c.category_id))
  const myCats = library.categories.map((c) => ({ ...c, linked: linkedIds.has(c.id) }))
  const othersLinked = board.linked_categories.filter((c) => !c.mine)

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 pt-2 pb-10 lg:px-10 lg:pt-7">
      <header className="flex items-center gap-1">
        <Link href={`/lists/${listId}`} aria-label={t.settings.back(list.name)} className="-ms-3 flex size-11 items-center justify-center text-ink lg:hidden">
          <Icon.back size={22} className="rtl:-scale-x-100" />
        </Link>
        <div className="flex flex-col gap-1">
          <nav aria-label={t.game.breadcrumb} className="hidden text-[13px] text-muted lg:block">
            <Link href={`/lists/${listId}`} className="hover:text-ink">
              {list.name}
            </Link>{' '}
            / {t.settings.crumb}
          </nav>
          <h1 className="font-display text-xl leading-[26px] font-bold lg:text-[28px] lg:leading-[34px]">{t.settings.title(list.name)}</h1>
        </div>
      </header>

      <section aria-labelledby="pic-h" id="picture" className="flex scroll-mt-6 flex-col gap-3">
        <SectionHeading id="pic-h" title={t.settings.picture} />
        <ListPictureEditor listId={listId} name={list.name} version={list.image_version} />
      </section>

      <section aria-labelledby="invite-h" id="invite" className="flex scroll-mt-6 flex-col gap-3">
        <SectionHeading id="invite-h" title={t.settings.invite} />
        <InviteBox listId={listId} code={list.invite_code} canReset={list.is_creator} />
      </section>

      <section aria-labelledby="mem-h" className="flex flex-col gap-3">
        <SectionHeading id="mem-h" title={t.settings.membersTitle(list.member_count)} />
        <ul className={cx(card, 'flex flex-col py-1')}>
          {board.members.map((m, i) => (
            <li key={m.id} className={cx('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
              <Avatar name={m.name} hue={m.hue} url={m.avatar_url} size={32} />
              <span className="flex-1">{m.is_me ? t.common.you : m.name}</span>
              <span className="text-[12.5px] text-muted">{m.is_creator ? t.settings.createdList : t.settings.member}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rank-h" className="flex flex-col gap-3">
        <SectionHeading id="rank-h" title={t.settings.ranking} />
        <div className={cx(card, 'flex flex-col')}>
          <div className="flex items-center gap-4 p-4">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-medium">{t.settings.onlyPlayable}</span>
              <span className="text-[12.5px] text-muted">
                {list.playable_only ? t.settings.filterOn(board.blocked.length) : t.settings.filterOff}
                {!list.is_creator && t.settings.creatorOnly}
              </span>
            </span>
            <PlayableSwitch listId={listId} value={list.playable_only} disabled={!list.is_creator} />
          </div>
          <div className="flex flex-col gap-0.5 border-t border-line p-4">
            <span className="font-medium">{t.settings.needed(list.needed, list.member_count)}</span>
            <span className="text-[12.5px] text-muted">
              {list.member_count < 2 ? t.settings.neededSolo : t.settings.neededRule}
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="cat-h" className="flex flex-col gap-3">
        <SectionHeading id="cat-h" title={t.settings.linkedTitle} note={t.settings.linkedNote} />
        <LinkCategoryControl listId={listId} mine={myCats} />
        {othersLinked.length > 0 && (
          <p className="text-[13px] text-muted">
            {t.settings.alsoLinked(othersLinked.map((c) => `${c.name} (${c.owner_name})`).join(t.locale === 'ar' ? '، ' : ', '))}
          </p>
        )}
      </section>

      {list.is_creator && board.hidden.length > 0 && (
        <section aria-labelledby="hidden-h" className="flex flex-col gap-3">
          <SectionHeading id="hidden-h" title={t.settings.hiddenTitle} note={t.settings.hiddenNote} />
          <ul className={cx(card, 'flex flex-col py-1')}>
            {board.hidden.map((g, i) => (
              <li key={g.id} className={cx('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
                <Cover src={g.cover_url} title={g.title} className="w-[27px] shrink-0 rounded" />
                <span className="flex-1 truncate"><bdi>{g.title}</bdi></span>
                <StatusButton listId={listId} gameId={g.id} status="active" label={t.settings.bringBack} confirmLabel={t.common.yes} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.is_creator && (
        <section aria-labelledby="name-h" className="flex flex-col gap-3">
          <SectionHeading id="name-h" title={t.settings.name} />
          <RenameList listId={listId} name={list.name} />
        </section>
      )}

      <section aria-labelledby="leave-h" className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 id="leave-h" className="sr-only">
          {t.settings.leave}
        </h2>
        <LeaveListButton listId={listId} name={list.name} />
        <p className="text-[12.5px] text-muted">
          {t.settings.leaveNote}
          {list.is_creator && list.member_count > 1 ? t.settings.leaveTransfer : ''}
        </p>
      </section>
    </main>
  )
}

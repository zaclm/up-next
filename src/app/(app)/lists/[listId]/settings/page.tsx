import Link from 'next/link'
import type { Metadata } from 'next'
import { getBoard, getLibrary } from '@/lib/data'
import { plural } from '@/lib/format'
import { Avatar, Cover, Icon, SectionHeading, card, cx } from '@/components/ui'
import { InviteBox, LinkCategoryControl, PlayableSwitch, RenameList } from '@/components/list-forms'
import { LeaveListButton, StatusButton } from '@/components/list-actions'
import { ListPictureEditor } from '@/components/list-picture'

export const metadata: Metadata = { title: 'List settings' }

export default async function ListSettingsPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  const [board, library] = await Promise.all([getBoard(listId), getLibrary()])
  const { list } = board
  const linkedIds = new Set(board.linked_categories.map((c) => c.category_id))
  const myCats = library.categories.map((c) => ({ ...c, linked: linkedIds.has(c.id) }))
  const othersLinked = board.linked_categories.filter((c) => !c.mine)

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 pt-2 pb-10 lg:px-10 lg:pt-7">
      <header className="flex items-center gap-1">
        <Link href={`/lists/${listId}`} aria-label={`Back to ${list.name}`} className="-ml-3 flex size-11 items-center justify-center text-ink lg:hidden">
          <Icon.back size={22} />
        </Link>
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="hidden text-[13px] text-muted lg:block">
            <Link href={`/lists/${listId}`} className="hover:text-ink">
              {list.name}
            </Link>{' '}
            / Settings
          </nav>
          <h1 className="font-display text-xl leading-[26px] font-bold lg:text-[28px] lg:leading-[34px]">{list.name} settings</h1>
        </div>
      </header>

      <section aria-labelledby="pic-h" id="picture" className="flex scroll-mt-6 flex-col gap-3">
        <SectionHeading id="pic-h" title="Picture" />
        <ListPictureEditor listId={listId} name={list.name} version={list.image_version} />
      </section>

      <section aria-labelledby="invite-h" id="invite" className="flex scroll-mt-6 flex-col gap-3">
        <SectionHeading id="invite-h" title="Invite friends" />
        <InviteBox listId={listId} code={list.invite_code} canReset={list.is_creator} />
      </section>

      <section aria-labelledby="mem-h" className="flex flex-col gap-3">
        <SectionHeading id="mem-h" title={`Members · ${list.member_count}`} />
        <ul className={cx(card, 'flex flex-col py-1')}>
          {board.members.map((m, i) => (
            <li key={m.id} className={cx('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
              <Avatar name={m.name} hue={m.hue} url={m.avatar_url} size={32} />
              <span className="flex-1">{m.is_me ? 'You' : m.name}</span>
              <span className="text-[12.5px] text-muted">{m.is_creator ? 'Created the list' : 'Member'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rank-h" className="flex flex-col gap-3">
        <SectionHeading id="rank-h" title="Ranking" />
        <div className={cx(card, 'flex flex-col')}>
          <div className="flex items-center gap-4 p-4">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-medium">Only rank games everyone can play</span>
              <span className="text-[12.5px] text-muted">
                {list.playable_only
                  ? `On: ${plural(board.blocked.length, 'game')} ${board.blocked.length === 1 ? 'waits' : 'wait'} until nobody says they can't play`
                  : 'Off: every game is ranked, even if someone can’t play it'}
                {!list.is_creator && ' · only the list creator can change this'}
              </span>
            </span>
            <PlayableSwitch listId={listId} value={list.playable_only} disabled={!list.is_creator} />
          </div>
          <div className="flex flex-col gap-0.5 border-t border-line p-4">
            <span className="font-medium">
              Scores needed to rank: {list.needed} of {list.member_count}
            </span>
            <span className="text-[12.5px] text-muted">
              {list.member_count < 2
                ? 'While you’re the only member, your own score is enough. Invite friends to make it a group decision.'
                : 'Half the members, rounded up, never fewer than 2. It updates as people join.'}
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="cat-h" className="flex flex-col gap-3">
        <SectionHeading id="cat-h" title="Linked categories" note="New games you put in a linked category join this list on their own" />
        <LinkCategoryControl listId={listId} mine={myCats} />
        {othersLinked.length > 0 && (
          <p className="text-[13px] text-muted">
            Also linked by others: {othersLinked.map((c) => `${c.name} (${c.owner_name})`).join(', ')}
          </p>
        )}
      </section>

      {list.is_creator && board.hidden.length > 0 && (
        <section aria-labelledby="hidden-h" className="flex flex-col gap-3">
          <SectionHeading id="hidden-h" title="Hidden games" note="Only you see these. Scores are kept." />
          <ul className={cx(card, 'flex flex-col py-1')}>
            {board.hidden.map((g, i) => (
              <li key={g.id} className={cx('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
                <Cover src={g.cover_url} title={g.title} className="w-[27px] shrink-0 rounded" />
                <span className="flex-1 truncate">{g.title}</span>
                <StatusButton listId={listId} gameId={g.id} status="active" label="Bring back" confirmLabel="Yes" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.is_creator && (
        <section aria-labelledby="name-h" className="flex flex-col gap-3">
          <SectionHeading id="name-h" title="Name" />
          <RenameList listId={listId} name={list.name} />
        </section>
      )}

      <section aria-labelledby="leave-h" className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 id="leave-h" className="sr-only">
          Leave
        </h2>
        <LeaveListButton listId={listId} name={list.name} />
        <p className="text-[12.5px] text-muted">
          Your scores stay in your library.{list.is_creator && list.member_count > 1 ? ' The next member to have joined becomes the list creator.' : ''}
        </p>
      </section>
    </main>
  )
}

import Link from 'next/link'
import type { Metadata } from 'next'
import { getBoard } from '@/lib/data'
import type { Board, BoardCard } from '@/lib/types'
import { fmtScore, listNames, plural, shortDate } from '@/lib/format'
import { Avatar, AvatarStack, Cover, Icon, SectionHeading, btn, card, cx } from '@/components/ui'
import { MarkPlayedButton } from '@/components/list-actions'

export const metadata: Metadata = { title: 'Up next' }

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { listId } = await params
  const { tab } = await searchParams
  const board = await getBoard(listId)
  const showPlayed = tab === 'played'
  const lead = board.ranked[0]

  const subline = lead
    ? `${lead.title} is up next${board.needs_score.length ? ` · ${plural(board.needs_score.length, 'game')} still ${board.needs_score.length === 1 ? 'needs' : 'need'} your score` : ''}`
    : board.needs_score.length
      ? `Score ${board.needs_score.length === 1 ? 'the game' : 'the games'} below to see the ranking`
      : 'Add games to get the ranking going'

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex items-start justify-between gap-4 lg:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href="/lists" className="flex items-center gap-1.5 text-ink lg:pointer-events-none" aria-label={`${board.list.name}. Switch list`}>
            <h1 className="truncate font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">{board.list.name}</h1>
            <Icon.chevronDown size={20} className="shrink-0 text-muted lg:hidden" />
          </Link>
          <p className="text-[13px] text-muted lg:text-sm">{subline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden sm:block">
            <AvatarStack people={board.members} size={30} />
          </span>
          <span className="hidden lg:block">
            <Link href={`/library?list=${board.list.id}`} className={btn.outline}>
              <Icon.plus size={16} />
              Add games
            </Link>
          </span>
          <Link href={`/lists/${board.list.id}/settings`} aria-label="List settings and invite" className="flex size-11 items-center justify-center rounded-xl bg-surface text-ink lg:size-9 lg:rounded-lg">
            <Icon.sliders size={20} />
          </Link>
        </div>
      </header>

      <div role="tablist" aria-label="List view" className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 lg:flex lg:gap-6 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:p-0">
        <TabLink href={`/lists/${board.list.id}`} active={!showPlayed}>
          Up next
        </TabLink>
        <TabLink href={`/lists/${board.list.id}?tab=played`} active={showPlayed}>
          Played together{board.played.length ? ` · ${board.played.length}` : ''}
        </TabLink>
      </div>

      {showPlayed ? <PlayedTab board={board} /> : <UpNextTab board={board} />}
    </main>
  )
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      replace
      scroll={false}
      className={cx(
        'flex min-h-10 items-center justify-center rounded-[9px] px-1 text-sm lg:-mb-px lg:rounded-none lg:border-b-2',
        active ? 'bg-active font-semibold text-ink lg:border-ink lg:bg-transparent' : 'text-muted hover:text-ink lg:border-transparent',
      )}
    >
      {children}
    </Link>
  )
}

function UpNextTab({ board }: { board: Board }) {
  const [lead, ...rest] = board.ranked
  const listId = board.list.id
  const nothing = !lead && board.waiting.length === 0 && board.needs_score.length === 0 && board.blocked.length === 0

  if (nothing) {
    return (
      <section className={cx(card, 'flex flex-col items-start gap-3 p-6')}>
        <h2 className="text-base font-semibold">No games in this list yet</h2>
        <p className="max-w-prose text-muted">
          Add games from your library, or link a whole category. Everyone&apos;s existing scores fill in automatically.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/library?list=${listId}`} className={btn.primary}>
            Add games
          </Link>
          <Link href={`/lists/${listId}/settings#invite`} className={btn.secondary}>
            Invite friends
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6">
      <aside aria-label="Your to-do" className="contents lg:order-2 lg:flex lg:w-[340px] lg:shrink-0 lg:flex-col lg:gap-8">
      {board.needs_score.length > 0 && (
        <section aria-labelledby="needs-h" className="order-1 flex flex-col gap-3 lg:order-none">
          <SectionHeading id="needs-h" title={<>Needs your score <span className="font-normal text-muted">· {board.needs_score.length}</span></>} />
          <div className={cx(card, 'flex flex-col py-1')}>
            {board.needs_score.map((g, i) => (
              <div key={g.id} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                <Cover src={g.cover_url} title={g.title} className="w-9 shrink-0 rounded-[5px]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{g.title}</span>
                  <span className="truncate text-[12.5px] text-muted">
                    {g.scored_count} of {g.member_count} scored{g.added_by_name ? ` · from ${g.added_by_name}` : ''}
                  </span>
                </span>
                <Link href={`/lists/${listId}/games/${g.id}`} className={cx(i === 0 ? btn.primary : btn.secondary, 'min-h-10 px-3.5 lg:min-h-9')}>
                  Score
                </Link>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <Icon.lock size={14} />
            Their scores and rank stay hidden until you add yours.
          </p>
        </section>
      )}

      {board.blocked.length > 0 && <BlockedSection board={board} />}
      </aside>

      <div className="order-2 flex min-w-0 flex-1 flex-col gap-8 lg:order-1 lg:gap-6">
        {lead ? (
          <FeaturedCard card={lead} listId={listId} />
        ) : (
          <section className={cx(card, 'flex flex-col gap-2 p-6')}>
            <h2 className="text-base font-semibold">Nothing ranked yet</h2>
            <p className="text-muted">
              A game is ranked once {board.list.needed} of {board.list.member_count} members have scored it
              {board.needs_score.length ? ', including you' : ''}.
            </p>
          </section>
        )}

        {rest.length > 0 && <RankedTable cards={rest} listId={listId} memberCount={board.list.member_count} />}

        {board.waiting.length > 0 && (
          <section aria-labelledby="wait-h" className="flex flex-col gap-3">
            <SectionHeading
              id="wait-h"
              title="Waiting for scores"
              note={`A game is ranked once ${board.list.needed} of ${board.list.member_count} members score it`}
            />
            <div className="flex flex-col gap-2">
              {board.waiting.map((g) => (
                <Link
                  key={g.id}
                  href={`/lists/${listId}/games/${g.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 hover:bg-surface"
                >
                  <Cover src={g.cover_url} title={g.title} className="w-[42px] shrink-0 rounded-md" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{g.title}</span>
                    <span className="text-[12.5px] text-muted">
                      {g.scored_count} of {g.member_count} scored · needs {g.needed - g.scored_count} more
                    </span>
                  </span>
                  <span className="font-display text-lg font-semibold text-muted tnum">{fmtScore(g.group_score)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

    </div>
  )
}

function BlockedSection({ board }: { board: Board }) {
  return (
    <section aria-labelledby="blocked-h" className="order-3 flex flex-col gap-3 lg:order-none">
          <details className="group" open>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <SectionHeading
                id="blocked-h"
                title={<>Not everyone can play yet <span className="font-normal text-muted">· {board.blocked.length}</span></>}
                note="Kept out of the ranking until everyone can play them"
              />
              <Icon.chevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className={cx(card, 'mt-3 flex flex-col gap-3 p-4')}>
              {board.blocked.map((g) => (
                <Link key={g.id} href={`/lists/${board.list.id}/games/${g.id}`} className="flex items-center gap-3 hover:text-ink">
                  <Cover src={g.cover_url} title={g.title} className="w-[27px] shrink-0 rounded" />
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  <span className="shrink-0 text-[12.5px] text-muted">{listNames(g.cant_play)} can&apos;t</span>
                </Link>
              ))}
            </div>
          </details>
        </section>
  )
}

function FeaturedCard({ card: g, listId }: { card: BoardCard; listId: string }) {
  return (
    <section aria-label="Next up" className={cx(card, 'flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-6')}>
      <div className="flex gap-4 sm:contents">
        <Link href={`/lists/${listId}/games/${g.id}`} className="shrink-0">
          <Cover src={g.cover_url} title={g.title} alt={`${g.title} cover`} className="w-[108px] rounded-lg sm:w-[168px] sm:rounded-[10px]" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1 sm:hidden">
          <span className="text-xs text-muted">Next up · ranked #1</span>
          <h2 className="font-display text-[22px] leading-7 font-bold tracking-tight">{g.title}</h2>
          <span className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[40px] leading-10 font-bold text-accent tnum">{fmtScore(g.group_score)}</span>
            <span className="text-[13px] text-muted">group score</span>
          </span>
          <span className="mt-1 text-[13px] text-muted">{scoreMix(g)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="hidden flex-col gap-1 sm:flex">
          <span className="text-[13px] text-muted">Next up · ranked #1{g.genres.length ? ` · ${g.genres.slice(0, 2).join(', ')}` : ''}</span>
          <h2 className="font-display text-[30px] leading-9 font-bold tracking-tight">{g.title}</h2>
          <span className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-[40px] leading-10 font-bold text-accent tnum">{fmtScore(g.group_score)}</span>
            <span className="text-sm text-muted">group score · {scoreMix(g)}</span>
          </span>
        </div>
        {g.scores && (
          <div className="grid grid-cols-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:pt-4">
            {g.scores.map((s) => (
              <div key={s.user_id} className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                <Avatar name={s.name} hue={s.hue} url={s.avatar_url} size={28} />
                <span className="flex flex-col items-center sm:items-start">
                  <span className="hidden text-[12.5px] text-muted sm:block">{s.is_me ? 'You' : s.name}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-display text-base font-semibold tnum">{fmtScore(s.personal)}</span>
                    {s.tag && <span className={cx('text-xs', s.tag === 'played' ? 'text-accent' : 'text-hype')}>{s.tag}</span>}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:mt-auto sm:flex-row">
          <MarkPlayedButton listId={listId} gameId={g.id} className="w-full sm:w-auto" />
          <span className="hidden sm:block">
            <Link href={`/lists/${listId}/games/${g.id}`} className={btn.secondary}>
              Open game
            </Link>
          </span>
        </div>
      </div>
    </section>
  )
}

function scoreMix(g: BoardCard) {
  const parts = []
  if (g.played_count) parts.push(`${g.played_count} played`)
  if (g.hype_count) parts.push(`${g.hype_count} hype`)
  return `${g.scored_count} of ${g.member_count} scored${parts.length ? ` · ${parts.join(', ')}` : ''}`
}

function RankedTable({ cards, listId, memberCount }: { cards: BoardCard[]; listId: string; memberCount: number }) {
  const people = cards[0]?.scores ?? []
  const showPeople = memberCount <= 5
  const cols = `48px minmax(0,1fr) ${showPeople ? `repeat(${people.length}, 72px) ` : ''}88px`
  return (
    <section aria-labelledby="after-h" className="flex flex-col gap-3 lg:gap-0 lg:rounded-2xl lg:bg-surface">
      <div className="flex items-center justify-between lg:px-6 lg:pt-4 lg:pb-2">
        <h2 id="after-h" className="text-base leading-6 font-semibold">
          After that
        </h2>
        <span className="hidden gap-4 text-[12.5px] text-muted lg:flex">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-ink" />
            played
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-hype" />
            hype only
          </span>
        </span>
      </div>

      {/* Phone: one row per game */}
      <div className={cx(card, 'flex flex-col py-1 lg:hidden')}>
        {cards.map((g, i) => (
          <Link key={g.id} href={`/lists/${listId}/games/${g.id}`} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
            <span className="w-4 shrink-0 text-[13px] text-muted tnum">{g.rank}</span>
            <Cover src={g.cover_url} title={g.title} className="w-[42px] shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{g.title}</span>
              <span className="truncate text-[12.5px] text-muted">{scoreMix(g)}</span>
            </span>
            <span className="font-display text-xl font-semibold tnum">{fmtScore(g.group_score)}</span>
          </Link>
        ))}
      </div>

      {/* PC: a table with everyone's score */}
      <div role="table" aria-label="Ranked games" className="hidden overflow-x-auto lg:block">
        <div className="min-w-[560px]">
          <div role="row" className="grid items-center text-[12.5px] text-muted" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader" className="py-2 pl-6">
              #
            </span>
            <span role="columnheader" className="px-3 py-2">
              Game
            </span>
            {showPeople &&
              people.map((p) => (
                <span role="columnheader" key={p.user_id} className="truncate px-3 py-2 text-right">
                  {p.is_me ? 'You' : p.name}
                </span>
              ))}
            <span role="columnheader" className="py-2 pr-6 pl-3 text-right">
              Group
            </span>
          </div>
          {cards.map((g) => (
            <div key={g.id} role="row" className="grid items-center border-t border-line" style={{ gridTemplateColumns: cols }}>
              <span role="cell" className="py-3 pl-6 text-muted tnum">
                {g.rank}
              </span>
              <span role="cell" className="min-w-0 px-3 py-3">
                <Link href={`/lists/${listId}/games/${g.id}`} className="flex items-center gap-3 hover:text-ink">
                  <Cover src={g.cover_url} title={g.title} className="w-9 shrink-0 rounded-[5px]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{g.title}</span>
                    <span className="text-[12.5px] text-muted">
                      {g.scored_count} of {g.member_count} scored
                    </span>
                  </span>
                </Link>
              </span>
              {showPeople &&
                (g.scores ?? []).map((s) => (
                  <span
                    role="cell"
                    key={s.user_id}
                    className={cx('px-3 py-3 text-right tnum', s.tag === 'hype' ? 'text-hype' : s.tag ? 'text-ink' : 'text-[#6f7480]')}
                  >
                    {fmtScore(s.personal)}
                  </span>
                ))}
              <span role="cell" className="py-3 pr-6 pl-3 text-right font-display text-xl font-semibold tnum">
                {fmtScore(g.group_score)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlayedTab({ board }: { board: Board }) {
  if (board.played.length === 0) {
    return (
      <section className={cx(card, 'flex flex-col gap-2 p-6')}>
        <h2 className="text-base font-semibold">Nothing played together yet</h2>
        <p className="text-muted">When your group finishes the game at the top, tap &ldquo;We played it together&rdquo;. It moves here, and everyone adds an After score.</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="fav-h" className="flex flex-col gap-4">
      <SectionHeading id="fav-h" title="All-time favorites" note="Games you played together, by everyone's score" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {board.played.map((g, i) => (
          <Link key={g.id} href={`/lists/${board.list.id}/games/${g.id}`} className={cx(card, 'flex gap-4 p-4 hover:bg-raised')}>
            <Cover src={g.cover_url} title={g.title} className="w-[72px] shrink-0 rounded-lg" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[12.5px] text-muted">
                #{i + 1} · {shortDate(g.played_at)}
              </span>
              <span className="truncate font-semibold">{g.title}</span>
              <span className="mt-auto flex items-baseline gap-2">
                <span className="font-display text-[28px] leading-8 font-bold tnum">{fmtScore(g.group_score)}</span>
                {!g.me_scored && <span className="text-[12.5px] text-muted">score it to see</span>}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}


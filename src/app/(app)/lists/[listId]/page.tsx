import Link from 'next/link'
import type { Metadata } from 'next'
import { getBoard } from '@/lib/data'
import type { Board, BoardCard } from '@/lib/types'
import { fmtScore } from '@/lib/format'
import { joinNames, monthYear } from '@/i18n/format'
import { getT, type T } from '@/i18n/server'
import { Avatar, AvatarStack, Cover, Icon, SectionHeading, btn, card, cx } from '@/components/ui'
import { MarkPlayedButton } from '@/components/list-actions'
import { ListIcon } from '@/components/list-icon'
import { MarkListSeen } from '@/components/list-picture'
import { PlayedSwitch } from '@/components/played-switch'

function NewTag({ t }: { t: T }) {
  return <span className="shrink-0 rounded-full bg-[#3a1d20] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#f87171] uppercase">{t.tags.new}</span>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.upNext }
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { listId } = await params
  const { tab } = await searchParams
  const [board, t] = await Promise.all([getBoard(listId), getT()])
  const showPlayed = tab === 'played'
  const lead = board.ranked[0]

  const subline = lead
    ? board.needs_score.length
      ? t.board.upNextWithNeeds(lead.title, board.needs_score.length)
      : t.board.upNextOnly(lead.title)
    : board.needs_score.length
      ? t.board.scoreToSee(board.needs_score.length)
      : t.board.addToStart

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex items-start justify-between gap-4 lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-4">
          <MarkListSeen listId={board.list.id} />
          <Link href={`/lists/${board.list.id}/settings#picture`} aria-label={t.board.changePicture} className="hidden shrink-0 sm:block">
            <ListIcon id={board.list.id} name={board.list.name} version={board.list.image_version} size={52} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link href="/lists" className="flex items-center gap-1.5 text-ink lg:pointer-events-none" aria-label={t.board.switchList(board.list.name)}>
              <h1 className="truncate font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">{board.list.name}</h1>
              <Icon.chevronDown size={20} className="shrink-0 text-muted lg:hidden" />
            </Link>
            <p className="text-[13px] text-muted lg:text-sm">{subline}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden sm:block">
            <AvatarStack people={board.members} size={30} />
          </span>
          <span className="hidden lg:block">
            <Link href={`/library?list=${board.list.id}`} className={btn.primary}>
              <Icon.plus size={16} />
              {t.board.addGames}
            </Link>
          </span>
          <Link href={`/lists/${board.list.id}/settings`} aria-label={t.board.settingsAria} className="flex size-11 items-center justify-center rounded-xl bg-surface text-ink lg:size-9 lg:rounded-lg">
            <Icon.sliders size={20} />
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:border-b lg:border-line">
        <div role="tablist" aria-label={t.board.tabsAria} className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 lg:flex lg:gap-6 lg:rounded-none lg:bg-transparent lg:p-0">
          <TabLink href={`/lists/${board.list.id}`} active={!showPlayed}>
            {t.board.tabUpNext}
          </TabLink>
          <TabLink href={`/lists/${board.list.id}?tab=played`} active={showPlayed}>
            {t.board.tabPlayed(board.played.length)}
          </TabLink>
        </div>
        {!showPlayed && board.played.length > 0 && (
          <div className="self-start lg:self-auto lg:pb-1.5">
            <PlayedSwitch listId={board.list.id} on={board.list.include_played} count={board.ranked_all.length - board.ranked.length} />
          </div>
        )}
      </div>

      {showPlayed ? <PlayedTab board={board} t={t} /> : <UpNextTab board={board} t={t} />}
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

function UpNextTab({ board, t }: { board: Board; t: T }) {
  // With the "Played games" switch on, played games are ranked together with the rest.
  const ranking = board.list.include_played ? board.ranked_all : board.ranked
  const [lead, ...rest] = ranking
  const listId = board.list.id
  const nothing = !lead && board.waiting.length === 0 && board.needs_score.length === 0 && board.blocked.length === 0

  if (nothing) {
    return (
      <section className={cx(card, 'flex flex-col items-start gap-3 p-6')}>
        <h2 className="text-base font-semibold">{t.board.emptyTitle}</h2>
        <p className="max-w-prose text-muted">{t.board.emptyBody}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/library?list=${listId}`} className={btn.primary}>
            {t.board.addGames}
          </Link>
          <Link href={`/lists/${listId}/settings#invite`} className={btn.secondary}>
            {t.board.inviteFriends}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6">
      <aside aria-label={t.board.yourTodo} className="contents lg:order-2 lg:flex lg:w-[340px] lg:shrink-0 lg:flex-col lg:gap-8">
      {board.needs_score.length > 0 && (
        <section aria-labelledby="needs-h" className="order-1 flex flex-col gap-3 lg:order-none">
          <SectionHeading id="needs-h" title={<>{t.board.needsScore} <span className="font-normal text-muted">· {board.needs_score.length}</span></>} />
          <div className={cx(card, 'flex flex-col py-1')}>
            {board.needs_score.map((g, i) => (
              <div key={g.id} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                <Cover src={g.cover_url} title={g.title} className="w-9 shrink-0 rounded-[5px]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold"><bdi>{g.title}</bdi></span>
                    {g.is_new && <NewTag t={t} />}
                  </span>
                  <span className="truncate text-[12.5px] text-muted">
                    {t.common.scoredOf(g.scored_count, g.member_count)}
                    {g.added_by_name ? t.board.fromName(g.added_by_name) : ''}
                  </span>
                </span>
                <Link href={`/lists/${listId}/games/${g.id}`} className={cx(btn.score, 'shrink-0')}>
                  {t.board.score}
                </Link>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <Icon.lock size={14} />
            {t.board.hiddenUntil}
          </p>
        </section>
      )}

      {board.blocked.length > 0 && <BlockedSection board={board} t={t} />}
      </aside>

      <div className="order-2 flex min-w-0 flex-1 flex-col gap-8 lg:order-1 lg:gap-6">
        {lead ? (
          <FeaturedCard card={lead} listId={listId} t={t} />
        ) : (
          <section className={cx(card, 'flex flex-col gap-2 p-6')}>
            <h2 className="text-base font-semibold">{t.board.nothingRankedTitle}</h2>
            <p className="text-muted">{t.board.nothingRankedBody(board.list.needed, board.list.member_count, board.needs_score.length > 0)}</p>
          </section>
        )}

        {rest.length > 0 && (
          <RankedTable cards={rest} listId={listId} memberCount={board.list.member_count} withPlayed={board.list.include_played} t={t} />
        )}

        {board.waiting.length > 0 && (
          <section aria-labelledby="wait-h" className="flex flex-col gap-3">
            <SectionHeading
              id="wait-h"
              title={t.board.waitingTitle}
              note={t.board.waitingNote(board.list.needed, board.list.member_count)}
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
                    <span className="truncate font-semibold"><bdi>{g.title}</bdi></span>
                    <span className="text-[12.5px] text-muted">
                      {t.board.needsMore(g.scored_count, g.member_count, g.needed - g.scored_count)}
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

function BlockedSection({ board, t }: { board: Board; t: T }) {
  return (
    <section aria-labelledby="blocked-h" className="order-3 flex flex-col gap-3 lg:order-none">
          <details className="group" open>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <SectionHeading
                id="blocked-h"
                title={<>{t.board.blockedTitle} <span className="font-normal text-muted">· {board.blocked.length}</span></>}
                note={t.board.blockedNote}
              />
              <Icon.chevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className={cx(card, 'mt-3 flex flex-col gap-3 p-4')}>
              {board.blocked.map((g) => (
                <Link key={g.id} href={`/lists/${board.list.id}/games/${g.id}`} className="flex items-center gap-3 hover:text-ink">
                  <Cover src={g.cover_url} title={g.title} className="w-[27px] shrink-0 rounded" />
                  <span className="min-w-0 flex-1 truncate"><bdi>{g.title}</bdi></span>
                  <span className="shrink-0 text-[12.5px] text-muted">{t.board.cant(joinNames(t.locale, g.cant_play))}</span>
                </Link>
              ))}
            </div>
          </details>
        </section>
  )
}

function FeaturedCard({ card: g, listId, t }: { card: BoardCard; listId: string; t: T }) {
  const played = g.status === 'played'
  const label = played ? t.board.rankedPlayed(monthYear(t.locale, g.played_at)) : t.board.nextUp
  return (
    <section aria-label={t.board.nextUpAria} className={cx(card, 'relative flex flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:gap-6 sm:p-6', played && playedStripe)}>
      <div className="flex gap-4 sm:contents">
        <Link href={`/lists/${listId}/games/${g.id}`} className="shrink-0">
          <Cover src={g.cover_url} title={g.title} alt={t.common.coverAlt(g.title)} className="w-[108px] rounded-lg sm:w-[168px] sm:rounded-[10px]" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1 sm:hidden">
          <span className="text-xs text-muted">{label}</span>
          <h2 className="font-display text-[22px] leading-7 font-bold tracking-tight"><bdi>{g.title}</bdi></h2>
          <span className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[40px] leading-10 font-bold text-accent tnum">{fmtScore(g.group_score)}</span>
            <span className="text-[13px] text-muted">{t.board.groupScore}</span>
          </span>
          <span className="mt-1 text-[13px] text-muted">{scoreMix(g, t)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="hidden flex-col gap-1 sm:flex">
          <span className="text-[13px] text-muted">
            {label}
            {g.genres.length ? ` · ${g.genres.slice(0, 2).join(', ')}` : ''}
          </span>
          <h2 className="font-display text-[30px] leading-9 font-bold tracking-tight"><bdi>{g.title}</bdi></h2>
          <span className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-[40px] leading-10 font-bold text-accent tnum">{fmtScore(g.group_score)}</span>
            <span className="text-sm text-muted">
              {t.board.groupScore} · {scoreMix(g, t)}
            </span>
          </span>
        </div>
        {g.scores && (
          <div className="grid grid-cols-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:pt-4">
            {g.scores.map((s) => (
              <div key={s.user_id} className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                <Avatar name={s.name} hue={s.hue} url={s.avatar_url} size={28} />
                <span className="flex flex-col items-center sm:items-start">
                  <span className="hidden text-[12.5px] text-muted sm:block">{s.is_me ? t.common.you : s.name}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-display text-base font-semibold tnum">{fmtScore(s.personal)}</span>
                    {s.tag && (
                      <span className={cx('text-xs', s.tag === 'played' ? 'text-accent' : 'text-hype')}>
                        {s.tag === 'played' ? t.tags.playedLower : t.tags.hypeLower}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:mt-auto sm:flex-row">
          {played ? (
            <span className="flex min-h-11 items-center gap-2 self-start rounded-xl bg-accent-tint px-4 font-semibold text-accent lg:min-h-10">
              <Icon.check size={18} />
              {t.board.playedTogether}
            </span>
          ) : (
            <MarkPlayedButton listId={listId} gameId={g.id} className="w-full sm:w-auto" />
          )}
          <span className="hidden sm:block">
            <Link href={`/lists/${listId}/games/${g.id}`} className={btn.secondary}>
              {t.board.openGame}
            </Link>
          </span>
        </div>
      </div>
    </section>
  )
}

function scoreMix(g: BoardCard, t: T) {
  const parts = []
  if (g.played_count) parts.push(t.common.playedCount(g.played_count))
  if (g.hype_count) parts.push(t.common.hypeCount(g.hype_count))
  return `${t.common.scoredOf(g.scored_count, g.member_count)}${parts.length ? ` · ${parts.join(t.locale === 'ar' ? '، ' : ', ')}` : ''}`
}

/** Left edge mark for games the group already played, when they are ranked with the rest. */
const playedStripe = 'before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-accent'

function PlayedTag({ t }: { t: T }) {
  return <span className="shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent uppercase">{t.tags.played}</span>
}

function RankedTable({
  cards,
  listId,
  memberCount,
  withPlayed = false,
  t,
}: {
  cards: BoardCard[]
  listId: string
  memberCount: number
  withPlayed?: boolean
  t: T
}) {
  const people = cards[0]?.scores ?? []
  const showPeople = memberCount <= 5
  const cols = `48px minmax(0,1fr) ${showPeople ? `repeat(${people.length}, 72px) ` : ''}88px`
  return (
    <section aria-labelledby="after-h" className="flex flex-col gap-3 lg:gap-0 lg:rounded-2xl lg:bg-surface">
      <div className="flex items-center justify-between lg:px-6 lg:pt-4 lg:pb-2">
        <h2 id="after-h" className="text-base leading-6 font-semibold">
          {t.board.afterThat}
        </h2>
        <span className="hidden gap-4 text-[12.5px] text-muted lg:flex">
          {withPlayed && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-[3px] rounded-full bg-accent" />
              {t.board.legendPlayedTogether}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-ink" />
            {t.board.legendPlayed}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-hype" />
            {t.board.legendHype}
          </span>
        </span>
      </div>

      {/* Phone: one row per game */}
      <div className={cx(card, 'flex flex-col py-1 lg:hidden')}>
        {cards.map((g, i) => (
          <Link
            key={g.id}
            href={`/lists/${listId}/games/${g.id}`}
            className={cx('relative flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line', g.status === 'played' && playedStripe)}
          >
            <span className="w-4 shrink-0 text-[13px] text-muted tnum">{g.rank}</span>
            <Cover src={g.cover_url} title={g.title} className="w-[42px] shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold"><bdi>{g.title}</bdi></span>
                {g.status === 'played' && <PlayedTag t={t} />}
              </span>
              <span className="truncate text-[12.5px] text-muted">{scoreMix(g, t)}</span>
            </span>
            <span className="font-display text-xl font-semibold tnum">{fmtScore(g.group_score)}</span>
          </Link>
        ))}
      </div>

      {/* PC: a table with everyone's score */}
      <div role="table" aria-label={t.board.rankedGames} className="hidden overflow-x-auto lg:block">
        <div className="min-w-[560px]">
          <div role="row" className="grid items-center text-[12.5px] text-muted" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader" className="py-2 ps-6">
              #
            </span>
            <span role="columnheader" className="px-3 py-2">
              {t.board.colGame}
            </span>
            {showPeople &&
              people.map((p) => (
                <span role="columnheader" key={p.user_id} className="truncate px-3 py-2 text-end">
                  {p.is_me ? t.common.you : p.name}
                </span>
              ))}
            <span role="columnheader" className="py-2 ps-3 pe-6 text-end">
              {t.board.colGroup}
            </span>
          </div>
          {cards.map((g) => (
            <div
              key={g.id}
              role="row"
              className={cx('relative grid items-center border-t border-line', g.status === 'played' && playedStripe)}
              style={{ gridTemplateColumns: cols }}
            >
              <span role="cell" className="py-3 ps-6 text-muted tnum">
                {g.rank}
              </span>
              <span role="cell" className="min-w-0 px-3 py-3">
                <Link href={`/lists/${listId}/games/${g.id}`} className="flex items-center gap-3 hover:text-ink">
                  <Cover src={g.cover_url} title={g.title} className="w-9 shrink-0 rounded-[5px]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold"><bdi>{g.title}</bdi></span>
                      {g.status === 'played' && <PlayedTag t={t} />}
                    </span>
                    <span className="text-[12.5px] text-muted">
                      {g.status === 'played' ? t.board.playedOn(monthYear(t.locale, g.played_at)) : ''}
                      {t.common.scoredOf(g.scored_count, g.member_count)}
                    </span>
                  </span>
                </Link>
              </span>
              {showPeople &&
                (g.scores ?? []).map((s) => (
                  <span
                    role="cell"
                    key={s.user_id}
                    className={cx('px-3 py-3 text-end tnum', s.tag === 'hype' ? 'text-hype' : s.tag ? 'text-ink' : 'text-[#6f7480]')}
                  >
                    {fmtScore(s.personal)}
                  </span>
                ))}
              <span role="cell" className="py-3 ps-3 pe-6 text-end font-display text-xl font-semibold tnum">
                {fmtScore(g.group_score)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlayedTab({ board, t }: { board: Board; t: T }) {
  if (board.played.length === 0) {
    return (
      <section className={cx(card, 'flex flex-col gap-2 p-6')}>
        <h2 className="text-base font-semibold">{t.board.playedEmptyTitle}</h2>
        <p className="text-muted">{t.board.playedEmptyBody}</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="fav-h" className="flex flex-col gap-4">
      <SectionHeading id="fav-h" title={t.board.favTitle} note={t.board.favNote} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {board.played.map((g, i) => (
          <Link key={g.id} href={`/lists/${board.list.id}/games/${g.id}`} className={cx(card, 'flex gap-4 p-4 hover:bg-raised')}>
            <Cover src={g.cover_url} title={g.title} className="w-[72px] shrink-0 rounded-lg" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[12.5px] text-muted">
                #{i + 1} · {monthYear(t.locale, g.played_at)}
              </span>
              <span className="truncate font-semibold"><bdi>{g.title}</bdi></span>
              <span className="mt-auto flex items-baseline gap-2">
                <span className="font-display text-[28px] leading-8 font-bold tnum">{fmtScore(g.group_score)}</span>
                {!g.me_scored && <span className="text-[12.5px] text-muted">{t.board.scoreToSeeIt}</span>}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}


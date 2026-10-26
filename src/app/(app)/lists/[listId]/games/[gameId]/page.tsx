import Link from 'next/link'
import type { Metadata } from 'next'
import { getListGame } from '@/lib/data'
import { fmtScore } from '@/lib/format'
import { joinNames } from '@/i18n/format'
import { getT } from '@/i18n/server'
import { Avatar, Cover, Icon, Tag, btn, card, cx } from '@/components/ui'
import { ScoreForm } from '@/components/score-form'
import { MarkPlayedButton, RemoveFromListButton, StatusButton } from '@/components/list-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.game }
}

export default async function ListGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string; gameId: string }>
  searchParams: Promise<{ played?: string }>
}) {
  const { listId, gameId } = await params
  const { played } = await searchParams
  const [g, t] = await Promise.all([getListGame(listId, gameId), getT()])
  const c = g.card
  const scored = g.mine.scored
  const justPlayed = played === '1' && g.status === 'played'

  let status: string
  if (g.status === 'hidden') status = t.game.statusHidden
  else if (g.status === 'played') status = t.game.statusPlayed
  else if (!scored) status = t.game.statusUnscored(c?.scored_count ?? 0, g.list.member_count)
  else if (g.section === 'ranked') status = t.game.statusRanked(c?.rank ?? 0, g.list.name)
  else if (g.section === 'waiting') status = t.game.statusWaiting(g.list.needed, g.list.member_count)
  else if (g.section === 'blocked') status = t.game.statusBlocked(joinNames(t.locale, c?.cant_play ?? []))
  else status = ''
  const sep = t.locale === 'ar' ? '، ' : ', '

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 pt-2 pb-10 lg:gap-6 lg:px-10 lg:pt-7">
      <nav aria-label={t.game.breadcrumb} className="flex items-center gap-1 text-[13px] text-muted">
        <Link href={`/lists/${listId}`} className="-ms-3 flex min-h-11 items-center gap-1 px-3 hover:text-ink lg:ms-0 lg:min-h-0 lg:px-0">
          <Icon.back size={20} className="lg:hidden rtl:-scale-x-100" />
          {g.list.name}
        </Link>
        <span aria-hidden className="hidden lg:inline">/</span>
        <span className="hidden text-ink lg:inline"><bdi>{g.game.title}</bdi></span>
      </nav>

      {justPlayed && (
        <p role="status" className="rounded-2xl bg-accent-tint px-4 py-3 text-accent">
          {t.game.justPlayed}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex items-end gap-4 lg:w-[260px] lg:shrink-0 lg:flex-col lg:items-stretch">
          <Cover src={g.game.cover_url} title={g.game.title} alt={t.common.coverAlt(g.game.title)} className="w-[112px] rounded-lg lg:w-full lg:rounded-xl" />
          <div className="flex min-w-0 flex-col gap-1 pb-1 lg:hidden">
            <span className="text-xs text-muted">{g.game.genres.slice(0, 3).join(' · ')}</span>
            <h1 className="font-display text-2xl leading-[30px] font-bold tracking-tight"><bdi>{g.game.title}</bdi></h1>
            {c?.added_by_name && <span className="text-[13px] text-muted">{t.game.addedBy(c.added_by_name)}</span>}
          </div>
          <dl className="hidden grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] lg:grid">
            {g.game.genres.length > 0 && (
              <>
                <dt className="text-muted">{t.game.genres}</dt>
                <dd>{g.game.genres.join(sep)}</dd>
              </>
            )}
            {g.game.release_year && (
              <>
                <dt className="text-muted">{t.game.released}</dt>
                <dd>{g.game.release_year}</dd>
              </>
            )}
            {c?.added_by_name && (
              <>
                <dt className="text-muted">{t.game.addedByLabel}</dt>
                <dd>{c.added_by_name}</dd>
              </>
            )}
            {g.other_lists.length > 0 && (
              <>
                <dt className="text-muted">{t.game.alsoIn}</dt>
                <dd>{g.other_lists.map((l) => l.name).join(sep)}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="hidden flex-col gap-1 lg:flex">
            <h1 className="font-display text-[32px] leading-[38px] font-bold tracking-tight"><bdi>{g.game.title}</bdi></h1>
            <p className="text-sm text-muted">{status}</p>
          </div>
          {!scored && (
            <p className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3 text-[13px] text-soft lg:hidden">
              <Icon.lock size={18} className="mt-px shrink-0 text-muted" />
              {status}
            </p>
          )}

          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <section aria-labelledby="mine-h" className="flex flex-1 flex-col gap-4 lg:rounded-2xl lg:bg-surface lg:p-6">
              <h2 id="mine-h" className="hidden text-base font-semibold lg:block">
                {t.game.yourScore}
              </h2>
              <ScoreForm
                key={`${g.mine.before}-${g.mine.after}-${g.mine.can_play}`}
                gameId={g.game.id}
                initial={{ before: g.mine.before, after: g.mine.after, canPlay: g.mine.can_play }}
                startPlayed={justPlayed}
                saveLabel={scored ? t.game.updateScore : t.game.saveAndShow}
                savedNote={
                  g.other_lists.length
                    ? t.game.savedIn(g.list.name, joinNames(t.locale, g.other_lists.map((l) => l.name)))
                    : t.common.saved
                }
              />
            </section>

            <section aria-labelledby="group-h" className={cx(card, 'flex flex-1 flex-col gap-4 p-4 lg:p-6')}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="group-h" className="text-base font-semibold">
                  {g.list.name}
                </h2>
                <span className="text-[13px] text-muted">
                  {t.common.scoredOf(c?.scored_count ?? g.members.filter((m) => m.scored).length, g.list.member_count)}
                </span>
              </div>
              {scored ? (
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-[40px] leading-[44px] font-bold text-accent tnum">{fmtScore(c?.group_score ?? null)}</span>
                  <span className="text-[13px] text-muted">
                    {t.board.groupScore}
                    {g.section === 'ranked' && c?.rank ? t.game.ranks(c.rank) : ''}
                    {g.section !== 'ranked' && <span className="lg:hidden"> · {status}</span>}
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-[40px] leading-[44px] font-bold text-[#4a4f59]">?</span>
                  <span className="text-[13px] text-muted">{t.game.hiddenGroup}</span>
                </div>
              )}
              <ul className="flex flex-col">
                {g.members.map((m, i) => (
                  <li key={m.id} className={cx('flex min-h-[52px] items-center gap-3 py-1.5', i > 0 && 'border-t border-line')}>
                    <Avatar name={m.name} hue={m.hue} url={m.avatar_url} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{m.is_me ? t.common.you : m.name}</span>
                      <span className="text-[12.5px] text-muted">
                        {!m.scored
                          ? t.game.notScoredYet
                          : scored
                            ? m.after !== null
                              ? t.game.beforeAfter(fmtScore(m.before), fmtScore(m.after))
                              : t.game.beforeOnly(fmtScore(m.before))
                            : t.game.scored}
                        {m.can_play === false ? t.game.cantPlay : ''}
                      </span>
                    </span>
                    {scored && m.scored && <Tag kind={m.after !== null ? 'played' : 'hype'} label={m.after !== null ? t.tags.played : t.tags.hype} />}
                    {!scored && m.scored && !m.is_me ? (
                      <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                        <Icon.lock size={14} />
                        {t.game.hidden}
                      </span>
                    ) : (
                      <span className={cx('w-10 text-end font-display text-lg font-semibold tnum', m.scored ? 'text-ink' : 'text-faint')}>
                        {m.scored ? fmtScore(m.personal) : '—'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-auto text-[12.5px] text-muted">
                {scored ? t.game.eachCounts : t.game.blindNote}
              </p>
            </section>
          </div>

          <section aria-label={t.game.gameInList} className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex flex-wrap gap-2">
              {g.status === 'active' && <MarkPlayedButton listId={listId} gameId={g.game.id} />}
              {g.status === 'played' && (
                <StatusButton listId={listId} gameId={g.game.id} status="active" label={t.game.moveBack} confirmLabel={t.game.yesMoveBack} />
              )}
              {g.status === 'active' && g.is_creator && (
                <StatusButton listId={listId} gameId={g.game.id} status="hidden" label={t.game.hide} confirmLabel={t.game.yesHide} tone="outline" />
              )}
              {g.status === 'hidden' && g.is_creator && (
                <StatusButton listId={listId} gameId={g.game.id} status="active" label={t.game.bringBack} confirmLabel={t.game.yesBringBack} />
              )}
              {g.is_adder && <RemoveFromListButton listId={listId} gameId={g.game.id} />}
            </div>
            <p className="text-[12.5px] text-muted">
              {g.is_adder
                ? t.game.youAdded
                : g.is_creator
                  ? t.game.creatorNote(c?.added_by_name ?? null)
                  : t.game.onlyAdder(c?.added_by_name ?? null)}
            </p>
          </section>
          {g.mine.in_library && (
            <Link href={`/library/${g.game.id}`} className="self-start py-2 text-[13.5px] text-muted underline-offset-4 hover:text-ink hover:underline">
              {t.game.editLibrary}
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}

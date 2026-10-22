import Link from 'next/link'
import type { Metadata } from 'next'
import { getListGame } from '@/lib/data'
import { fmtScore, listNames } from '@/lib/format'
import { Avatar, Cover, Icon, Tag, btn, card, cx } from '@/components/ui'
import { ScoreForm } from '@/components/score-form'
import { MarkPlayedButton, RemoveFromListButton, StatusButton } from '@/components/list-actions'

export const metadata: Metadata = { title: 'Game' }

export default async function ListGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string; gameId: string }>
  searchParams: Promise<{ played?: string }>
}) {
  const { listId, gameId } = await params
  const { played } = await searchParams
  const g = await getListGame(listId, gameId)
  const c = g.card
  const scored = g.mine.scored
  const justPlayed = played === '1' && g.status === 'played'

  let status: string
  if (g.status === 'hidden') status = 'Hidden from this list by its creator.'
  else if (g.status === 'played') status = 'Played together.'
  else if (!scored) status = `${c?.scored_count ?? 0} of ${g.list.member_count} have scored it. Their scores and its rank show once you save yours.`
  else if (g.section === 'ranked') status = `Ranked #${c?.rank} in ${g.list.name}.`
  else if (g.section === 'waiting') status = `Waiting: ranked once ${g.list.needed} of ${g.list.member_count} have scored it.`
  else if (g.section === 'blocked') status = `Held back: ${listNames(c?.cant_play ?? [])} can't play it yet.`
  else status = ''

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 pt-2 pb-10 lg:gap-6 lg:px-10 lg:pt-7">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted">
        <Link href={`/lists/${listId}`} className="-ml-3 flex min-h-11 items-center gap-1 px-3 hover:text-ink lg:-ml-0 lg:min-h-0 lg:px-0">
          <Icon.back size={20} className="lg:hidden" />
          {g.list.name}
        </Link>
        <span aria-hidden className="hidden lg:inline">/</span>
        <span className="hidden text-ink lg:inline">{g.game.title}</span>
      </nav>

      {justPlayed && (
        <p role="status" className="rounded-2xl bg-accent-tint px-4 py-3 text-accent">
          Marked as played together. Now give it your After score.
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex items-end gap-4 lg:w-[260px] lg:shrink-0 lg:flex-col lg:items-stretch">
          <Cover src={g.game.cover_url} title={g.game.title} alt={`${g.game.title} cover`} className="w-[112px] rounded-lg lg:w-full lg:rounded-xl" />
          <div className="flex min-w-0 flex-col gap-1 pb-1 lg:hidden">
            <span className="text-xs text-muted">{g.game.genres.slice(0, 3).join(' · ')}</span>
            <h1 className="font-display text-2xl leading-[30px] font-bold tracking-tight">{g.game.title}</h1>
            {c?.added_by_name && <span className="text-[13px] text-muted">Added by {c.added_by_name}</span>}
          </div>
          <dl className="hidden grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] lg:grid">
            {g.game.genres.length > 0 && (
              <>
                <dt className="text-muted">Genres</dt>
                <dd>{g.game.genres.join(', ')}</dd>
              </>
            )}
            {g.game.release_year && (
              <>
                <dt className="text-muted">Released</dt>
                <dd>{g.game.release_year}</dd>
              </>
            )}
            {c?.added_by_name && (
              <>
                <dt className="text-muted">Added by</dt>
                <dd>{c.added_by_name}</dd>
              </>
            )}
            {g.other_lists.length > 0 && (
              <>
                <dt className="text-muted">Also in</dt>
                <dd>{g.other_lists.map((l) => l.name).join(', ')}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="hidden flex-col gap-1 lg:flex">
            <h1 className="font-display text-[32px] leading-[38px] font-bold tracking-tight">{g.game.title}</h1>
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
                Your score
              </h2>
              <ScoreForm
                key={`${g.mine.before}-${g.mine.after}-${g.mine.can_play}`}
                gameId={g.game.id}
                initial={{ before: g.mine.before, after: g.mine.after, canPlay: g.mine.can_play }}
                startPlayed={justPlayed}
                saveLabel={scored ? 'Update score' : 'Save and show scores'}
                savedNote={g.other_lists.length ? `Saved. It counts in ${g.list.name} and ${g.other_lists.map((l) => l.name).join(', ')}.` : 'Saved.'}
              />
            </section>

            <section aria-labelledby="group-h" className={cx(card, 'flex flex-1 flex-col gap-4 p-4 lg:p-6')}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="group-h" className="text-base font-semibold">
                  {g.list.name}
                </h2>
                <span className="text-[13px] text-muted">
                  {c?.scored_count ?? g.members.filter((m) => m.scored).length} of {g.list.member_count} scored
                </span>
              </div>
              {scored ? (
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-[40px] leading-[44px] font-bold text-accent tnum">{fmtScore(c?.group_score ?? null)}</span>
                  <span className="text-[13px] text-muted">
                    group score{g.section === 'ranked' && c?.rank ? ` · ranks #${c.rank}` : ''}
                    {g.section !== 'ranked' && <span className="lg:hidden"> · {status}</span>}
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-[40px] leading-[44px] font-bold text-[#4a4f59]">?</span>
                  <span className="text-[13px] text-muted">Group score and rank are hidden</span>
                </div>
              )}
              <ul className="flex flex-col">
                {g.members.map((m, i) => (
                  <li key={m.id} className={cx('flex min-h-[52px] items-center gap-3 py-1.5', i > 0 && 'border-t border-line')}>
                    <Avatar name={m.name} hue={m.hue} url={m.avatar_url} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{m.is_me ? 'You' : m.name}</span>
                      <span className="text-[12.5px] text-muted">
                        {!m.scored
                          ? 'Not scored yet'
                          : scored
                            ? m.after !== null
                              ? `Before ${fmtScore(m.before)} · After ${fmtScore(m.after)}`
                              : `Before ${fmtScore(m.before)}`
                            : 'Scored'}
                        {m.can_play === false ? " · can't play" : ''}
                      </span>
                    </span>
                    {scored && m.scored && <Tag kind={m.after !== null ? 'played' : 'hype'} />}
                    {!scored && m.scored && !m.is_me ? (
                      <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                        <Icon.lock size={14} />
                        Hidden
                      </span>
                    ) : (
                      <span className={cx('w-10 text-right font-display text-lg font-semibold tnum', m.scored ? 'text-ink' : 'text-faint')}>
                        {m.scored ? fmtScore(m.personal) : '—'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-auto text-[12.5px] text-muted">
                {scored
                  ? 'Each person counts once. People who haven’t scored aren’t counted.'
                  : 'Blind scoring: nobody sees the numbers before giving their own.'}
              </p>
            </section>
          </div>

          <section aria-label="Game in this list" className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex flex-wrap gap-2">
              {g.status === 'active' && <MarkPlayedButton listId={listId} gameId={g.game.id} />}
              {g.status === 'played' && (
                <StatusButton listId={listId} gameId={g.game.id} status="active" label="Move back to Up next" confirmLabel="Yes, move it back" />
              )}
              {g.status === 'active' && g.is_creator && (
                <StatusButton listId={listId} gameId={g.game.id} status="hidden" label="Hide from this list" confirmLabel="Yes, hide it" tone="outline" />
              )}
              {g.status === 'hidden' && g.is_creator && (
                <StatusButton listId={listId} gameId={g.game.id} status="active" label="Bring it back" confirmLabel="Yes, bring it back" />
              )}
              {g.is_adder && <RemoveFromListButton listId={listId} gameId={g.game.id} />}
            </div>
            <p className="text-[12.5px] text-muted">
              {g.is_adder
                ? 'You added this game, so you can remove it. Everyone’s scores stay saved.'
                : g.is_creator
                  ? `${c?.added_by_name ?? 'Someone else'} added it, so only they can remove it. As the list creator you can hide it.`
                  : `Only ${c?.added_by_name ?? 'the person who added it'} can remove it.`}
            </p>
          </section>
          {g.mine.in_library && (
            <Link href={`/library/${g.game.id}`} className="self-start py-2 text-[13.5px] text-muted underline-offset-4 hover:text-ink hover:underline">
              Edit categories and lists for this game
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}

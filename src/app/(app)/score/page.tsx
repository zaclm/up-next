import Link from 'next/link'
import type { Metadata } from 'next'
import { getQueue, getSteamNudges } from '@/lib/data'
import { joinNames, monthYear } from '@/i18n/format'
import { getT, type T } from '@/i18n/server'
import type { QueueItem } from '@/lib/types'
import { Cover, Icon, SectionHeading, btn, card, cx } from '@/components/ui'
import { SkipAfterButton } from '@/components/skip-after'
import { SkipSteamNudge } from '@/components/steam-nudge'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.toScore }
}

export default async function ScoreQueuePage() {
  const [queue, nudges, t] = await Promise.all([getQueue(), getSteamNudges(), getT()])
  const after = queue.filter((g) => g.kind === 'after')
  const fresh = queue.filter((g) => g.kind === 'score')
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">{t.queue.title}</h1>
        <p className="flex items-center gap-2 text-[13px] text-muted lg:text-sm">
          <Icon.lock size={14} className="shrink-0" />
          {t.queue.intro}
        </p>
      </header>

      {queue.length === 0 && nudges.length === 0 && (
        <section className={cx(card, 'flex flex-col gap-2 p-6')}>
          <h2 className="text-base font-semibold">{t.queue.caughtUp}</h2>
          <p className="text-muted">{t.queue.caughtUpBody}</p>
        </section>
      )}

      {after.length > 0 && (
        <section aria-labelledby="after-h" className="flex flex-col gap-3">
          <SectionHeading
            id="after-h"
            title={<>{t.queue.afterTitle} <span className="font-normal text-muted">· {after.length}</span></>}
            note={t.queue.afterNote}
          />
          <QueueList items={after} t={t} />
        </section>
      )}

      {nudges.length > 0 && (
        <section aria-labelledby="steam-h" className="flex flex-col gap-3">
          <SectionHeading
            id="steam-h"
            title={<>{t.queue.steamTitle} <span className="font-normal text-muted">· {nudges.length}</span></>}
            note={t.queue.steamNote}
          />
          <ul className={cx(card, 'flex flex-col py-1')}>
            {nudges.map((g, i) => (
              <li key={g.id} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                <Cover src={g.cover_url} title={g.title} className="w-[42px] shrink-0 rounded-md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">
                    <bdi>{g.title}</bdi>
                  </span>
                  <span className="truncate text-[12.5px] text-muted">
                    {t.steam.playtime(g.playtime_min)}
                    {g.last_played_at ? ` · ${t.queue.lastPlayed(monthYear(t.locale, g.last_played_at))}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row-reverse sm:items-center sm:gap-1">
                  <Link href={`/library/${g.id}?played=1`} className={btn.score}>
                    {t.queue.addAfter}
                  </Link>
                  <SkipSteamNudge gameId={g.id} title={g.title} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fresh.length > 0 && (
        <section aria-labelledby="new-h" className="flex flex-col gap-3">
          {(after.length > 0 || nudges.length > 0) && (
            <SectionHeading id="new-h" title={<>{t.queue.needsScore} <span className="font-normal text-muted">· {fresh.length}</span></>} />
          )}
          <QueueList items={fresh} t={t} />
        </section>
      )}
    </main>
  )
}

function QueueList({ items, t }: { items: QueueItem[]; t: T }) {
  return (
    <ul className={cx(card, 'flex flex-col py-1')}>
      {items.map((g, i) => {
        const first = g.lists[0]
        const isAfter = g.kind === 'after'
        return (
          <li key={`${g.kind}-${g.id}`} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
            <Cover src={g.cover_url} title={g.title} className="w-[42px] shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold"><bdi>{g.title}</bdi></span>
              <span className="truncate text-[12.5px] text-muted">
                {isAfter
                  ? t.queue.playedIn(joinNames(t.locale, g.lists.map((l) => l.name)), monthYear(t.locale, g.played_at))
                  : g.lists.map((l) => `${l.name} · ${t.common.scoredOf(l.scored_count, l.member_count)}`).join(' — ')}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row-reverse sm:items-center sm:gap-1">
              <Link href={`/lists/${first.id}/games/${g.id}${isAfter ? '?played=1' : ''}`} className={btn.score}>
                {isAfter ? t.queue.addAfter : t.queue.score}
              </Link>
              {isAfter && <SkipAfterButton listId={first.id} gameId={g.id} title={g.title} />}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

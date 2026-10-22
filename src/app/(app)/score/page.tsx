import Link from 'next/link'
import type { Metadata } from 'next'
import { getQueue } from '@/lib/data'
import { Cover, Icon, btn, card, cx } from '@/components/ui'

export const metadata: Metadata = { title: 'To score' }

export default async function ScoreQueuePage() {
  const queue = await getQueue()
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">To score</h1>
        <p className="flex items-center gap-2 text-[13px] text-muted lg:text-sm">
          <Icon.lock size={14} />
          Games in your lists you haven&apos;t scored. Other people&apos;s numbers show once you score.
        </p>
      </header>

      {queue.length === 0 ? (
        <section className={cx(card, 'flex flex-col gap-2 p-6')}>
          <h2 className="text-base font-semibold">You&apos;re all caught up</h2>
          <p className="text-muted">When a friend adds a game you haven&apos;t scored, it shows up here.</p>
        </section>
      ) : (
        <ul className={cx(card, 'flex flex-col py-1')}>
          {queue.map((g, i) => {
            const first = g.lists[0]
            return (
              <li key={g.id} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                <Cover src={g.cover_url} title={g.title} className="w-[42px] shrink-0 rounded-md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{g.title}</span>
                  <span className="truncate text-[12.5px] text-muted">
                    {g.lists.map((l) => `${l.name} · ${l.scored_count} of ${l.member_count} scored`).join(' — ')}
                  </span>
                </span>
                <Link href={`/lists/${first.id}/games/${g.id}`} className={cx(i === 0 ? btn.primary : btn.secondary, 'min-h-10 shrink-0 px-3.5')}>
                  Score
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

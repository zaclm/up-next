'use client'

import { useOptimistic, useTransition } from 'react'
import { setIncludePlayed } from '@/app/actions'
import { cx } from './ui'
import { useT } from '@/i18n/client'

/**
 * "Played games" switch on a list's Up next tab. On: games the group already played are
 * ranked together with the rest, marked "Played". Saved for you, for this list.
 */
export function PlayedSwitch({ listId, on, count }: { listId: string; on: boolean; count: number }) {
  const t = useT()
  const [pending, start] = useTransition()
  const [value, setValue] = useOptimistic(on)
  const toggle = () =>
    start(async () => {
      setValue(!value)
      await setIncludePlayed(listId, !value)
    })
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={toggle}
      disabled={pending}
      className={cx(
        'flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-[13.5px] transition-colors lg:min-h-9',
        value ? 'bg-accent-tint text-ink' : 'bg-surface text-soft hover:text-ink',
      )}
    >
      <span className={cx('flex h-5 w-9 shrink-0 rounded-full p-[3px] transition-colors', value ? 'justify-end bg-accent' : 'justify-start bg-[#3a3f4a]')}>
        <span className={cx('size-3.5 rounded-full', value ? 'bg-ground' : 'bg-ink')} />
      </span>
      <span>
        {t.board.includePlayed}
        {count > 0 && <span className="ms-1 text-muted tnum">· {count}</span>}
      </span>
    </button>
  )
}

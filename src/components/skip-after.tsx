'use client'

import { useTransition } from 'react'
import { skipAfter } from '@/app/actions'
import { btn, cx } from './ui'
import { useT } from '@/i18n/client'

/** "Didn't play": for a game the group played without you; the After reminder goes away. */
export function SkipAfterButton({ listId, gameId, title }: { listId: string; gameId: number; title: string }) {
  const t = useT()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t.queue.didntPlayAria(title)}
      onClick={() => start(async () => void (await skipAfter(listId, gameId)))}
      className={cx(btn.ghost, 'min-h-8 shrink-0 px-2 text-[12.5px] sm:min-h-10 sm:px-2.5 sm:text-[13px] lg:min-h-9')}
    >
      {pending ? '…' : t.queue.didntPlay}
    </button>
  )
}

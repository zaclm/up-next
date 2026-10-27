'use client'

import { useTransition } from 'react'
import { skipSteamNudge } from '@/app/actions'
import { useT } from '@/i18n/client'
import { btn, cx } from './ui'

/** To score → Played on Steam → "Not now". */
export function SkipSteamNudge({ gameId, title }: { gameId: number; title: string }) {
  const t = useT()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t.queue.notNowAria(title)}
      onClick={() => start(async () => void (await skipSteamNudge(gameId)))}
      className={cx(btn.ghost, 'min-h-8 shrink-0 px-2 text-[12.5px] sm:min-h-10 sm:px-2.5 sm:text-[13px] lg:min-h-9')}
    >
      {pending ? '…' : t.queue.notNow}
    </button>
  )
}

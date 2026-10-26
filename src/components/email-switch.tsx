'use client'

import { useOptimistic, useTransition } from 'react'
import { setEmailReminders } from '@/app/actions'
import { useT } from '@/i18n/client'
import { cx } from './ui'

/** Account → "Email me when my group plays a game together". */
export function EmailRemindersSwitch({ on }: { on: boolean }) {
  const t = useT()
  const [pending, start] = useTransition()
  const [value, setValue] = useOptimistic(on)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setValue(!value)
          await setEmailReminders(!value)
        })
      }
      className="flex min-h-14 w-full items-center gap-4 rounded-2xl bg-surface px-4 py-3 text-start"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{t.account.emailLabel}</span>
        <span className="text-[12.5px] text-muted">{t.account.emailHint}</span>
      </span>
      <span className={cx('flex h-6 w-11 shrink-0 rounded-full p-[3px] transition-colors', value ? 'justify-end bg-accent' : 'justify-start bg-[#3a3f4a]')}>
        <span className={cx('size-[18px] rounded-full', value ? 'bg-ground' : 'bg-ink')} />
      </span>
    </button>
  )
}

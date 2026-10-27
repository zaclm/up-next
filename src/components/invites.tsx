'use client'

import { useState, useTransition } from 'react'
import { answerInvite } from '@/app/actions'
import { useT } from '@/i18n/client'
import { joinNames } from '@/i18n/format'
import type { ListInvite } from '@/lib/types'
import { Icon, btn, card, cx } from './ui'

/** "Zac invited you to Squad Night · with Karim and Omar" — Join / No thanks. */
export function InviteCard({ invite }: { invite: ListInvite }) {
  const t = useT()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const answer = (accept: boolean) =>
    start(async () => {
      setError(null)
      const res = await answerInvite(invite.list_id, accept)
      if (res && !res.ok) setError(res.error)
    })
  return (
    <article className={cx(card, 'flex flex-col gap-3 p-4 shadow-[inset_0_0_0_1px_var(--color-accent)] sm:flex-row sm:items-center')}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-tint text-accent">
        <Icon.userPlus size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{t.invites.from(invite.from_name, invite.list_name)}</span>
        <span className="truncate text-[12.5px] text-muted">{t.invites.with(joinNames(t.locale, invite.member_names))}</span>
        {error && (
          <span role="alert" className="text-[13px] text-danger">
            {error}
          </span>
        )}
      </span>
      <span className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => answer(true)} className={cx(btn.primary, 'flex-1 sm:flex-none')}>
          {t.invites.join}
        </button>
        <button type="button" disabled={pending} onClick={() => answer(false)} className={cx(btn.ghost, 'flex-1 sm:flex-none')}>
          {t.invites.decline}
        </button>
      </span>
    </article>
  )
}

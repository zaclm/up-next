'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setListGameStatus, removeListGame, leaveList } from '@/app/actions'
import { btn, cx } from './ui'

export function MarkPlayedButton({ listId, gameId, className }: { listId: string; gameId: number; className?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className={cx(btn.primary, className)}
        onClick={() =>
          start(async () => {
            const res = await setListGameStatus(listId, gameId, 'played')
            if (!res.ok) setError(res.error)
            else router.push(`/lists/${listId}/games/${gameId}?played=1`)
          })
        }
      >
        {pending ? 'Saving…' : 'We played it together'}
      </button>
      {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
    </span>
  )
}

/** Two-step button for actions that are hard to undo (no browser confirm dialogs). */
export function ConfirmAction({
  label,
  confirmLabel,
  run,
  tone = 'secondary',
  className,
}: {
  label: string
  confirmLabel: string
  run: () => Promise<{ ok: boolean; error?: string } | void>
  tone?: 'secondary' | 'danger' | 'outline'
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-2">
        {!armed ? (
          <button type="button" className={cx(btn[tone], className)} onClick={() => setArmed(true)}>
            {label}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              className={cx(tone === 'danger' ? btn.danger : btn.primary, className)}
              onClick={() =>
                start(async () => {
                  const res = await run()
                  if (res && !res.ok) setError(res.error ?? 'Something went wrong.')
                  setArmed(false)
                })
              }
            >
              {pending ? 'Working…' : confirmLabel}
            </button>
            <button type="button" className={btn.ghost} onClick={() => setArmed(false)}>
              Cancel
            </button>
          </>
        )}
      </span>
      {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
    </span>
  )
}

export function StatusButton({
  listId,
  gameId,
  status,
  label,
  confirmLabel,
  tone,
}: {
  listId: string
  gameId: number
  status: 'active' | 'played' | 'hidden'
  label: string
  confirmLabel: string
  tone?: 'secondary' | 'danger' | 'outline'
}) {
  return <ConfirmAction label={label} confirmLabel={confirmLabel} tone={tone} run={() => setListGameStatus(listId, gameId, status)} />
}

export function RemoveFromListButton({ listId, gameId }: { listId: string; gameId: number }) {
  return (
    <ConfirmAction
      label="Remove from list"
      confirmLabel="Yes, remove it"
      tone="danger"
      run={async () => {
        const res = await removeListGame(listId, gameId)
        return res ?? { ok: true }
      }}
    />
  )
}

export function LeaveListButton({ listId, name }: { listId: string; name: string }) {
  return (
    <ConfirmAction
      label={`Leave ${name}`}
      confirmLabel="Yes, leave"
      tone="danger"
      run={async () => {
        const res = await leaveList(listId)
        return res ?? { ok: true }
      }}
    />
  )
}

'use client'

import { useState, useTransition } from 'react'
import { disconnectDiscord, disconnectSteam, syncSteamNow } from '@/app/actions'
import { useT } from '@/i18n/client'
import { ConfirmAction } from './list-actions'
import { Icon, btn, cx } from './ui'

/** Account → Steam → Sync again: imports new games and refreshes playtime and friends. */
export function SyncSteamButton() {
  const t = useT()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <span className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className={cx(btn.secondary, 'self-start')}
        onClick={() =>
          start(async () => {
            setMessage(null)
            const res = await syncSteamNow()
            if (!res.ok) setMessage({ ok: false, text: res.error })
            else if (res.data.status === 'private') setMessage({ ok: false, text: t.steam.privateBody })
            else if (res.data.status === 'empty') setMessage({ ok: false, text: t.steam.emptyBody })
            else setMessage({ ok: true, text: t.steam.synced(res.data.added, res.data.total) })
          })
        }
      >
        <Icon.refresh size={16} className={pending ? 'animate-spin' : undefined} />
        {pending ? t.steam.syncing : t.steam.syncAgain}
      </button>
      {message && (
        <span role={message.ok ? 'status' : 'alert'} className={cx('text-[13px]', message.ok ? 'text-accent' : 'text-hype')}>
          {message.text}
        </span>
      )}
    </span>
  )
}

export function DisconnectSteamButton() {
  const t = useT()
  return <ConfirmAction label={t.steam.disconnect} confirmLabel={t.steam.yesDisconnect} tone="outline" run={() => disconnectSteam()} />
}

export function DisconnectDiscordButton() {
  const t = useT()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await disconnectDiscord()))}
      className={cx(btn.ghost, 'min-h-9 px-2 text-[13px] underline-offset-4 hover:underline')}
    >
      {t.discord.disconnect}
    </button>
  )
}

import type { T } from '@/i18n/server'
import { relativeTime } from '@/i18n/format'
import type { Connections } from '@/lib/types'
import { DisconnectSteamButton, SyncSteamButton } from './connections'
import { Icon, btn, card, cx } from './ui'

/** What ?steam=… says after coming back from Steam, in words. */
export function steamResult(t: T, value: string | undefined): { ok: boolean; text: string } | null {
  if (!value) return null
  const imported = value.match(/^imported-(\d+)$/)
  if (imported) return { ok: true, text: t.steam.results.imported(Number(imported[1])) }
  const known = t.steam.results[value as Exclude<keyof T['steam']['results'], 'imported'>]
  if (typeof known !== 'string') return null
  return { ok: value === 'no-key', text: known }
}

export function ResultBanner({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null
  return (
    <p role={result.ok ? 'status' : 'alert'} className={cx('rounded-xl px-4 py-3 text-[13.5px]', result.ok ? 'bg-accent-tint text-accent' : 'bg-hype-tint text-hype')}>
      {result.text}
    </p>
  )
}

/** Connect Steam, or the connected account with Sync again and Disconnect. */
export function SteamSection({
  t,
  steam,
  importOn,
  next,
  now,
}: {
  t: T
  steam: Connections['steam']
  importOn: boolean
  next: string
  now: number
}) {
  if (!steam) {
    return (
      <div className={cx(card, 'flex flex-col gap-3 p-4')}>
        <a href={`/api/steam/connect?next=${encodeURIComponent(next)}`} className={cx(btn.primary, 'self-start bg-[#1b2838] text-white hover:bg-[#2a475e]')}>
          <Icon.steam size={20} />
          {t.steam.connect}
        </a>
        <p className="text-[12.5px] text-muted">{t.steam.connectHint}</p>
      </div>
    )
  }
  const status = !importOn ? t.steam.noKey : steam.status === 'private' ? t.steam.privateBody : steam.status === 'empty' ? t.steam.emptyBody : steam.status === 'error' ? t.steam.errorBody : null
  return (
    <div className={cx(card, 'flex flex-col gap-4 p-4')}>
      <div className="flex items-center gap-3">
        {steam.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={steam.avatar_url} alt="" width={44} height={44} className="size-11 shrink-0 rounded-lg" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#1b2838] text-white">
            <Icon.steam size={22} />
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{t.steam.connectedAs(steam.name ?? steam.steam_id)}</span>
          <span className="text-[12.5px] text-muted">
            {t.steam.gameCount(steam.game_count)}
            {steam.synced_at ? ` · ${t.steam.lastSynced(relativeTime(t.locale, steam.synced_at, now))}` : ''}
          </span>
        </span>
      </div>
      {status && <p className="text-[13px] text-hype">{status}</p>}
      <div className="flex flex-wrap items-start gap-2">
        {importOn && <SyncSteamButton />}
        <DisconnectSteamButton />
      </div>
      <p className="text-[12.5px] text-muted">{t.steam.disconnectNote}</p>
    </div>
  )
}

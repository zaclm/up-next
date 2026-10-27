'use client'

import { useState, useTransition } from 'react'
import { inviteToList } from '@/app/actions'
import { useT } from '@/i18n/client'
import { joinNames } from '@/i18n/format'
import type { FriendSuggestion } from '@/lib/types'
import { Avatar, Icon, cx } from './ui'

/** A friend who uses Up Next, with one button per list of yours they aren't in yet. */
export function FriendRow({ person, lists }: { person: FriendSuggestion; lists: { id: string; name: string }[] }) {
  const t = useT()
  const [invited, setInvited] = useState<string[]>(person.invited_lists)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const open = lists.filter((l) => !person.in_lists.includes(l.id))
  const context = [
    person.steam_name ? t.friends.viaSteam(person.steam_name) : null,
    person.servers.length ? t.friends.viaServers(joinNames(t.locale, person.servers)) : null,
  ].filter(Boolean)

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={person.name} hue={person.hue} url={person.avatar_url} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{person.name}</span>
          <span className="truncate text-[12.5px] text-muted">{context.join(' · ')}</span>
          {message && (
            <span role={message.ok ? 'status' : 'alert'} className={cx('text-[12.5px]', message.ok ? 'text-accent' : 'text-danger')}>
              {message.text}
            </span>
          )}
        </span>
      </span>
      {open.length === 0 ? (
        <span className="text-[12.5px] text-muted">{t.friends.inAll}</span>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <span className="text-[12.5px] text-muted">{t.friends.inviteTo}</span>
          {open.map((l) => {
            const done = invited.includes(l.id)
            return (
              <button
                key={l.id}
                type="button"
                disabled={done || pending}
                aria-label={done ? `${t.friends.invited}: ${l.name}` : `${t.friends.inviteTo} ${l.name}`}
                onClick={() =>
                  start(async () => {
                    setMessage(null)
                    const res = await inviteToList(l.id, person.id)
                    if (!res.ok) return setMessage({ ok: false, text: res.error })
                    setInvited((x) => [...x, l.id])
                    setMessage({ ok: true, text: t.friends.sent(person.name, l.name) })
                  })
                }
                className={cx(
                  'flex min-h-9 max-w-[220px] items-center gap-1.5 rounded-full px-3 text-[13px]',
                  done ? 'bg-accent-tint font-medium text-accent' : 'bg-active text-ink hover:bg-[#343843]',
                )}
              >
                {done ? <Icon.check size={14} /> : <Icon.plus size={14} />}
                <span className="truncate">
                  <bdi>{l.name}</bdi>
                </span>
              </button>
            )
          })}
        </span>
      )}
    </li>
  )
}

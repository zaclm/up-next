import type { Metadata } from 'next'
import { getConnections, getFriendSuggestions, getMyLists } from '@/lib/data'
import { discordClient, steamApiKey } from '@/lib/connect/config'
import { getT, type T } from '@/i18n/server'
import { DisconnectDiscordButton } from '@/components/connections'
import { FriendRow } from '@/components/friend-row'
import { ResultBanner, SteamSection, steamResult } from '@/components/steam-section'
import { Icon, SectionHeading, btn, card, cx } from '@/components/ui'
import type { FriendSuggestion } from '@/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.friends }
}

function discordResult(t: T, value: string | undefined) {
  if (!value) return null
  const text = t.discord.results[value as keyof T['discord']['results']]
  return text ? { ok: value === 'connected', text } : null
}

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ steam?: string; discord?: string }> }) {
  const [t, connections, people, lists, params] = await Promise.all([getT(), getConnections(), getFriendSuggestions(), getMyLists(), searchParams])
  const now = Date.now()
  const myLists = lists.map((l) => ({ id: l.id, name: l.name }))
  const fromSteam = people.filter((p) => p.steam_name)
  const fromDiscord = people.filter((p) => !p.steam_name && p.servers.length)

  const listOf = (rows: FriendSuggestion[]) => (
    <ul className={cx(card, 'flex flex-col divide-y divide-line px-4 py-1')}>
      {rows.map((p) => (
        <FriendRow key={p.id} person={p} lists={myLists} />
      ))}
    </ul>
  )

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 pt-4 pb-10 lg:px-10 lg:pt-7">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">{t.friends.title}</h1>
        <p className="text-[13px] text-muted lg:text-sm">{t.friends.subtitle}</p>
      </header>

      {myLists.length === 0 && <p className="rounded-xl bg-surface px-4 py-3 text-[13.5px] text-soft">{t.friends.noLists}</p>}

      <section aria-labelledby="steam-friends-h" className="flex flex-col gap-3">
        <SectionHeading id="steam-friends-h" title={t.friends.steamTitle} />
        <ResultBanner result={steamResult(t, params.steam)} />
        {!connections.steam ? (
          <>
            <p className="text-[13.5px] text-soft">{t.friends.steamConnectFirst}</p>
            <SteamSection t={t} steam={null} importOn={!!steamApiKey()} next="/friends" now={now} />
          </>
        ) : fromSteam.length ? (
          listOf(fromSteam)
        ) : (
          <p className={cx(card, 'p-4 text-[13.5px] text-muted')}>{t.friends.steamNone}</p>
        )}
      </section>

      <section aria-labelledby="discord-h" className="flex flex-col gap-3">
        <SectionHeading id="discord-h" title={t.discord.title} note={t.discord.note} />
        <ResultBanner result={discordResult(t, params.discord)} />
        {!connections.discord ? (
          discordClient() ? (
            <a href="/api/discord/connect?next=/friends" className={cx(btn.primary, 'self-start bg-[#5865f2] text-white hover:bg-[#6b76f4]')}>
              <Icon.people size={20} />
              {t.discord.connect}
            </a>
          ) : (
            <p className="text-[13px] text-muted">{t.discord.results['no-key']}</p>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-soft">
              <span className="flex items-center gap-1.5">
                <Icon.check size={16} className="text-accent" />
                {t.discord.connected(connections.discord.server_count)}
              </span>
              <DisconnectDiscordButton />
            </div>
            {fromDiscord.length ? listOf(fromDiscord) : <p className={cx(card, 'p-4 text-[13.5px] text-muted')}>{t.friends.discordNone}</p>}
          </>
        )}
      </section>

      <p className="text-[13px] text-muted">{t.friends.linkTip}</p>
    </main>
  )
}

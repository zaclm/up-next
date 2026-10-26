import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { authMode } from '@/lib/env'
import { getMe } from '@/lib/auth'
import { safePath } from '@/lib/format'
import { db } from '@/lib/db'
import { devCreatePlayer, devSignIn, signInWithDiscord } from '@/app/actions'
import { Avatar, Icon, btn, cx } from '@/components/ui'
import { EmailAuth } from '@/components/email-auth'
import { LanguagePicker } from '@/components/language-picker'
import { LocaleRoot } from '@/i18n/root'
import { getT, type T } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.signIn }
}

type Search = Promise<{ next?: string; error?: string }>

function Logo() {
  return (
    <span className="flex items-center gap-2.5" dir="ltr">
      <Icon.next size={34} className="text-accent" strokeWidth={2.2} />
      <span className="font-display text-[28px] font-bold tracking-tight">Up Next</span>
    </span>
  )
}

export default function LoginPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-8 px-5 py-10">
          <Logo />
          <div className="h-64 rounded-2xl bg-surface" />
        </main>
      }
    >
      <LocaleRoot>
        <LoginScreen searchParams={searchParams} />
      </LocaleRoot>
    </Suspense>
  )
}

async function LoginScreen({ searchParams }: { searchParams: Search }) {
  const t = await getT()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col items-start gap-4">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Logo />
          <LanguagePicker label={t.login.language} compact />
        </div>
        <p className="text-[15px] leading-6 text-soft">{t.login.tagline}</p>
      </div>
      <LoginOptions searchParams={searchParams} t={t} />
    </main>
  )
}

async function LoginOptions({ searchParams, t }: { searchParams: Search; t: T }) {
  const { next: rawNext, error } = await searchParams
  const next = safePath(rawNext)
  if (await getMe()) redirect(next)

  if (authMode() === 'dev') {
    const players = await db()<{ id: string; display_name: string; avatar_hue: number }[]>`
      select id, display_name, avatar_hue from public.profiles order by created_at limit 20`
    return (
      <section aria-labelledby="dev-h" className="flex flex-col gap-4 rounded-2xl bg-surface p-5">
        <div className="flex flex-col gap-1">
          <h1 id="dev-h" className="text-base font-semibold">
            {t.login.devTitle}
          </h1>
          <p className="text-[13px] text-muted">{t.login.devBody}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => (
            <form key={p.id} action={devSignIn}>
              <input type="hidden" name="userId" value={p.id} />
              <input type="hidden" name="next" value={next} />
              <button className="flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-ground px-3 text-start hover:bg-raised">
                <Avatar name={p.display_name} hue={p.avatar_hue} size={28} />
                <span className="truncate">{p.display_name}</span>
              </button>
            </form>
          ))}
        </div>
        <form action={devCreatePlayer} className="flex gap-2">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="new-player" className="sr-only">
            {t.login.newPlayer}
          </label>
          <input
            id="new-player"
            name="name"
            required
            placeholder={t.login.newPlayer}
            className="min-h-11 flex-1 rounded-xl bg-ground px-3 shadow-[inset_0_0_0_1px_var(--color-active)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)]"
          />
          <button className={btn.secondary}>{t.common.add}</button>
        </form>
      </section>
    )
  }

  return (
    <section aria-label={t.login.signInAria} className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="rounded-xl bg-[#2a1a1d] px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <form action={signInWithDiscord}>
        <input type="hidden" name="next" value={next} />
        <button className={cx(btn.primary, 'w-full bg-[#5865f2] text-white hover:bg-[#6b76f4]')}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
            <path d="M20.3 4.4A19.6 19.6 0 0 0 15.5 3l-.6 1.3a18 18 0 0 0-5.8 0L8.5 3a19.5 19.5 0 0 0-4.8 1.4C.6 9 0 13.5.3 18a19.7 19.7 0 0 0 5.9 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4-2 1 1.3 2a19.6 19.6 0 0 0 5.9-3c.4-5.2-.7-9.7-3.4-13.6ZM8.7 15.3c-1.2 0-2.1-1-2.1-2.3 0-1.2.9-2.3 2.1-2.3s2.2 1 2.1 2.3c0 1.3-.9 2.3-2.1 2.3Zm6.6 0c-1.2 0-2.1-1-2.1-2.3 0-1.2.9-2.3 2.1-2.3s2.2 1 2.1 2.3c0 1.3-.9 2.3-2.1 2.3Z" />
          </svg>
          {t.login.discord}
        </button>
      </form>
      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="h-px flex-1 bg-line" />
        {t.login.orEmail}
        <span className="h-px flex-1 bg-line" />
      </div>
      <EmailAuth next={next} />
    </section>
  )
}

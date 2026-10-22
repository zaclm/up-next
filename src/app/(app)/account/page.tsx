import type { Metadata } from 'next'
import { requireMe } from '@/lib/auth'
import { authMode } from '@/lib/env'
import { signOut } from '@/app/actions'
import { Avatar, SectionHeading, btn } from '@/components/ui'
import { NameForm } from '@/components/name-form'

export const metadata: Metadata = { title: 'Account' }

export default async function AccountPage() {
  const me = await requireMe()
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-5 pt-4 pb-10 lg:pt-7">
      <header className="flex items-center gap-4">
        <Avatar name={me.name} hue={me.hue} url={me.avatarUrl} size={48} />
        <div className="flex flex-col">
          <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight">{me.name}</h1>
          <p className="text-[13px] text-muted">{authMode() === 'dev' ? 'Local test player' : 'Signed in'}</p>
        </div>
      </header>
      <section aria-labelledby="name-h" className="flex flex-col gap-3">
        <SectionHeading id="name-h" title="Name" note="What friends see in your lists" />
        <NameForm name={me.name} />
      </section>
      <form action={signOut} className="border-t border-line pt-6">
        <button className={btn.outline}>Sign out</button>
      </form>
    </main>
  )
}

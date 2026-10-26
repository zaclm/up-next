import type { Metadata } from 'next'
import { requireMe } from '@/lib/auth'
import { authMode } from '@/lib/env'
import { signOut } from '@/app/actions'
import { Avatar, SectionHeading, btn } from '@/components/ui'
import { NameForm } from '@/components/name-form'
import { InstallApp } from '@/components/install-app'
import { LanguagePicker } from '@/components/language-picker'
import { EmailRemindersSwitch } from '@/components/email-switch'
import { getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.account }
}

export default async function AccountPage() {
  const [me, t] = await Promise.all([requireMe(), getT()])
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-5 pt-4 pb-10 lg:pt-7">
      <header className="flex items-center gap-4">
        <Avatar name={me.name} hue={me.hue} url={me.avatarUrl} size={48} />
        <div className="flex flex-col">
          <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight">{me.name}</h1>
          <p className="text-[13px] text-muted">{authMode() === 'dev' ? t.account.localPlayer : t.account.signedIn}</p>
        </div>
      </header>
      <section aria-labelledby="name-h" className="flex flex-col gap-3">
        <SectionHeading id="name-h" title={t.account.name} note={t.account.nameNote} />
        <NameForm name={me.name} />
      </section>
      <section aria-labelledby="lang-h" className="flex flex-col gap-3">
        <SectionHeading id="lang-h" title={t.account.language} note={t.account.languageNote} />
        <LanguagePicker label={t.account.language} />
      </section>
      <section aria-labelledby="email-h" id="email" className="flex scroll-mt-6 flex-col gap-3">
        <SectionHeading id="email-h" title={t.account.emailTitle} note={t.account.emailNote} />
        <EmailRemindersSwitch on={me.emailReminders} />
      </section>
      <section aria-labelledby="app-h" className="flex flex-col gap-3">
        <SectionHeading id="app-h" title={t.account.install} note={t.account.installNote} />
        <InstallApp />
      </section>
      <form action={signOut} className="border-t border-line pt-6">
        <button className={btn.outline}>{t.account.signOut}</button>
      </form>
    </main>
  )
}

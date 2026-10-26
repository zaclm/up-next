import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { requireMe } from '@/lib/auth'
import { asUser } from '@/lib/db'
import { joinNames } from '@/i18n/format'
import { getT } from '@/i18n/server'
import { card, cx } from '@/components/ui'
import { JoinListForm } from '@/components/list-forms'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.join }
}

type Preview = { id: string; name: string; member_count: number; member_names: string[]; already_member: boolean } | null

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [me, t] = await Promise.all([requireMe(`/join/${code}`), getT()])
  const preview = await asUser(me.id, async (tx) => {
    const [row] = await tx<{ p: Preview }[]>`select public.invite_preview(${code}) as p`
    return row.p
  })
  if (preview?.already_member) redirect(`/lists/${preview.id}`)

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 pt-8 pb-10 lg:pt-16">
      {preview ? (
        <section className={cx(card, 'flex flex-col gap-4 p-6')}>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted">{t.joinPage.invitedTo}</span>
            <h1 className="font-display text-[28px] leading-[34px] font-bold tracking-tight">{preview.name}</h1>
            <p className="text-muted">{t.joinPage.with(joinNames(t.locale, preview.member_names))}</p>
          </div>
          <p className="text-[13px] text-soft">{t.joinPage.fillNote}</p>
          <JoinListForm defaultCode={code} />
        </section>
      ) : (
        <section className={cx(card, 'flex flex-col gap-3 p-6')}>
          <h1 className="font-display text-2xl font-bold">{t.joinPage.badTitle}</h1>
          <p className="text-muted">{t.joinPage.badBody}</p>
          <JoinListForm />
          <Link href="/lists" className="self-start py-2 text-[13.5px] text-muted hover:text-ink">
            {t.joinPage.backToLists}
          </Link>
        </section>
      )}
    </main>
  )
}

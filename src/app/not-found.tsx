import { Suspense } from 'react'
import Link from 'next/link'
import { LocaleRoot } from '@/i18n/root'
import { getT } from '@/i18n/server'

export default function NotFound() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <LocaleRoot>
        <NotFoundBody />
      </LocaleRoot>
    </Suspense>
  )
}

async function NotFoundBody() {
  const t = (await getT()).errors
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-5">
      <h1 className="font-display text-[28px] font-bold">{t.notFoundTitle}</h1>
      <p className="text-muted">{t.notFoundBody}</p>
      <Link href="/" className="inline-flex min-h-11 items-center self-start rounded-xl bg-accent px-4 font-semibold text-ground">
        {t.goHome}
      </Link>
    </main>
  )
}

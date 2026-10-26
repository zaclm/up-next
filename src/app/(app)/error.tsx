'use client'

import { useT } from '@/i18n/client'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT().errors
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-5 pt-10">
      <h1 className="font-display text-2xl font-bold">{t.errorTitle}</h1>
      <p className="text-muted">{t.errorBody}</p>
      {error.digest && <p className="text-xs text-faint">{t.errorId(error.digest)}</p>}
      <button type="button" onClick={reset} className="inline-flex min-h-11 items-center self-start rounded-xl bg-active px-4 font-medium">
        {t.tryAgain}
      </button>
    </main>
  )
}

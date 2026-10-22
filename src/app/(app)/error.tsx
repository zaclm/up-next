'use client'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-5 pt-10">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted">That didn&apos;t load. Your scores are safe. Try again in a moment.</p>
      {error.digest && <p className="text-xs text-faint">Error id: {error.digest}</p>}
      <button type="button" onClick={reset} className="inline-flex min-h-11 items-center self-start rounded-xl bg-active px-4 font-medium">
        Try again
      </button>
    </main>
  )
}

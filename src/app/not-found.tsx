import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-5">
      <h1 className="font-display text-[28px] font-bold">Not here</h1>
      <p className="text-muted">That list or game doesn&apos;t exist, or you&apos;re not in the list it belongs to.</p>
      <Link href="/" className="inline-flex min-h-11 items-center self-start rounded-xl bg-accent px-4 font-semibold text-ground">
        Go to Up next
      </Link>
    </main>
  )
}

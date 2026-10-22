export function PageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pt-5 lg:px-10 lg:pt-7" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-surface" />
      <div className="h-4 w-72 rounded bg-surface" />
      <div className="h-56 rounded-2xl bg-surface" />
      <div className="h-40 rounded-2xl bg-surface" />
    </div>
  )
}

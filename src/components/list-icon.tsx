import { cx } from './ui'

// A list's picture: the one its members chose, or a steady coloured tile with its initials.
// It never changes on its own when games are added.

function hueFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export function initialsOf(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function listImageUrl(id: string, version: number | null) {
  return version ? `/api/lists/${id}/image?v=${version}` : null
}

export function ListIcon({
  id,
  name,
  version,
  size = 40,
  newCount = 0,
  className,
}: {
  id: string
  name: string
  version: number | null
  size?: number
  newCount?: number
  className?: string
}) {
  const src = listImageUrl(id, version)
  const hue = hueFor(id)
  const radius = Math.round(size * 0.24)
  return (
    <span className={cx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" style={{ borderRadius: radius }} />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-full items-center justify-center font-display font-bold"
          style={{
            borderRadius: radius,
            fontSize: Math.max(11, Math.round(size * 0.36)),
            background: `linear-gradient(140deg, hsl(${hue} 55% 34%), hsl(${(hue + 40) % 360} 60% 22%))`,
            color: `hsl(${hue} 90% 88%)`,
          }}
        >
          {initialsOf(name)}
        </span>
      )}
      {newCount > 0 && <NewDot count={newCount} />}
    </span>
  )
}

export function NewDot({ count, className }: { count: number; className?: string }) {
  const label = count === 1 ? '1 new game' : `${count} new games`
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cx(
        'absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[11px] leading-none font-bold text-white ring-2 ring-ground',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

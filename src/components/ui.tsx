import type { ReactNode, SVGProps } from 'react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export { Cover } from './cover'

export function Avatar({
  name,
  hue,
  url,
  size = 28,
  ring,
}: {
  name: string
  hue: number
  url?: string | null
  size?: number
  ring?: string
}) {
  const style = {
    width: size,
    height: size,
    background: `hsl(${hue} 70% 80%)`,
    fontSize: Math.max(10, Math.round(size * 0.42)),
    boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={style} />
  }
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-semibold text-ground" style={style}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function AvatarStack({ people, size = 26, max = 5 }: { people: { name: string; hue: number; avatar_url?: string | null }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max)
  return (
    <span className="flex" aria-label={people.map((p) => p.name).join(', ')}>
      {shown.map((p, i) => (
        <span key={p.name + i} style={{ marginInlineStart: i ? -8 : 0 }}>
          <Avatar name={p.name} hue={p.hue} url={p.avatar_url} size={size} ring="var(--color-ground)" />
        </span>
      ))}
      {people.length > max && (
        <span className="ms-1 self-center text-xs text-muted">+{people.length - max}</span>
      )}
    </span>
  )
}

export function Tag({ kind, label }: { kind: 'played' | 'hype'; label: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs',
        kind === 'played' ? 'bg-accent-tint text-accent' : 'bg-hype-tint text-hype',
      )}
    >
      {label}
    </span>
  )
}

export function SectionHeading({ id, title, note, action }: { id?: string; title: ReactNode; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="text-base leading-6 font-semibold">
          {title}
        </h2>
        {note && <p className="text-[13px] text-muted">{note}</p>}
      </div>
      {action}
    </div>
  )
}

export const btn = {
  primary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-ground transition-colors hover:bg-accent-hover disabled:bg-active disabled:text-muted lg:min-h-10 lg:rounded-[10px]',
  secondary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-active px-4 font-medium text-ink transition-colors hover:bg-[#343843] disabled:text-muted lg:min-h-10 lg:rounded-[10px]',
  // The "Score" call to action in lists of games: same look on every row, readable on dark.
  score:
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-accent-tint px-4 font-semibold text-accent transition-colors hover:bg-accent hover:text-ground lg:min-h-9 lg:rounded-[10px]',
  outline:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong px-4 font-medium text-ink transition-colors hover:bg-surface lg:min-h-9 lg:rounded-lg',
  ghost: 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-muted transition-colors hover:text-ink lg:min-h-9',
  danger:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-danger-line px-4 font-medium text-danger transition-colors hover:bg-[#2a1a1d]',
}

export const card = 'rounded-2xl bg-surface'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }
function icon(paths: ReactNode, defaults: Partial<IconProps> = {}) {
  return function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...defaults}
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const Icon = {
  next: icon(<path d="M5 6l6 6-6 6M13 6l6 6-6 6" />),
  star: icon(<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />),
  library: icon(
    <>
      <rect x="3" y="4" width="7" height="9" rx="1.5" />
      <rect x="14" y="4" width="7" height="9" rx="1.5" />
      <path d="M3 17h18M3 20h12" />
    </>,
  ),
  people: icon(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.6 3.5 5.4" />
    </>,
  ),
  plus: icon(<path d="M12 5v14M5 12h14" />, { strokeWidth: 2 }),
  back: icon(<path d="M15 6l-6 6 6 6" />, { strokeWidth: 2 }),
  close: icon(<path d="M6 6l12 12M18 6L6 18" />, { strokeWidth: 2 }),
  chevronDown: icon(<path d="M6 9l6 6 6-6" />, { strokeWidth: 2 }),
  chevronUp: icon(<path d="M6 15l6-6 6 6" />, { strokeWidth: 2 }),
  chevronRight: icon(<path d="M9 6l6 6-6 6" />, { strokeWidth: 2 }),
  sliders: icon(
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>,
  ),
  lock: icon(
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
  ),
  check: icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, { strokeWidth: 2.6 }),
  search: icon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
    { strokeWidth: 2 },
  ),
  grid: icon(
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>,
  ),
  rows: icon(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.5M4.5 12h.5M4.5 18h.5" strokeWidth={2.6} />
    </>,
  ),
  sort: icon(<path d="M8 9l4-4 4 4M8 15l4 4 4-4" />, { strokeWidth: 2 }),
  link: icon(
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>,
  ),
  copy: icon(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>,
  ),
  image: icon(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 16l-5-5-8.5 8.5" />
    </>,
  ),
}

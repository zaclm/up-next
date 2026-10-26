'use client'

import { useState } from 'react'

const FALLBACK_TINTS = ['#2a3a33', '#3a2a44', '#2a3a4a', '#4a3a26', '#3b4a2a', '#43292b', '#22383f', '#33302a']

const join = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(' ')

/**
 * Game cover in 3:4. If the picture can't load (Steam has no tall art for some games),
 * tries the fallback picture, then shows the title's initials on a tint.
 */
export function Cover({
  src,
  title,
  className,
  alt = '',
  fallback = null,
}: {
  src: string | null | undefined
  title: string
  className?: string
  alt?: string
  fallback?: string | null
}) {
  const [failed, setFailed] = useState<string[]>([])
  const current = [src, fallback].find((u): u is string => !!u && !failed.includes(u))
  if (current) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={current}
        src={current}
        alt={alt}
        loading="lazy"
        onError={() => setFailed((f) => [...f, current])}
        className={join('block aspect-[3/4] bg-raised object-cover', className)}
      />
    )
  }
  const initials = title
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  const tint = FALLBACK_TINTS[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_TINTS.length]
  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={join('flex aspect-[3/4] items-center justify-center font-display font-bold text-ink', className)}
      style={{ background: tint }}
    >
      {initials || '?'}
    </span>
  )
}

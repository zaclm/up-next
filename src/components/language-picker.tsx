'use client'

import { useOptimistic, useTransition } from 'react'
import { setLanguage } from '@/app/actions'
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/config'
import { useLocale } from '@/i18n/client'
import { cx } from './ui'

/** English · Français · العربية. Each name is written in its own language, so anyone can find theirs. */
export function LanguagePicker({ label, compact = false }: { label: string; compact?: boolean }) {
  const current = useLocale()
  const [shown, setShown] = useOptimistic<Locale>(current)
  const [pending, start] = useTransition()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={pending}
      className={cx('flex gap-1 rounded-xl bg-surface p-1', compact ? 'self-center' : 'w-full sm:w-auto sm:self-start')}
    >
      {LOCALES.map((l) => {
        const on = shown === l
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            lang={l}
            dir={l === 'ar' ? 'rtl' : 'ltr'}
            onClick={() =>
              on ||
              start(async () => {
                setShown(l)
                await setLanguage(l)
              })
            }
            className={cx(
              'flex flex-1 items-center justify-center rounded-[10px] px-3.5 text-sm sm:flex-none',
              compact ? 'min-h-9' : 'min-h-11 lg:min-h-9',
              on ? 'bg-active font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-muted hover:text-ink',
            )}
          >
            {LOCALE_NAMES[l]}
          </button>
        )
      })}
    </div>
  )
}

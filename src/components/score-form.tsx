'use client'

import { useState, useTransition } from 'react'
import { saveScore } from '@/app/actions'
import { clampScore, fmtScore, personalScore } from '@/lib/format'
import { btn, cx } from './ui'

function ScoreSlider({
  label,
  hint,
  value,
  onChange,
  color,
}: {
  label: string
  hint: string
  value: number | null
  onChange: (v: number) => void
  color: 'hype' | 'accent'
}) {
  const id = `score-${label.toLowerCase()}`
  const shown = value ?? 7
  const tone = color === 'hype' ? 'text-hype' : 'text-accent'
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 lg:bg-ground/40">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="flex flex-1 flex-col">
          <span className="font-semibold">{label}</span>
          <span className="text-[12.5px] text-muted">{hint}</span>
        </label>
        <button
          type="button"
          aria-label={`Lower ${label} by 0.5`}
          onClick={() => onChange(clampScore(shown - 0.5))}
          className="flex size-11 items-center justify-center rounded-full bg-active text-xl hover:bg-[#343843] lg:size-9"
        >
          −
        </button>
        <output htmlFor={id} aria-live="polite" className={cx('w-12 text-center font-display text-[28px] font-bold tnum', value === null ? 'text-faint' : tone)}>
          {value === null ? '–' : fmtScore(value)}
        </output>
        <button
          type="button"
          aria-label={`Raise ${label} by 0.5`}
          onClick={() => onChange(clampScore(shown + 0.5))}
          className="flex size-11 items-center justify-center rounded-full bg-active text-xl hover:bg-[#343843] lg:size-9"
        >
          +
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cx('h-2 w-full cursor-pointer', color === 'hype' ? 'accent-[#f2a93b]' : 'accent-[#c6f432]')}
        aria-valuetext={value === null ? 'not set' : `${fmtScore(value)} out of 10`}
      />
      <div className="flex justify-between text-xs text-faint" aria-hidden>
        <span>1</span>
        <span>half steps</span>
        <span>10</span>
      </div>
    </div>
  )
}

export function ScoreForm({
  gameId,
  initial,
  startPlayed = false,
  saveLabel = 'Save score',
  savedNote,
}: {
  gameId: number
  initial: { before: number | null; after: number | null; canPlay: boolean }
  startPlayed?: boolean
  saveLabel?: string
  savedNote?: string
}) {
  const [played, setPlayed] = useState(initial.after !== null || startPlayed)
  const [before, setBefore] = useState<number | null>(initial.before)
  const [after, setAfter] = useState<number | null>(initial.after)
  const [canPlay, setCanPlay] = useState(initial.canPlay)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const effectiveAfter = played ? after : null
  const mine = personalScore(before, effectiveAfter)
  const ready = before !== null || effectiveAfter !== null

  function save() {
    setMessage(null)
    start(async () => {
      const res = await saveScore({ gameId, before, after: effectiveAfter, canPlay })
      setMessage(res.ok ? { ok: true, text: savedNote ?? 'Saved.' } : { ok: false, text: res.error })
    })
  }

  const seg = (on: boolean) =>
    cx('min-h-11 rounded-[10px] text-sm lg:min-h-9', on ? 'bg-active font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-muted hover:text-ink')

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-base font-semibold">Have you played it?</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 lg:bg-ground">
          <button type="button" aria-pressed={!played} className={seg(!played)} onClick={() => setPlayed(false)}>
            Not yet
          </button>
          <button type="button" aria-pressed={played} className={seg(played)} onClick={() => setPlayed(true)}>
            Yes, I have
          </button>
        </div>
      </fieldset>

      <ScoreSlider label="Before" hint="How hyped are you?" value={before} onChange={setBefore} color="hype" />
      {played && <ScoreSlider label="After" hint="How was it really?" value={after} onChange={setAfter} color="accent" />}

      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-surface px-4 lg:bg-ground/40">
        <input type="checkbox" checked={canPlay} onChange={(e) => setCanPlay(e.target.checked)} className="size-5" />
        <span className="flex flex-col">
          <span>I can play this</span>
          <span className="text-[12.5px] text-muted">You own it or have access to it</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex flex-col">
          <span className="text-[12.5px] text-muted">
            {played && before !== null && after !== null ? '30% Before + 70% After' : played ? 'Your score' : 'Hype only, until you play it'}
          </span>
          <span className="font-display text-[22px] leading-7 font-bold tnum">{fmtScore(mine)}</span>
        </span>
        <button type="button" onClick={save} disabled={!ready || pending} className={btn.primary}>
          {pending ? 'Saving…' : saveLabel}
        </button>
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={cx('text-[13px]', message.ok ? 'text-accent' : 'text-danger')}>
          {message.text}
        </p>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { cx } from './ui'

/** Toggle existing categories and type new ones. */
export function CategoryPicker({
  categories,
  selected,
  onChange,
  newNames,
  onNewNames,
}: {
  categories: { id: number; name: string }[]
  selected: number[]
  onChange: (ids: number[]) => void
  newNames: string[]
  onNewNames: (names: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const chip = (on: boolean) =>
    cx('flex min-h-9 items-center rounded-full px-3.5 text-[13.5px]', on ? 'bg-ink font-semibold text-ground' : 'bg-active text-ink hover:bg-[#343843]')
  function addDraft() {
    const name = draft.trim()
    if (!name) return
    const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!selected.includes(existing.id)) onChange([...selected, existing.id])
    } else if (!newNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      onNewNames([...newNames, name])
    }
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Categories" className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = selected.includes(c.id)
          return (
            <button key={c.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}>
              {c.name}
            </button>
          )
        })}
        {newNames.map((n) => (
          <button key={n} type="button" aria-pressed className={chip(true)} onClick={() => onNewNames(newNames.filter((x) => x !== n))} title="New category">
            {n} · new
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label htmlFor="new-cat" className="sr-only">
          New category
        </label>
        <input
          id="new-cat"
          value={draft}
          maxLength={30}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addDraft()
            }
          }}
          placeholder="New category, e.g. Co-op"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-ground px-3.5 text-[15px] shadow-[inset_0_0_0_1px_var(--color-active)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)] lg:min-h-9 lg:text-sm"
        />
        <button type="button" onClick={addDraft} className="min-h-11 rounded-xl bg-active px-3.5 text-[13.5px] lg:min-h-9">
          Add
        </button>
      </div>
    </div>
  )
}

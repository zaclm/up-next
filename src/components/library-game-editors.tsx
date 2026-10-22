'use client'

import { useState, useTransition } from 'react'
import { addGamesToLists, removeFromLibrary, setGameCategories } from '@/app/actions'
import { CategoryPicker } from './category-picker'
import { ConfirmAction } from './list-actions'
import { btn, cx } from './ui'

export function CategoryEditor({
  gameId,
  categories,
  initial,
}: {
  gameId: number
  categories: { id: number; name: string }[]
  initial: number[]
}) {
  const [ids, setIds] = useState(initial)
  const [names, setNames] = useState<string[]>([])
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = names.length > 0 || ids.length !== initial.length || ids.some((i) => !initial.includes(i))
  return (
    <div className="flex flex-col gap-3">
      <CategoryPicker categories={categories} selected={ids} onChange={setIds} newNames={names} onNewNames={setNames} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || pending}
          className={cx(btn.secondary, 'self-start')}
          onClick={() =>
            start(async () => {
              const res = await setGameCategories(gameId, ids, names)
              setMsg(res.ok ? { ok: true, text: 'Categories saved. Linked lists get the game automatically.' } : { ok: false, text: res.error })
              if (res.ok) setNames([])
            })
          }
        >
          {pending ? 'Saving…' : 'Save categories'}
        </button>
        {msg && <span className={cx('text-[13px]', msg.ok ? 'text-accent' : 'text-danger')}>{msg.text}</span>}
      </div>
    </div>
  )
}

export function ListsEditor({
  gameId,
  inLists,
  lists,
}: {
  gameId: number
  inLists: string[]
  lists: { id: string; name: string; member_count: number }[]
}) {
  const [chosen, setChosen] = useState<string[]>([])
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const open = lists.filter((l) => !inLists.includes(l.id))
  return (
    <div className="flex flex-col gap-3">
      {open.length === 0 ? (
        <p className="text-[13px] text-muted">It&apos;s in all of your lists.</p>
      ) : (
        <>
          <div className="flex flex-col rounded-2xl bg-surface py-1">
            {open.map((l, i) => (
              <label key={l.id} className={cx('flex min-h-14 cursor-pointer items-center gap-3 px-4', i > 0 && 'border-t border-line')}>
                <input
                  type="checkbox"
                  className="size-5"
                  checked={chosen.includes(l.id)}
                  onChange={() => setChosen((c) => (c.includes(l.id) ? c.filter((x) => x !== l.id) : [...c, l.id]))}
                />
                <span className="flex flex-col">
                  <span>{l.name}</span>
                  <span className="text-[12.5px] text-muted">{l.member_count} members</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!chosen.length || pending}
            className={cx(btn.primary, 'self-start')}
            onClick={() =>
              start(async () => {
                const res = await addGamesToLists([gameId], chosen)
                setMsg(res.ok ? 'Added.' : res.error)
                if (res.ok) setChosen([])
              })
            }
          >
            {pending ? 'Adding…' : chosen.length ? `Add to ${chosen.length === 1 ? '1 list' : `${chosen.length} lists`}` : 'Choose a list'}
          </button>
        </>
      )}
      {msg && <p className="text-[13px] text-muted">{msg}</p>}
    </div>
  )
}

export function RemoveFromLibraryButton({ gameId }: { gameId: number }) {
  return (
    <ConfirmAction
      label="Remove from my library"
      confirmLabel="Yes, remove my score"
      tone="danger"
      run={async () => {
        const res = await removeFromLibrary(gameId)
        return res ?? { ok: true }
      }}
    />
  )
}

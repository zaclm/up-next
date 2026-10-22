'use client'

import { useActionState, useState, useTransition } from 'react'
import { createList, joinList, newInvite, updateList, linkCategory, unlinkCategory } from '@/app/actions'
import { btn, cx } from './ui'

const field =
  'min-h-12 w-full rounded-xl bg-surface px-4 text-[15px] text-ink placeholder:text-faint shadow-[inset_0_0_0_1px_var(--color-active)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)] lg:min-h-10 lg:rounded-lg lg:text-sm'

export function CreateListForm() {
  return (
    <form action={createList} className="flex flex-col gap-2 sm:flex-row" id="new">
      <label htmlFor="new-list" className="sr-only">
        List name
      </label>
      <input id="new-list" name="name" required maxLength={40} placeholder="Name a new list, e.g. Friday Squad" className={field} />
      <button className={cx(btn.primary, 'shrink-0')}>Create list</button>
    </form>
  )
}

export function JoinListForm({ defaultCode = '' }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState(async (_: unknown, fd: FormData) => joinList(fd), null)
  return (
    <form action={action} className="flex flex-col gap-2" id="join">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="join-code" className="sr-only">
          Invite code
        </label>
        <input
          id="join-code"
          name="code"
          required
          defaultValue={defaultCode}
          placeholder="Invite code, e.g. SQDN-4821"
          autoCapitalize="characters"
          className={cx(field, 'font-display tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal')}
        />
        <button className={cx(btn.secondary, 'shrink-0')} disabled={pending}>
          {pending ? 'Joining…' : 'Join'}
        </button>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  )
}

export function InviteBox({ listId, code, canReset }: { listId: string; code: string; canReset: boolean }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [pending, start] = useTransition()
  async function copy(what: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(what === 'link' ? `${window.location.origin}/join/${code}` : code)
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      setCopied(null)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <span className="flex min-h-12 flex-1 items-center rounded-xl bg-surface px-4 font-display text-lg font-semibold tracking-[0.08em] lg:min-h-10">
          {code}
        </span>
        <button type="button" onClick={() => copy('link')} className={cx(btn.primary, 'shrink-0')}>
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="text-[12.5px] text-muted">Friends open the link or type the code in Lists. Their library scores fill in as soon as they join.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <button type="button" onClick={() => copy('code')} className="min-h-9 text-ink underline-offset-4 hover:underline">
          {copied === 'code' ? 'Code copied' : 'Copy code only'}
        </button>
        {canReset && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void (await newInvite(listId)))}
            className="min-h-9 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {pending ? 'Making a new code…' : 'Make a new code (the old one stops working)'}
          </button>
        )}
      </div>
    </div>
  )
}

export function PlayableSwitch({ listId, value, disabled }: { listId: string; value: boolean; disabled: boolean }) {
  const [on, setOn] = useState(value)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Only rank games everyone can play"
        disabled={disabled || pending}
        onClick={() => {
          const next = !on
          setOn(next)
          start(async () => {
            const res = await updateList(listId, null, next)
            if (!res.ok) {
              setOn(!next)
              setError(res.error)
            }
          })
        }}
        className={cx('flex h-7 w-12 shrink-0 rounded-full p-[3px] transition-colors', on ? 'justify-end bg-accent' : 'justify-start bg-[#3a3f4a]', disabled && 'opacity-60')}
      >
        <span className={cx('size-[22px] rounded-full', on ? 'bg-ground' : 'bg-ink')} />
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}

export function RenameList({ listId, name }: { listId: string; name: string }) {
  const [pending, start] = useTransition()
  const [value, setValue] = useState(name)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await updateList(listId, value, null)
          setMsg(res.ok ? 'Saved.' : res.error)
        })
      }}
    >
      <label htmlFor="list-name" className="sr-only">
        List name
      </label>
      <input id="list-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} className={field} />
      <button className={cx(btn.secondary, 'shrink-0')} disabled={pending || !value.trim() || value === name}>
        Rename
      </button>
      {msg && <span className="self-center text-[13px] text-muted">{msg}</span>}
    </form>
  )
}

export function LinkCategoryControl({
  listId,
  mine,
}: {
  listId: string
  mine: { id: number; name: string; count: number; linked: boolean }[]
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const available = mine.filter((c) => !c.linked)
  if (mine.length === 0) {
    return <p className="text-[13px] text-muted">Make categories in your library (like Co-op or Horror) to link them here.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {mine
          .filter((c) => c.linked)
          .map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await unlinkCategory(listId, c.id)))}
              className="flex min-h-9 items-center gap-2 rounded-full bg-active px-3.5 text-[13.5px]"
              aria-label={`Unlink ${c.name}`}
            >
              {c.name} <span className="text-muted">· unlink</span>
            </button>
          ))}
      </div>
      {available.length > 0 && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            const id = Number(new FormData(e.currentTarget).get('category'))
            start(async () => {
              const res = await linkCategory(listId, id)
              setMsg(res.ok ? `Linked. ${res.data} game${res.data === 1 ? '' : 's'} added.` : res.error)
            })
          }}
        >
          <label htmlFor="link-cat" className="sr-only">
            Category to link
          </label>
          <select id="link-cat" name="category" className={field}>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count} games)
              </option>
            ))}
          </select>
          <button className={cx(btn.secondary, 'shrink-0')} disabled={pending}>
            Link category
          </button>
        </form>
      )}
      {msg && <p className="text-[13px] text-muted">{msg}</p>}
    </div>
  )
}

'use client'

import { useActionState } from 'react'
import { updateProfileName } from '@/app/actions'
import { btn, cx } from './ui'

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(async (_: unknown, fd: FormData) => updateProfileName(fd), null)
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="display-name" className="sr-only">
        Your name
      </label>
      <input
        id="display-name"
        name="name"
        defaultValue={name}
        maxLength={40}
        required
        className="min-h-12 w-full rounded-xl bg-surface px-4 text-[15px] shadow-[inset_0_0_0_1px_var(--color-active)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)] lg:min-h-10 lg:text-sm"
      />
      <button className={cx(btn.secondary, 'shrink-0')} disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
      {state && <span className={cx('self-center text-[13px]', state.ok ? 'text-accent' : 'text-danger')}>{state.ok ? 'Saved.' : state.error}</span>}
    </form>
  )
}

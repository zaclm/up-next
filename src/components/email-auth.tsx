'use client'

import { useActionState, useState } from 'react'
import { signInWithPassword, signUpWithPassword } from '@/app/actions'
import { btn, cx } from './ui'

const field =
  'min-h-12 w-full rounded-xl bg-ground px-4 text-[15px] text-ink placeholder:text-faint shadow-[inset_0_0_0_1px_var(--color-active)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)]'

export function EmailAuth({ next }: { next: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [inState, signIn, inPending] = useActionState(signInWithPassword, null)
  const [upState, signUp, upPending] = useActionState(signUpWithPassword, null)
  const state = mode === 'in' ? inState : upState
  const pending = mode === 'in' ? inPending : upPending

  return (
    <form action={mode === 'in' ? signIn : signUp} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      {mode === 'up' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Your name</span>
          <input name="name" required maxLength={40} autoComplete="nickname" placeholder="What friends call you" className={field} />
        </label>
      )}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === 'up' ? 8 : undefined}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          className={field}
        />
      </label>
      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={cx('text-[13px]', state.ok ? 'text-accent' : 'text-danger')}>
          {state.ok ? state.data : state.error}
        </p>
      )}
      <button className={cx(btn.primary, 'mt-1 w-full')} disabled={pending}>
        {pending ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
      </button>
      <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className={cx(btn.ghost, 'w-full')}>
        {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </form>
  )
}

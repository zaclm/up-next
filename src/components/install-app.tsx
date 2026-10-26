'use client'

import { useEffect, useState } from 'react'
import { Icon, btn } from './ui'
import { useT } from '@/i18n/client'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type State = 'checking' | 'installed' | 'prompt' | 'ios' | 'manual'

/**
 * "Install Up Next": puts the app on the home screen (phone) or in the app list (PC).
 * Chrome, Edge and Android offer a one-tap install; iPhone and iPad need Safari's Share menu.
 */
export function InstallApp() {
  const t = useT()
  const [state, setState] = useState<State>('checking')
  const [event, setEvent] = useState<InstallEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) {
      setState('installed')
      return
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setState(ios ? 'ios' : 'manual')
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
      setState('prompt')
    }
    const onInstalled = () => setState('installed')
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (state === 'checking') return <p className="text-[13px] text-muted">…</p>
  if (state === 'installed') {
    return (
      <p className="flex items-center gap-2 text-[13.5px] text-soft">
        <Icon.check size={16} className="text-accent" />
        {t.account.installed}
      </p>
    )
  }
  if (state === 'prompt' && event) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          className={btn.primary}
          onClick={async () => {
            await event.prompt()
            const choice = await event.userChoice
            if (choice.outcome === 'accepted') setState('installed')
          }}
        >
          {t.account.installButton}
        </button>
        <p className="text-[12.5px] text-muted">{t.account.installHint}</p>
      </div>
    )
  }
  if (state === 'ios') {
    return (
      <ol className="flex list-decimal flex-col gap-1 ps-5 text-[13.5px] text-soft">
        <li>{t.account.ios1}</li>
        <li>{t.account.ios2}</li>
        <li>{t.account.ios3}</li>
      </ol>
    )
  }
  return (
    <p className="text-[13.5px] text-soft">{t.account.manual}</p>
  )
}

'use client'

import { createContext, useContext, useEffect } from 'react'
import { DEFAULT_LOCALE, dirOf, type Locale } from './config'
import { dictionaries } from './messages'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // The page's own <html> follows too, for the browser's scrollbars, spell-check and voices.
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dirOf(locale)
  }, [locale])
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** The messages in the reader's language, for client components. */
export function useT() {
  const locale = useContext(LocaleContext)
  return { ...dictionaries[locale], locale }
}

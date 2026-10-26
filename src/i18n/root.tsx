import { dirOf } from './config'
import { I18nProvider } from './client'
import { getLocale } from './server'

/**
 * Wraps a page area in the reader's language: sets lang and text direction (Arabic reads
 * right to left) and hands the language to client components.
 */
export async function LocaleRoot({ children, className }: { children: React.ReactNode; className?: string }) {
  const locale = await getLocale()
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className={className}>
        {children}
      </div>
    </I18nProvider>
  )
}

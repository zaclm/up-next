import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Up Next', template: '%s · Up Next' },
  description: 'Score games before and after you play, and let your group decide what to play next.',
  applicationName: 'Up Next',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Up Next', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0e0f12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}

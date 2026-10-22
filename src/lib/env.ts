import 'server-only'

export type AuthMode = 'supabase' | 'dev'

/**
 * 'supabase' (default): Discord + email/password through Supabase Auth.
 * 'dev': local testing only. Lets you switch between sample players without passwords.
 * It refuses to run on Vercel so it can never be switched on in production by accident.
 */
export function authMode(): AuthMode {
  const mode = process.env.AUTH_MODE === 'dev' ? 'dev' : 'supabase'
  if (mode === 'dev' && process.env.VERCEL) {
    throw new Error('AUTH_MODE=dev is for local testing only and is disabled on Vercel.')
  }
  return mode
}

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see README).')
  }
  return { url, key }
}

export function databaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL (see README).')
  return url
}

export function igdbConfig() {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
  )
}

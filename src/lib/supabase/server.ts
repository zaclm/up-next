import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseConfig } from '../env'

export async function createSupabaseServer() {
  const { url, key } = supabaseConfig()
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component: the proxy refreshes the session cookie instead.
        }
      },
    },
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/login', '/auth/']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))
}

function toLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  const next = request.nextUrl.pathname + request.nextUrl.search
  if (next !== '/') url.searchParams.set('next', next)
  return NextResponse.redirect(url)
}

/** Keeps the Supabase session fresh and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (process.env.AUTH_MODE === 'dev') {
    if (!isPublic(pathname) && !pathname.startsWith('/api/') && !request.cookies.get('upnext_dev_uid')) {
      return toLogin(request)
    }
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  if (!data.user && !isPublic(pathname) && !pathname.startsWith('/api/')) {
    return toLogin(request)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|dev-covers/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
}

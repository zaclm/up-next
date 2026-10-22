import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { safePath } from '@/lib/format'

// Discord sign-in and email confirmation links both land here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safePath(searchParams.get('next'))
  const supabase = await createSupabaseServer()

  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin))
  }

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin))
  }

  const providerError = searchParams.get('error_description')
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(providerError ?? 'Sign-in failed')}`, origin))
}

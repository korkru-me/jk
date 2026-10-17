import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Optional token-hash template supports email confirmation on another device.
// Configure the signup template only after SMTP/Staging delivery verification.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  const failure = () => NextResponse.redirect(new URL('/check-email?error=link_invalid', request.url))
  if (!tokenHash || !/^[a-f0-9]{40,128}$/i.test(tokenHash) || (type !== 'email' && type !== 'signup')) {
    return failure()
  }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  const response = error || !data.user
    ? failure()
    : NextResponse.redirect(new URL('/dashboard', request.url))
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { issueRecoveryGrant } from '@/lib/auth/recovery-grant.server'
import { consumeRecoveryIntent, hasRecoveryIntentNonce } from '@/lib/auth/recovery-intent.server'
import { recoveryFailureFromCode, type RecoveryFailure } from '@/lib/auth/recovery-feedback'

function recoveryRedirect(origin: string, failure?: RecoveryFailure) {
  const destination = new URL('/reset-password', origin)
  if (failure) destination.searchParams.set('error', failure)
  const response = NextResponse.redirect(destination)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next')
  const requestedRole = searchParams.get('role')
  const signupFlow = searchParams.get('flow') === 'signup'
  const recoveryNonce = searchParams.get('recovery_nonce')
  const recoveryFlow = requestedNext === '/reset-password'
  const failedPath = signupFlow || searchParams.get('error_code') === 'otp_expired'
    ? '/check-email?error=link_invalid'
    : '/login?error=auth_failed'
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
    && !/[\\\u0000-\u001f]/.test(requestedNext)
    ? requestedNext
    : '/dashboard'

  if (!code) {
    if (recoveryFlow || recoveryNonce !== null) {
      return recoveryRedirect(origin, recoveryFailureFromCode(searchParams.get('error_code')))
    }
    return NextResponse.redirect(`${origin}${failedPath}`)
  }

  if (recoveryFlow || recoveryNonce !== null) {
    // The URL's `next` value and the SDK's mutable redirectType do not prove
    // email ownership. Reject before exchanging a code without its email nonce.
    try {
      if (!recoveryFlow || signupFlow || !recoveryNonce) {
        return recoveryRedirect(origin, 'verification_failed')
      }
      if (!(await hasRecoveryIntentNonce(recoveryNonce))) {
        return recoveryRedirect(origin, 'browser_required')
      }
    } catch {
      return recoveryRedirect(origin, 'verification_failed')
    }
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    if (recoveryFlow) return recoveryRedirect(origin, recoveryFailureFromCode(error?.code))
    return NextResponse.redirect(`${origin}${failedPath}`)
  }

  // A successful exchange must also match the recipient and secret email nonce
  // in this browser's signed intent before granting password recovery.
  if (next === '/reset-password') {
    try {
      if (!data.session || !recoveryNonce || !(await consumeRecoveryIntent(recoveryNonce, data.user.email ?? '', data.user.id))) {
        return recoveryRedirect(origin, 'verification_failed')
      }
      await issueRecoveryGrant(data.user.id, data.session.access_token)
    } catch {
      return recoveryRedirect(origin, 'verification_failed')
    }
    return recoveryRedirect(origin)
  }

  // Ensure profile row exists (first Google login creates it)
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('users')
    .select('id, role, survey_role, full_name')
    .eq('id', data.user.id)
    .maybeSingle()

  let profile = existing
  if (!existing) {
    const meta = data.user.user_metadata
    const fullName = meta?.full_name ?? meta?.name ?? data.user.email?.split('@')[0] ?? 'ผู้ใช้ KorKru'
    const { data: created } = await admin.from('users').insert({
      id: data.user.id,
      email: data.user.email!,
      full_name: fullName,
      role: 'student',
      survey_role: null,
    }).select('id, role, survey_role, full_name').single()
    profile = created

    if (created) {
      await admin.rpc('ensure_personal_organization', {
        p_user_id: data.user.id,
        p_display_name: fullName,
      })
    }
  }

  if (profile && profile.role !== 'admin' && !profile.survey_role) {
    const completionUrl = new URL('/complete-profile', origin)
    if (requestedRole === 'teacher' || requestedRole === 'student') {
      completionUrl.searchParams.set('role', requestedRole)
    }
    return NextResponse.redirect(completionUrl)
  }

  return NextResponse.redirect(`${origin}${next}`)
}

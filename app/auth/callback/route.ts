import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next')
  const requestedRole = searchParams.get('role')
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
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
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
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

  if (next === '/reset-password') {
    return NextResponse.redirect(`${origin}/reset-password`)
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

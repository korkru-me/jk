import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

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
    .select('id')
    .eq('id', data.user.id)
    .single()

  if (!existing) {
    const meta = data.user.user_metadata
    await admin.from('users').insert({
      id: data.user.id,
      email: data.user.email!,
      full_name: meta?.full_name ?? meta?.name ?? data.user.email!.split('@')[0],
      role: 'teacher',
      survey_role: null,
    })
  }

  return NextResponse.redirect(`${origin}${next}`)
}

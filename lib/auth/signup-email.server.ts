import 'server-only'

import { cookies } from 'next/headers'
import { emailSchema } from './validation'

const COOKIE_NAME = 'korkru_signup_email'

// A short-lived display hint only, never evidence that an address is owned or
// that a message was delivered. Keep email out of URLs, analytics and storage.
export async function rememberSignupEmail(email: string) {
  const store = await cookies()
  store.set(COOKIE_NAME, JSON.stringify({ email, requestedAt: Date.now() }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/check-email',
    maxAge: 1800,
  })
}

export async function getSignupEmail() {
  return (await getSignupEmailState()).email
}

export async function getSignupEmailState() {
  try {
    const value = JSON.parse((await cookies()).get(COOKIE_NAME)?.value ?? '{}')
    const parsed = emailSchema.safeParse(value.email)
    if (!parsed.success || typeof value.requestedAt !== 'number' || !Number.isFinite(value.requestedAt)) {
      return { email: null, retryAfterSeconds: 0 }
    }
    return { email: parsed.data, retryAfterSeconds: Math.min(60, Math.max(0, Math.ceil((value.requestedAt + 60000 - Date.now()) / 1000))) }
  } catch {
    return { email: null, retryAfterSeconds: 0 }
  }
}

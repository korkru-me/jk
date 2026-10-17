import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
import { getSignupConfirmationStatus } from '@/lib/actions/signup-confirmation'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } })
  mocks.getUser.mockResolvedValue({ data: { user: {
    id: 'synthetic-user', email: 'teacher@example.invalid', email_confirmed_at: '2026-10-17T15:00:00Z',
  } }, error: null })
})

describe('signup confirmation status', () => {
  it('reports a matching address only after verifying the current session', async () => {
    expect(await getSignupConfirmationStatus(' Teacher@Example.Invalid ')).toEqual({ confirmedEmail: 'teacher@example.invalid' })
    expect(mocks.getUser).toHaveBeenCalledOnce()
  })

  it.each([null, undefined, '', 'not-an-email', { email: 'teacher@example.invalid' }])('rejects an invalid expected address without contacting Auth: %j', async (email) => {
    expect(await getSignupConfirmationStatus(email)).toEqual({ confirmedEmail: null })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('does not reveal the status of an address belonging to another account', async () => {
    expect(await getSignupConfirmationStatus('student@example.invalid')).toEqual({ confirmedEmail: null })
  })

  it('does not trust an email or editable metadata without confirmed Auth status', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: {
      email: 'teacher@example.invalid', email_confirmed_at: null,
      user_metadata: { email_verified: true, email_confirmed_at: '2026-10-17T15:00:00Z' },
    } }, error: null })
    expect(await getSignupConfirmationStatus('teacher@example.invalid')).toEqual({ confirmedEmail: null })
  })

  it('does not treat a missing session as confirmation', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await getSignupConfirmationStatus('teacher@example.invalid')).toEqual({ confirmedEmail: null })
  })

  it('rejects an Auth error even when the response includes matching data', async () => {
    const result = await mocks.getUser()
    mocks.getUser.mockResolvedValue({ ...result, error: { code: 'bad_jwt' } })
    expect(await getSignupConfirmationStatus('teacher@example.invalid')).toEqual({ confirmedEmail: null })
  })

  it('keeps the waiting state when the connection is unavailable', async () => {
    mocks.getUser.mockRejectedValue(new Error('Unavailable'))
    expect(await getSignupConfirmationStatus('teacher@example.invalid')).toEqual({ confirmedEmail: null })
  })
})

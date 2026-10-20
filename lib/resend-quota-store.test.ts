import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
import { resendQuotaStore } from './resend-quota-store.server'

const key = '11111111-1111-4111-8111-111111111111'
const input = {
  scope: 'staging', period: 'monthly', windowKey: '2026-11-01T00:00:00.000Z',
  level: 80, payloadHash: 'a'.repeat(64),
} as const
beforeEach(() => { vi.clearAllMocks(); rpc.mockReturnValue({ abortSignal }) })

describe('service-only quota RPC boundary', () => {
  it('accepts a ready claim only with a valid persistent delivery UUID', async () => {
    abortSignal.mockResolvedValue({ data: [{ status: 'ready', delivery_key: key }], error: null })
    expect(await resendQuotaStore.claim(input)).toEqual({ status: 'ready', deliveryKey: key })
    expect(rpc).toHaveBeenCalledWith('claim_resend_quota_alert', {
      p_scope: input.scope, p_period: input.period, p_window_key: input.windowKey,
      p_level: input.level, p_payload_hash: input.payloadHash,
    })
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
  })

  it.each(['already_sent', 'ignored_higher', 'payload_mismatch', 'delivery_uncertain'])(
    'preserves the non-send status %s with no delivery key', async status => {
      abortSignal.mockResolvedValue({ data: [{ status, delivery_key: null }], error: null })
      expect(await resendQuotaStore.claim(input)).toEqual({ status, deliveryKey: null })
    },
  )

  it.each([
    { data: [{ status: 'ready', delivery_key: null }], error: null },
    { data: [{ status: 'ready', delivery_key: 'not-a-uuid' }], error: null },
    { data: [{ status: 'unknown', delivery_key: key }], error: null },
    { data: [], error: null },
    { data: [{ status: 'ready', delivery_key: key }], error: { message: 'private detail' } },
  ])('fails closed for missing schema, provider errors or malformed claim results', async result => {
    abortSignal.mockResolvedValue(result)
    await expect(resendQuotaStore.claim(input)).rejects.toThrow('quota_ledger_unavailable')
  })

  it('requires a positive completion acknowledgement', async () => {
    for (const result of [{ data: false, error: null }, { data: true, error: { message: 'private detail' } }]) {
      abortSignal.mockResolvedValue(result)
      await expect(resendQuotaStore.complete(key)).rejects.toThrow('quota_ledger_unavailable')
    }
    abortSignal.mockResolvedValue({ data: true, error: null })
    await expect(resendQuotaStore.complete(key)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenLastCalledWith('complete_resend_quota_alert', { p_delivery_key: key })
  })
})

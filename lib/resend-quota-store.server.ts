import 'server-only'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export type QuotaPeriod = 'daily' | 'monthly'
export type QuotaLevel = 80 | 90 | 95
export type QuotaScope = 'local' | 'staging' | 'production'
export interface QuotaClaim {
  scope: QuotaScope
  period: QuotaPeriod
  windowKey: string
  level: QuotaLevel
  payloadHash: string
}
const claimResultSchema = z.object({
  status: z.enum(['ready', 'already_sent', 'ignored_higher', 'payload_mismatch', 'delivery_uncertain']),
  delivery_key: z.uuid().nullable(),
}).refine(result => result.status !== 'ready' || result.delivery_key !== null)
export interface QuotaAlertStore {
  claim(input: QuotaClaim): Promise<{
    status: z.infer<typeof claimResultSchema>['status']
    deliveryKey: string | null
  }>
  complete(deliveryKey: string): Promise<void>
}

/** Called only after webhook signature verification. The two service-only RPCs
 * contain no student data and cannot be invoked by anonymous/account sessions. */
export const resendQuotaStore: QuotaAlertStore = {
  async claim(input) {
    const { data, error } = await createAdminClient().rpc('claim_resend_quota_alert', {
      p_scope: input.scope,
      p_period: input.period,
      p_window_key: input.windowKey,
      p_level: input.level,
      p_payload_hash: input.payloadHash,
    }).abortSignal(AbortSignal.timeout(5000))
    const result = z.array(claimResultSchema).length(1).safeParse(data)
    if (error || !result.success) throw new Error('quota_ledger_unavailable')
    return { status: result.data[0].status, deliveryKey: result.data[0].delivery_key }
  },
  async complete(deliveryKey) {
    const { data, error } = await createAdminClient().rpc('complete_resend_quota_alert', {
      p_delivery_key: deliveryKey,
    }).abortSignal(AbortSignal.timeout(5000))
    if (error || data !== true) throw new Error('quota_ledger_unavailable')
  },
}

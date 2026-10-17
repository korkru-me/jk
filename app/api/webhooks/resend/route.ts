import { handleResendQuotaWebhook } from '@/lib/resend-quota-alert.server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  return handleResendQuotaWebhook(request, process.env)
}

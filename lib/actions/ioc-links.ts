'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkIocItemsReady } from '@/lib/ioc-form'
import {
  generateIocToken,
  hashIocToken,
  IOC_DEFAULT_LINK_DAYS,
  IOC_MAX_LINK_DAYS,
  iocLinkExpiry,
} from '@/lib/ioc-token'

const issueSchema = z.object({
  form_id: z.string().uuid(),
  expires_in_days: z.number().int().min(1).max(IOC_MAX_LINK_DAYS).default(IOC_DEFAULT_LINK_DAYS),
})

export type IssueIocFormLinksInput = z.input<typeof issueSchema>

/** One expert's link, returned once. The database keeps only its hash. */
export interface IssuedIocLink {
  expert_id: string
  expert_order: number
  display_name: string
  token: string
}

function firstValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
}

async function requireFormManager(formId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' as const }

  const { data: form } = await supabase
    .from('ioc_forms')
    .select('id, org_id, status, items_frozen_at')
    .eq('id', formId)
    .maybeSingle()

  // RLS already refused anyone who may not manage this form, so a missing row
  // and a forbidden one are the same answer here.
  if (!form) return { error: 'ไม่พบฟอร์มนี้ หรือคุณไม่มีสิทธิ์จัดการ' as const }
  return { supabase, user, form: form as { id: string; org_id: string; status: string; items_frozen_at: string | null } }
}

/**
 * Recording an event needs the service role, and the caller has already been
 * authorized by RLS above. Failing to write history must not fail the action a
 * teacher just performed, so this never throws.
 */
async function recordEvent(input: {
  formId: string
  eventType: string
  actorId?: string | null
  expertId?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.rpc('record_ioc_form_event', {
      p_form_id: input.formId,
      p_event_type: input.eventType,
      p_actor_id: input.actorId ?? null,
      p_expert_id: input.expertId ?? null,
      p_detail: input.detail ?? {},
    })
  } catch (error) {
    console.error('[ioc] could not record event', input.eventType, error)
  }
}

/**
 * Freezes the exam copy and hands out one link per expert.
 *
 * The freeze comes first on purpose: if issuing a token then fails, the form is
 * locked with no links out, which a teacher fixes by issuing again. The other
 * order would put a live link on items that could still be edited underneath a
 * signature.
 */
export async function issueIocFormLinks(input: IssueIocFormLinksInput) {
  const parsed = issueSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const context = await requireFormManager(parsed.data.form_id)
  if ('error' in context) return { error: context.error }
  const { supabase, user, form } = context

  if (form.status === 'closed') return { error: 'ฟอร์มนี้ปิดแล้ว' }
  if (form.status === 'collecting' || form.items_frozen_at) {
    return { error: 'ฟอร์มนี้ส่งลิงก์ไปแล้ว ใช้ปุ่มออกลิงก์ใหม่รายคนแทน' }
  }

  const [{ data: items }, { data: experts }] = await Promise.all([
    supabase.from('ioc_form_items').select('id, item_label, standard_id').eq('form_id', form.id).order('order_index'),
    supabase.from('ioc_form_experts').select('id, expert_order, display_name').eq('form_id', form.id).order('expert_order'),
  ])

  const itemRows = (items ?? []) as { id: string; item_label: string; standard_id: string | null }[]
  const expertRows = (experts ?? []) as { id: string; expert_order: number; display_name: string }[]

  if (itemRows.length === 0) return { error: 'ยังไม่ได้เลือกข้อสอบเข้าฟอร์ม' }
  const readiness = checkIocItemsReady(itemRows)
  if (!readiness.ready) {
    const missing = readiness.missingLabels.slice(0, 8).join(', ')
    const more = readiness.missingLabels.length > 8 ? ' และอื่น ๆ' : ''
    return { error: `ยังมีข้อที่ไม่มีตัวชี้วัด: ${missing}${more}` }
  }
  if (expertRows.length === 0) return { error: 'ยังไม่ได้ใส่รายชื่อผู้ทรงคุณวุฒิ' }

  const now = new Date()
  const frozenAt = now.toISOString()

  const { error: freezeError } = await supabase
    .from('ioc_forms')
    .update({ items_frozen_at: frozenAt, opened_at: frozenAt, status: 'collecting' })
    .eq('id', form.id)
    .eq('status', 'draft')

  if (freezeError) {
    console.error('[ioc] freeze failed', freezeError)
    return { error: 'ตรึงข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  const expiresAt = iocLinkExpiry(now, parsed.data.expires_in_days).toISOString()
  const issued: IssuedIocLink[] = []

  for (const expert of expertRows) {
    const token = generateIocToken()
    const { error } = await supabase
      .from('ioc_form_experts')
      .update({
        token_hash: hashIocToken(token),
        token_issued_at: now.toISOString(),
        token_expires_at: expiresAt,
        revoked_at: null,
      })
      .eq('id', expert.id)

    if (error) {
      console.error('[ioc] issue link failed', error)
      return { error: 'สร้างลิงก์ไม่สำเร็จบางท่าน กรุณากดออกลิงก์ใหม่รายคนจากหน้าฟอร์ม' }
    }

    issued.push({
      expert_id: expert.id,
      expert_order: expert.expert_order,
      display_name: expert.display_name,
      token,
    })
    await recordEvent({ formId: form.id, eventType: 'link_issued', actorId: user.id, expertId: expert.id })
  }

  await recordEvent({
    formId: form.id,
    eventType: 'form_opened',
    actorId: user.id,
    detail: { item_count: itemRows.length, expert_count: expertRows.length },
  })

  // Deliberately no revalidatePath here. Revalidating swaps the page from the
  // wizard to the follow-up dashboard, which unmounts the only place these
  // tokens exist — the teacher would watch the links they just made disappear
  // before they could copy one. The page refreshes when they say they are done.
  return { form_id: form.id, expires_at: expiresAt, links: issued }
}

const expertActionSchema = z.object({
  form_id: z.string().uuid(),
  expert_id: z.string().uuid(),
})

const reissueSchema = expertActionSchema.extend({
  expires_in_days: z.number().int().min(1).max(IOC_MAX_LINK_DAYS).default(IOC_DEFAULT_LINK_DAYS),
})

/** A new link for one expert. The one they had stops working immediately. */
export async function reissueIocExpertLink(input: z.input<typeof reissueSchema>) {
  const parsed = reissueSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const context = await requireFormManager(parsed.data.form_id)
  if ('error' in context) return { error: context.error }
  const { supabase, user, form } = context
  if (form.status === 'closed') return { error: 'ฟอร์มนี้ปิดแล้ว' }

  const { data: expert } = await supabase
    .from('ioc_form_experts')
    .select('id, expert_order, display_name')
    .eq('id', parsed.data.expert_id)
    .eq('form_id', form.id)
    .maybeSingle()
  if (!expert) return { error: 'ไม่พบผู้ทรงคุณวุฒิท่านนี้ในฟอร์ม' }

  const now = new Date()
  const token = generateIocToken()
  const expiresAt = iocLinkExpiry(now, parsed.data.expires_in_days).toISOString()

  const { error } = await supabase
    .from('ioc_form_experts')
    .update({
      token_hash: hashIocToken(token),
      token_issued_at: now.toISOString(),
      token_expires_at: expiresAt,
      revoked_at: null,
    })
    .eq('id', expert.id)

  if (error) {
    console.error('[ioc] reissue failed', error)
    return { error: 'ออกลิงก์ใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  await recordEvent({ formId: form.id, eventType: 'link_reissued', actorId: user.id, expertId: expert.id })
  revalidatePath(`/research/ioc/${form.id}`)
  return {
    link: {
      expert_id: expert.id as string,
      expert_order: expert.expert_order as number,
      display_name: expert.display_name as string,
      token,
    } satisfies IssuedIocLink,
    expires_at: expiresAt,
  }
}

export async function revokeIocExpertLink(input: z.input<typeof expertActionSchema>) {
  const parsed = expertActionSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const context = await requireFormManager(parsed.data.form_id)
  if ('error' in context) return { error: context.error }
  const { supabase, user, form } = context

  const { error } = await supabase
    .from('ioc_form_experts')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', parsed.data.expert_id)
    .eq('form_id', form.id)

  if (error) return { error: 'เพิกถอนลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  await recordEvent({
    formId: form.id,
    eventType: 'link_revoked',
    actorId: user.id,
    expertId: parsed.data.expert_id,
  })
  revalidatePath(`/research/ioc/${form.id}`)
  return { revoked: true }
}

const extendSchema = expertActionSchema.extend({
  expires_in_days: z.number().int().min(1).max(IOC_MAX_LINK_DAYS),
})

/** Pushes the expiry out without changing the link the expert already has. */
export async function extendIocExpertLink(input: z.input<typeof extendSchema>) {
  const parsed = extendSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const context = await requireFormManager(parsed.data.form_id)
  if ('error' in context) return { error: context.error }
  const { supabase, user, form } = context

  const { data: expert } = await supabase
    .from('ioc_form_experts')
    .select('id, token_hash, revoked_at')
    .eq('id', parsed.data.expert_id)
    .eq('form_id', form.id)
    .maybeSingle()

  if (!expert) return { error: 'ไม่พบผู้ทรงคุณวุฒิท่านนี้ในฟอร์ม' }
  if (!expert.token_hash || expert.revoked_at) {
    return { error: 'ท่านนี้ยังไม่มีลิงก์ที่ใช้งานได้ ให้กดออกลิงก์ใหม่แทน' }
  }

  const expiresAt = iocLinkExpiry(new Date(), parsed.data.expires_in_days).toISOString()
  const { error } = await supabase
    .from('ioc_form_experts')
    .update({ token_expires_at: expiresAt })
    .eq('id', expert.id)

  if (error) return { error: 'ต่ออายุลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  await recordEvent({
    formId: form.id,
    eventType: 'link_extended',
    actorId: user.id,
    expertId: expert.id as string,
    detail: { expires_at: expiresAt },
  })
  revalidatePath(`/research/ioc/${form.id}`)
  return { expires_at: expiresAt }
}

/**
 * Lets one expert edit and send again. Their ratings are locked while they are
 * marked submitted, so reopening is the only way back in — and it is recorded,
 * because a signed document changing afterwards is exactly what an audit trail
 * is for.
 */
export async function reopenIocExpertSubmission(input: z.input<typeof expertActionSchema>) {
  const parsed = expertActionSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const context = await requireFormManager(parsed.data.form_id)
  if ('error' in context) return { error: context.error }
  const { supabase, user, form } = context
  if (form.status === 'closed') return { error: 'ฟอร์มนี้ปิดแล้ว' }

  const { error } = await supabase
    .from('ioc_form_experts')
    .update({ status: 'opened', reopened_at: new Date().toISOString() })
    .eq('id', parsed.data.expert_id)
    .eq('form_id', form.id)
    .eq('status', 'submitted')

  if (error) {
    console.error('[ioc] reopen failed', error)
    return { error: 'เปิดให้แก้ใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  await recordEvent({
    formId: form.id,
    eventType: 'expert_reopened',
    actorId: user.id,
    expertId: parsed.data.expert_id,
  })
  revalidatePath(`/research/ioc/${form.id}`)
  return { reopened: true }
}

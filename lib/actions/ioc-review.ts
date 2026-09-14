'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadIocReviewByToken } from '@/lib/ioc-review-server'
import { iocSignaturePath, parseIocSignatureDataUrl } from '@/lib/ioc-signature'
import { iocLinkPath } from '@/lib/ioc-token'

const ratingSchema = z.object({
  token: z.string().min(20).max(200),
  item_id: z.string().uuid(),
  score: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  comment: z.string().max(2000),
})

export type SaveIocReviewRatingInput = z.input<typeof ratingSchema>

const submitSchema = z.object({
  token: z.string().min(20).max(200),
  overall_comment: z.string().max(4000),
  signature_mode: z.enum(['drawn', 'uploaded', 'typed', 'none']),
  /** For `drawn` and `uploaded`: a PNG data URL from the canvas. */
  signature_data_url: z.string().max(400_000).nullable(),
  consent: z.boolean(),
})

export type SubmitIocReviewInput = z.input<typeof submitSchema>

/** The same sentence for every reason a link does not work. */
const LINK_GONE = 'ลิงก์นี้ใช้ไม่ได้แล้ว กรุณาขอลิงก์ใหม่จากครูผู้ออกข้อสอบ'

export async function saveIocReviewRating(input: SaveIocReviewRatingInput) {
  const parsed = ratingSchema.safeParse(input)
  if (!parsed.success) return { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  const lookup = await loadIocReviewByToken(parsed.data.token)
  if (!lookup.ok) return { error: LINK_GONE }
  const { expert, form, items } = lookup.context

  if (expert.status === 'submitted') {
    return { error: 'ท่านส่งผลประเมินไปแล้ว หากต้องการแก้ไข กรุณาแจ้งครูผู้ออกข้อสอบให้เปิดให้แก้อีกครั้ง' }
  }

  const item = items.find(candidate => candidate.id === parsed.data.item_id)
  if (!item) return { error: 'ไม่พบข้อนี้ในแบบทดสอบ' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('ioc_ratings')
    .upsert(
      {
        org_id: expert.org_id,
        form_id: form.id,
        expert_id: expert.id,
        item_id: item.id,
        score: parsed.data.score,
        comment: parsed.data.comment.trim(),
      },
      { onConflict: 'expert_id,item_id' },
    )

  if (error) {
    console.error('[ioc] save rating failed', error)
    return { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  return { saved: true, item_id: item.id }
}

export async function submitIocReview(input: SubmitIocReviewInput) {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return { error: 'ส่งผลประเมินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  const lookup = await loadIocReviewByToken(parsed.data.token)
  if (!lookup.ok) return { error: LINK_GONE }
  const { expert, form, items, ratings } = lookup.context

  if (expert.status === 'submitted') {
    return { error: 'ท่านส่งผลประเมินไปแล้ว' }
  }

  // Every item must carry a judgement. A blank row in the printed table asks
  // the reader to guess what the expert meant by leaving it out.
  const ratedItemIds = new Set(ratings.map(rating => rating.item_id))
  const missing = items.filter(item => !ratedItemIds.has(item.id)).map(item => item.item_label)
  if (missing.length > 0) {
    const shown = missing.slice(0, 8).join(', ')
    const more = missing.length > 8 ? ' และอื่น ๆ' : ''
    return { error: `ยังประเมินไม่ครบทุกข้อ เหลือข้อ ${shown}${more}` }
  }

  if (parsed.data.signature_mode !== 'none' && !parsed.data.consent) {
    return { error: 'กรุณาติ๊กยอมรับการใช้ลายเซ็นก่อนส่ง' }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: 'submitted',
    submitted_at: now,
    overall_comment: parsed.data.overall_comment.trim(),
    signature_mode: parsed.data.signature_mode,
    signature_consent_at: parsed.data.signature_mode === 'none' ? null : now,
    signature_path: null,
  }

  if (parsed.data.signature_mode === 'drawn' || parsed.data.signature_mode === 'uploaded') {
    if (!parsed.data.signature_data_url) {
      return {
        error: parsed.data.signature_mode === 'drawn'
          ? 'ยังไม่ได้เซ็น กรุณาเซ็นในกรอบก่อน'
          : 'ยังไม่ได้เลือกรูปลายเซ็น',
      }
    }
    const signature = parseIocSignatureDataUrl(parsed.data.signature_data_url)
    if (!signature.ok) return { error: signature.error }

    const path = iocSignaturePath(expert.org_id, form.id, expert.id)
    const { error: uploadError } = await admin.storage
      .from('ioc-signatures')
      .upload(path, signature.bytes, { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error('[ioc] signature upload failed', uploadError)
      return { error: 'บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
    }
    patch.signature_path = path
  }

  const { error } = await admin.from('ioc_form_experts').update(patch).eq('id', expert.id)
  if (error) {
    console.error('[ioc] submit failed', error)
    return { error: 'ส่งผลประเมินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  try {
    await admin.rpc('record_ioc_form_event', {
      p_form_id: form.id,
      p_event_type: 'expert_submitted',
      p_actor_id: null,
      p_expert_id: expert.id,
      p_detail: { item_count: items.length, signature_mode: parsed.data.signature_mode },
    })
  } catch (error) {
    console.error('[ioc] could not record submission', error)
  }

  revalidatePath(iocLinkPath(parsed.data.token))
  revalidatePath(`/research/ioc/${form.id}`)
  return { submitted: true }
}

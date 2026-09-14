'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const updateSchema = z.object({
  standard_id: z.string().uuid(),
  code: z.string().max(120),
  description: z.string().max(1000),
})

export type UpdateLearningStandardInput = z.input<typeof updateSchema>

function firstValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
}

/**
 * Rewording an indicator in the school's library.
 *
 * RLS already limits this to the row's author, so the check here is only that
 * the row still says something: an indicator with neither a code nor wording
 * would prefill a form with an empty cell.
 */
export async function updateLearningStandard(input: UpdateLearningStandardInput) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const code = parsed.data.code.trim().replace(/\s+/g, ' ')
  const description = parsed.data.description.trim().replace(/\s+/g, ' ')
  if (!code && !description) return { error: 'ต้องมีรหัสหรือคำอธิบายอย่างน้อยอย่างหนึ่ง' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('learning_standards')
    .update({ code, description })
    .eq('id', parsed.data.standard_id)

  if (error) {
    // A duplicate code inside one organization is the library doing its job.
    if (error.code === '23505') {
      return { error: 'รหัสนี้มีอยู่แล้วในคลังของโรงเรียน กรุณาแก้รหัสเดิมแทนการเพิ่มซ้ำ' }
    }
    console.error('[ioc] update standard failed', error)
    return { error: 'บันทึกไม่สำเร็จ — แก้ได้เฉพาะตัวชี้วัดที่คุณเป็นคนเพิ่ม' }
  }

  revalidatePath('/research/ioc/standards')
  return { saved: true }
}

export async function deleteLearningStandard(standardId: string) {
  if (!z.string().uuid().safeParse(standardId).success) return { error: 'ตัวชี้วัดไม่ถูกต้อง' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase.from('learning_standards').delete().eq('id', standardId)
  if (error) {
    console.error('[ioc] delete standard failed', error)
    return { error: 'ลบไม่สำเร็จ — ลบได้เฉพาะตัวชี้วัดที่คุณเป็นคนเพิ่ม' }
  }

  revalidatePath('/research/ioc/standards')
  return { deleted: true }
}

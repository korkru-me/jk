'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeIocHeader,
  validateIocHeader,
  buildIocInstructionText,
  type IocHeaderInput,
} from '@/lib/ioc-form'

const headerSchema = z.object({
  exam_title: z.string().max(300),
  subject_name: z.string().max(200),
  subject_code: z.string().max(60),
  grade_level: z.string().max(100),
  term_label: z.string().max(60),
  academic_year: z.string().max(10),
  school_name: z.string().max(300),
  author_name: z.string().max(200),
  author_position: z.string().max(200),
})

const rulesSchema = z.object({
  // Above 0 and at most 1: an index can reach 1.00, and a threshold of 0 or
  // less would pass an item the panel actively disagreed with.
  threshold: z.number().gt(0).lte(1),
  percent_rule: z.enum(['items_passing', 'mean_index']),
  show_solutions: z.boolean(),
})

const createSchema = headerSchema.extend(rulesSchema.shape).extend({
  instruction_text: z.string().max(4000),
  classroom_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
})

export type CreateIocFormInput = z.input<typeof createSchema>

const updateHeaderSchema = createSchema.extend({
  form_id: z.string().uuid(),
})

export type UpdateIocFormHeaderInput = z.input<typeof updateHeaderSchema>

function firstValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
}

function headerErrorMessage(header: IocHeaderInput): string | null {
  const { valid, errors } = validateIocHeader(header)
  if (valid) return null
  return Object.values(errors)[0] ?? 'ข้อมูลหัวเอกสารไม่ครบ'
}

async function requireTeacher() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' as const }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
    return { error: 'เฉพาะครูเท่านั้นที่สร้างฟอร์ม IOC ได้' as const }
  }

  return { supabase, user }
}

export async function createIocFormDraft(input: CreateIocFormInput) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const header = normalizeIocHeader(parsed.data)
  const headerError = headerErrorMessage(header)
  if (headerError) return { error: headerError }

  const auth = await requireTeacher()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id')
  if (orgError || !orgId) return { error: 'ไม่พบองค์กรของบัญชีนี้ กรุณาลองใหม่อีกครั้ง' }

  const { data, error } = await supabase
    .from('ioc_forms')
    .insert({
      org_id: orgId as string,
      created_by: user.id,
      classroom_id: parsed.data.classroom_id,
      project_id: parsed.data.project_id,
      // The exam is chosen in the next step; until then the form is a header
      // with nothing to judge, which is what 'question_selection' means here.
      source_kind: 'question_selection',
      ...header,
      instruction_text: parsed.data.instruction_text.trim() || buildIocInstructionText(header),
      threshold: parsed.data.threshold,
      percent_rule: parsed.data.percent_rule,
      show_solutions: parsed.data.show_solutions,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: 'บันทึกฟอร์มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  revalidatePath('/research/ioc')
  return { form_id: data.id as string }
}

export async function updateIocFormHeader(input: UpdateIocFormHeaderInput) {
  const parsed = updateHeaderSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const header = normalizeIocHeader(parsed.data)
  const headerError = headerErrorMessage(header)
  if (headerError) return { error: headerError }

  const auth = await requireTeacher()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  const { data: form } = await supabase
    .from('ioc_forms')
    .select('id, status')
    .eq('id', parsed.data.form_id)
    .maybeSingle()

  if (!form) return { error: 'ไม่พบฟอร์มนี้ หรือคุณไม่มีสิทธิ์แก้ไข' }
  if (form.status === 'closed') return { error: 'ฟอร์มนี้ปิดแล้ว แก้ไขหัวเอกสารไม่ได้' }

  // Threshold and percent rule stay editable while collecting: they change how
  // the same ratings are read, not what the experts were asked.
  const { error } = await supabase
    .from('ioc_forms')
    .update({
      ...header,
      instruction_text: parsed.data.instruction_text.trim() || buildIocInstructionText(header),
      threshold: parsed.data.threshold,
      percent_rule: parsed.data.percent_rule,
      show_solutions: parsed.data.show_solutions,
      classroom_id: parsed.data.classroom_id,
      project_id: parsed.data.project_id,
    })
    .eq('id', parsed.data.form_id)

  if (error) return { error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  revalidatePath('/research/ioc')
  revalidatePath(`/research/ioc/${parsed.data.form_id}`)
  return { form_id: parsed.data.form_id }
}

export async function deleteIocFormDraft(formId: string) {
  if (!z.string().uuid().safeParse(formId).success) return { error: 'ฟอร์มไม่ถูกต้อง' }

  const auth = await requireTeacher()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  const { data: form } = await supabase
    .from('ioc_forms')
    .select('id, status')
    .eq('id', formId)
    .maybeSingle()

  if (!form) return { error: 'ไม่พบฟอร์มนี้ หรือคุณไม่มีสิทธิ์ลบ' }
  // Once experts hold links, the form is evidence rather than a draft.
  if (form.status !== 'draft') {
    return { error: 'ฟอร์มนี้ส่งให้ผู้ทรงคุณวุฒิแล้ว ลบไม่ได้ — เพิกถอนลิงก์แทนได้จากหน้าฟอร์ม' }
  }

  const { error } = await supabase.from('ioc_forms').delete().eq('id', formId)
  if (error) return { error: 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  revalidatePath('/research/ioc')
  return { deleted: true }
}

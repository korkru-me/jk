'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  isValidResearchAccessCode,
  normalizeResearchAccessCode,
  type CreateEducationResearchProjectInput,
  type ResearchMeasurementDraft,
} from '@/lib/education-research'

const sectionSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().max(120),
  question_ids: z.array(z.string().uuid()).max(500),
})

const onlineMeasurementSchema = z.object({
  source_type: z.literal('korkru_exam'),
  question_ids: z.array(z.string().uuid()).max(500),
  selection_mode: z.enum(['set', 'sections', 'individual']),
  source_set_id: z.string().uuid().nullable(),
  source_sections: z.array(sectionSchema).max(100),
  duration_minutes: z.number().int().min(1).max(600),
  publish_mode: z.enum(['draft', 'immediate', 'scheduled']),
  start_at: z.string().datetime({ offset: true }).nullable(),
  end_at: z.string().datetime({ offset: true }).nullable(),
  access_code: z.string().max(30).nullable(),
  reuse_pretest_snapshot: z.boolean().optional(),
}).superRefine((value, context) => {
  if (!value.reuse_pretest_snapshot && value.question_ids.length === 0) {
    context.addIssue({ code: 'custom', path: ['question_ids'], message: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' })
  }
  if (value.selection_mode !== 'individual' && !value.reuse_pretest_snapshot && !value.source_set_id) {
    context.addIssue({ code: 'custom', path: ['source_set_id'], message: 'กรุณาเลือกแฟ้มโจทย์' })
  }
  if (value.publish_mode === 'scheduled') {
    if (!value.start_at || !value.end_at || new Date(value.start_at) >= new Date(value.end_at)) {
      context.addIssue({ code: 'custom', path: ['start_at'], message: 'กรุณากำหนดเวลาเปิดและปิดให้ถูกต้อง' })
    }
  }
  if (!isValidResearchAccessCode(value.access_code)) {
    context.addIssue({ code: 'custom', path: ['access_code'], message: 'รหัสเข้าต้องยาว 4–12 ตัว ใช้อักษรอังกฤษ ตัวเลข หรือขีดกลาง' })
  }
})

const offlineMeasurementSchema = z.object({
  source_type: z.enum(['manual', 'excel']),
  max_score: z.number().positive().max(100000),
})

const measurementSchema = z.union([onlineMeasurementSchema, offlineMeasurementSchema])

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(200),
  classroom_id: z.string().uuid(),
  passing_threshold_percent: z.number().positive().max(100),
  pretest: measurementSchema,
  posttest: measurementSchema,
})

const scheduleSchema = z.object({
  measurement_id: z.string().uuid(),
  publish_mode: z.enum(['draft', 'immediate', 'scheduled']),
  start_at: z.string().datetime({ offset: true }).nullable(),
  end_at: z.string().datetime({ offset: true }).nullable(),
  access_code: z.string().max(30).nullable(),
}).superRefine((value, context) => {
  if (value.publish_mode === 'scheduled') {
    if (!value.start_at || !value.end_at || new Date(value.start_at) >= new Date(value.end_at)) {
      context.addIssue({ code: 'custom', path: ['start_at'], message: 'กรุณากำหนดเวลาเปิดและปิดให้ถูกต้อง' })
    }
  }
  if (!isValidResearchAccessCode(value.access_code)) {
    context.addIssue({ code: 'custom', path: ['access_code'], message: 'รหัสเข้าต้องยาว 4–12 ตัว ใช้อักษรอังกฤษ ตัวเลข หรือขีดกลาง' })
  }
})

const projectDetailsSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(200),
  passing_threshold_percent: z.number().positive().max(100),
})

const researchScoreCellSchema = z.object({
  participant_id: z.string().uuid(),
  measurement_id: z.string().uuid(),
  raw_score: z.number().finite().min(0).max(100000),
})

const manualScoresSchema = z.object({
  project_id: z.string().uuid(),
  rows: z.array(researchScoreCellSchema).max(2000),
  reason: z.string().trim().max(500).nullable().optional(),
})

const importConfirmSchema = z.object({
  project_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  confirm_overwrites: z.boolean(),
})

function firstValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
}

function normalizeMeasurementDraft(value: ResearchMeasurementDraft): ResearchMeasurementDraft {
  if (value.source_type !== 'korkru_exam') return value
  return {
    ...value,
    access_code: normalizeResearchAccessCode(value.access_code),
  }
}

function friendlyCreateError(message: string): string {
  if (message.includes('at least one registered student')) return 'ห้องเรียนนี้ยังไม่มีนักเรียนที่สมัคร KorKru และเข้าร่วมห้อง'
  if (message.includes('max scores must be equal')) return 'คะแนนเต็มก่อนเรียนและหลังเรียนต้องเท่ากันเพื่อเปรียบเทียบคะแนนรายคน'
  if (message.includes('missing or not available')) return 'มีโจทย์บางข้อถูกลบหรือคุณไม่มีสิทธิ์ใช้งานแล้ว กรุณาเลือกข้อสอบใหม่'
  if (message.includes('selected folder')) return 'แฟ้มโจทย์มีการเปลี่ยนแปลง กรุณาเลือกแฟ้มหรือแฟ้มย่อยใหม่'
  if (message.includes('cannot create research')) return 'คุณไม่มีสิทธิ์สร้างโครงการในห้องเรียนนี้'
  if (message.includes('scheduled exams')) return 'วันและเวลาเปิด–ปิดข้อสอบไม่ถูกต้อง'
  if (message.includes('access code')) return 'รหัสเข้าต้องยาว 4–12 ตัว ใช้อักษรอังกฤษ ตัวเลข หรือขีดกลาง'
  return 'สร้างโครงการไม่สำเร็จ ข้อมูลอาจมีการเปลี่ยนแปลง กรุณาตรวจสอบแล้วลองใหม่'
}

export async function createEducationResearchProject(input: CreateEducationResearchProjectInput) {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') return { error: 'เฉพาะครูเท่านั้นที่สร้างโครงการวิจัยได้' }

  const pretest = normalizeMeasurementDraft(parsed.data.pretest)
  const posttest = normalizeMeasurementDraft(parsed.data.posttest)
  const { data, error } = await supabase.rpc('create_education_research_project', {
    p_title: parsed.data.title,
    p_topic: parsed.data.topic,
    p_classroom_id: parsed.data.classroom_id,
    p_passing_threshold_percent: parsed.data.passing_threshold_percent,
    p_pretest: pretest,
    p_posttest: posttest,
  })

  if (error || !data) return { error: friendlyCreateError(error?.message ?? '') }

  revalidatePath('/research')
  revalidatePath(`/classrooms/${parsed.data.classroom_id}`)
  return { project_id: data as string }
}

export async function updateEducationResearchSchedule(input: z.input<typeof scheduleSchema>) {
  const parsed = scheduleSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: measurement } = await supabase
    .from('education_research_measurements')
    .select('id, project_id, org_id, assignment_id, measurement_type')
    .eq('id', parsed.data.measurement_id)
    .maybeSingle()

  if (!measurement?.assignment_id) return { error: 'รอบคะแนนนี้ไม่ได้ใช้ข้อสอบออนไลน์ KorKru' }
  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', {
    p_project_id: measurement.project_id,
    p_org_id: measurement.org_id,
  })
  if (!canManage) return { error: 'คุณไม่มีสิทธิ์จัดการกำหนดการของโครงการนี้' }

  const accessCode = normalizeResearchAccessCode(parsed.data.access_code)
  const status = parsed.data.publish_mode === 'draft' ? 'draft' : 'published'
  const startAt = parsed.data.publish_mode === 'scheduled' ? parsed.data.start_at : null
  const endAt = parsed.data.publish_mode === 'draft' ? null : parsed.data.end_at

  const { data: updated, error } = await supabase
    .from('assignments')
    .update({ status, start_at: startAt, end_at: endAt, access_code: accessCode })
    .eq('id', measurement.assignment_id)
    .select('id')
    .maybeSingle()

  if (error || !updated) return { error: 'บันทึกกำหนดการไม่สำเร็จ กรุณาตรวจสิทธิ์และลองใหม่' }

  const { data: project } = await supabase
    .from('education_research_projects')
    .select('status')
    .eq('id', measurement.project_id)
    .maybeSingle()

  if (project && !['ready_for_analysis', 'completed', 'archived'].includes(project.status)) {
    const { data: projectMeasurements } = await supabase
      .from('education_research_measurements')
      .select('measurement_type, assignments(status)')
      .eq('project_id', measurement.project_id)
    const publishedTypes = new Set(
      (projectMeasurements ?? [])
        .filter(item => {
          const assignment = Array.isArray(item.assignments) ? item.assignments[0] : item.assignments
          return assignment?.status === 'published'
        })
        .map(item => item.measurement_type),
    )
    const nextStatus = publishedTypes.has('posttest')
      ? 'collecting_posttest'
      : publishedTypes.has('pretest')
        ? 'collecting_pretest'
        : 'draft'
    await supabase.from('education_research_projects').update({ status: nextStatus }).eq('id', measurement.project_id)
  }

  revalidatePath('/research')
  revalidatePath(`/research/${measurement.project_id}`)
  revalidatePath(`/assignments/${measurement.assignment_id}`)
  return { success: true }
}

export async function updateEducationResearchProjectDetails(input: z.input<typeof projectDetailsSchema>) {
  const parsed = projectDetailsSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: project } = await supabase
    .from('education_research_projects')
    .select('id, org_id, passing_threshold_percent')
    .eq('id', parsed.data.project_id)
    .maybeSingle()
  if (!project) return { error: 'ไม่พบโครงการหรือคุณไม่มีสิทธิ์เข้าถึง' }

  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', {
    p_project_id: project.id,
    p_org_id: project.org_id,
  })
  if (!canManage) return { error: 'คุณไม่มีสิทธิ์แก้ไขโครงการนี้' }

  if (project.passing_threshold_percent !== parsed.data.passing_threshold_percent) {
    const { data: posttest } = await supabase
      .from('education_research_measurements')
      .select('id')
      .eq('project_id', project.id)
      .eq('measurement_type', 'posttest')
      .maybeSingle()
    if (posttest) {
      const { count } = await supabase
        .from('education_research_scores')
        .select('id', { count: 'exact', head: true })
        .eq('measurement_id', posttest.id)
      if ((count ?? 0) > 0) return { error: 'เปลี่ยนเกณฑ์ผ่านไม่ได้หลังมีคะแนนหลังเรียนแล้ว เพราะจะกระทบผลวิเคราะห์' }
    }
  }

  const { data: updated, error } = await supabase
    .from('education_research_projects')
    .update({
      title: parsed.data.title,
      topic: parsed.data.topic,
      passing_threshold_percent: parsed.data.passing_threshold_percent,
    })
    .eq('id', project.id)
    .select('id')
    .maybeSingle()

  if (error || !updated) return { error: 'บันทึกข้อมูลโครงการไม่สำเร็จ กรุณาลองใหม่' }
  revalidatePath('/research')
  revalidatePath(`/research/${project.id}`)
  return { success: true }
}

export async function saveManualResearchScoreDraft(input: z.input<typeof manualScoresSchema>) {
  const parsed = manualScoresSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase.rpc('save_education_research_manual_draft', {
    p_project_id: parsed.data.project_id,
    p_rows: parsed.data.rows,
  })
  if (error) return { error: 'บันทึกฉบับร่างไม่สำเร็จ กรุณาตรวจคะแนนและสิทธิ์แล้วลองใหม่' }

  revalidatePath(`/research/${parsed.data.project_id}/data/manual`)
  return { success: true, saved_count: Number(data ?? 0) }
}

export async function confirmManualResearchScores(input: z.input<typeof manualScoresSchema>) {
  const parsed = manualScoresSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase.rpc('confirm_education_research_manual_scores', {
    p_project_id: parsed.data.project_id,
    p_rows: parsed.data.rows,
    p_reason: parsed.data.reason?.trim() || null,
  })
  if (error) {
    if (error.message.includes('reason is required')) return { error: 'กรุณาระบุเหตุผลเมื่อเปลี่ยนคะแนนเดิม' }
    if (error.message.includes('outside the configured range')) return { error: 'มีคะแนนอยู่นอกช่วง กรุณาตรวจสอบอีกครั้ง' }
    return { error: 'ยืนยันคะแนนไม่สำเร็จ ข้อมูลอาจเปลี่ยนแปลง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' }
  }

  revalidatePath(`/research/${parsed.data.project_id}`)
  revalidatePath(`/research/${parsed.data.project_id}/data`)
  revalidatePath(`/research/${parsed.data.project_id}/data/manual`)
  revalidatePath('/research')
  return { success: true, saved_count: Number(data ?? 0) }
}

export async function confirmEducationResearchImportBatch(input: z.input<typeof importConfirmSchema>) {
  const parsed = importConfirmSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: batch } = await supabase
    .from('education_research_import_batches')
    .select('id, project_id')
    .eq('id', parsed.data.batch_id)
    .eq('project_id', parsed.data.project_id)
    .maybeSingle()
  if (!batch) return { error: 'ไม่พบรายการนำเข้าหรือคุณไม่มีสิทธิ์เข้าถึง' }

  const { data, error } = await supabase.rpc('confirm_education_research_import_batch', {
    p_batch_id: parsed.data.batch_id,
    p_confirm_overwrites: parsed.data.confirm_overwrites,
  })
  if (error) {
    if (error.message.includes('changed after preview')) return { error: 'คะแนนมีการเปลี่ยนหลังตรวจไฟล์ กรุณาอัปโหลดและตรวจสอบใหม่' }
    if (error.message.includes('explicit confirmation')) return { error: 'กรุณายืนยันว่าตรวจสอบคะแนนเดิมและคะแนนใหม่แล้ว' }
    return { error: 'นำเข้าคะแนนไม่สำเร็จ ระบบไม่ได้บันทึกคะแนนบางส่วน กรุณาตรวจสอบแล้วลองใหม่' }
  }

  revalidatePath(`/research/${parsed.data.project_id}`)
  revalidatePath(`/research/${parsed.data.project_id}/data`)
  revalidatePath(`/research/${parsed.data.project_id}/data/import`)
  revalidatePath(`/research/${parsed.data.project_id}/data/import/${parsed.data.batch_id}`)
  revalidatePath('/research')
  return { success: true, saved_count: Number(data ?? 0) }
}

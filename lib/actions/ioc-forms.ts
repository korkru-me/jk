'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  buildIocInstructionText,
  buildIocItemDrafts,
  normalizeIocHeader,
  validateIocHeader,
  type IocHeaderInput,
} from '@/lib/ioc-form'
import { filterSectionsToQuestions, parseSections, type QuestionSetSection } from '@/lib/question-set-sections'
import type { LearningStandard, MCQOption } from '@/lib/types'

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

/** Two indicators are the same one when their code and wording match. */
function standardKey(standard: { code: string; description: string }): string {
  return `${standard.code.trim().toLowerCase()}|${standard.description.trim().toLowerCase()}`
}

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
    // The reason stays in the server log: a teacher gets a sentence they can
    // act on, and the constraint or policy that refused is not guesswork for
    // whoever reads the log next.
    console.error('[ioc] create form failed', error)
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

// ── Step 2: which exam the experts will judge ──────────────────────────────

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('research_measurement'), measurement_id: z.string().uuid() }),
  z.object({ kind: z.literal('assignment'), assignment_id: z.string().uuid() }),
  z.object({
    kind: z.literal('question_selection'),
    set_id: z.string().uuid().nullable(),
    question_ids: z.array(z.string().uuid()).min(1).max(300),
  }),
])

const setSourceSchema = z.object({
  form_id: z.string().uuid(),
  source: sourceSchema,
})

export type SetIocFormSourceInput = z.input<typeof setSourceSchema>

interface EditableForm {
  id: string
  org_id: string
  status: string
  items_frozen_at: string | null
}

/**
 * A form stops being editable the moment its items are frozen, which is when
 * the expert links go out. Everything that rewrites items or experts goes
 * through here so that rule is stated once.
 */
async function loadEditableForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formId: string,
) {
  const { data } = await supabase
    .from('ioc_forms')
    .select('id, org_id, status, items_frozen_at')
    .eq('id', formId)
    .maybeSingle()

  if (!data) return { error: 'ไม่พบฟอร์มนี้ หรือคุณไม่มีสิทธิ์แก้ไข' as const }
  const form = data as EditableForm
  if (form.items_frozen_at || form.status !== 'draft') {
    return { error: 'ฟอร์มนี้ส่งให้ผู้ทรงคุณวุฒิแล้ว จึงตรึงข้อสอบไว้ไม่ให้แก้' as const }
  }
  return { form }
}

/** Questions in the order the exam lists them, not the order the database returns. */
async function loadOrderedQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return []

  const { data } = await supabase
    .from('questions')
    .select('id, question_text, mcq_options, image_urls, solution_text, group_id, order_in_group')
    .in('id', questionIds as string[])

  const byId = new Map((data ?? []).map(row => [row.id as string, row]))
  return questionIds
    .map(id => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map(row => ({
      id: row.id as string,
      question_text: (row.question_text as string | null) ?? '',
      mcq_options: (row.mcq_options as MCQOption[] | null) ?? null,
      image_urls: (row.image_urls as string[] | null) ?? [],
      solution_text: (row.solution_text as string | null) ?? null,
      group_id: (row.group_id as string | null) ?? null,
      order_in_group: (row.order_in_group as number | null) ?? null,
    }))
}

/**
 * What the question bank already remembers about these questions, so step 3
 * opens mostly filled in rather than empty. Returns the indicator per question
 * plus the distinct indicators involved.
 */
async function loadRememberedStandards(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return { byQuestion: new Map<string, string>(), standards: [] as LearningStandard[] }

  const { data: links } = await supabase
    .from('question_standards')
    .select('question_id, standard_id')
    .in('question_id', questionIds as string[])

  const rows = links ?? []
  if (rows.length === 0) return { byQuestion: new Map<string, string>(), standards: [] as LearningStandard[] }

  const standardIds = [...new Set(rows.map(row => row.standard_id as string))]
  const { data: standards } = await supabase
    .from('learning_standards')
    .select('id, org_id, created_by, code, description, subject, grade_level, created_at, updated_at')
    .in('id', standardIds)

  // One indicator per question: a question may measure several, but a printed
  // row has one cell, and the teacher picks in step 3 if that is wrong.
  const byQuestion = new Map<string, string>()
  for (const row of rows) {
    const questionId = row.question_id as string
    if (!byQuestion.has(questionId)) byQuestion.set(questionId, row.standard_id as string)
  }

  return { byQuestion, standards: (standards ?? []) as LearningStandard[] }
}

export async function setIocFormSource(input: SetIocFormSourceInput) {
  const parsed = setSourceSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const auth = await requireTeacher()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  const editable = await loadEditableForm(supabase, parsed.data.form_id)
  if ('error' in editable) return { error: editable.error }
  const { form } = editable

  const source = parsed.data.source
  let questionIds: string[] = []
  let sections: QuestionSetSection[] = []
  const formPatch: Record<string, unknown> = {
    source_kind: source.kind,
    measurement_id: null,
    project_id: null,
    assignment_id: null,
  }

  if (source.kind === 'research_measurement') {
    const { data: measurement } = await supabase
      .from('education_research_measurements')
      .select('id, project_id, snapshot_question_ids, source_sections, education_research_projects(classroom_id)')
      .eq('id', source.measurement_id)
      .maybeSingle()

    if (!measurement) return { error: 'ไม่พบข้อสอบของโครงการวิจัยนี้' }
    questionIds = (measurement.snapshot_question_ids as string[] | null) ?? []
    sections = (measurement.source_sections as QuestionSetSection[] | null) ?? []
    formPatch.measurement_id = measurement.id
    formPatch.project_id = measurement.project_id
    // PostgREST types an embedded row as an array here; one project owns the
    // measurement, so the first element is the only element.
    const project = measurement.education_research_projects as unknown as
      { classroom_id: string | null } | { classroom_id: string | null }[] | null
    const classroomId = Array.isArray(project) ? project[0]?.classroom_id : project?.classroom_id
    if (classroomId) formPatch.classroom_id = classroomId
  } else if (source.kind === 'assignment') {
    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, classroom_id, question_ids, sections')
      .eq('id', source.assignment_id)
      .maybeSingle()

    if (!assignment) return { error: 'ไม่พบงานที่มอบหมายนี้' }
    questionIds = (assignment.question_ids as string[] | null) ?? []
    sections = (assignment.sections as QuestionSetSection[] | null) ?? []
    formPatch.assignment_id = assignment.id
    if (assignment.classroom_id) formPatch.classroom_id = assignment.classroom_id
  } else {
    questionIds = source.question_ids
    if (source.set_id) {
      const { data: set } = await supabase
        .from('question_sets')
        .select('id, sections')
        .eq('id', source.set_id)
        .maybeSingle()
      sections = parseSections(set?.sections)
    }
  }

  if (questionIds.length === 0) return { error: 'ข้อสอบชุดนี้ยังไม่มีข้อให้ประเมิน' }

  const questions = await loadOrderedQuestions(supabase, questionIds)
  if (questions.length === 0) {
    return { error: 'อ่านข้อสอบไม่สำเร็จ อาจถูกลบไปแล้วหรือคุณไม่มีสิทธิ์เข้าถึง' }
  }

  const sectionTitleByQuestionId: Record<string, string> = {}
  for (const section of filterSectionsToQuestions(sections, questionIds)) {
    for (const questionId of section.question_ids) {
      if (!sectionTitleByQuestionId[questionId]) sectionTitleByQuestionId[questionId] = section.title
    }
  }

  const drafts = buildIocItemDrafts(questions, { sectionTitleByQuestionId })
  if (drafts.length === 0) return { error: 'ข้อสอบชุดนี้มีแต่โจทย์ร่วม ยังไม่มีข้อให้ประเมิน' }

  const remembered = await loadRememberedStandards(supabase, drafts.map(draft => draft.source_question_id))

  // Replacing the exam replaces the rows judged against it. Indicators already
  // typed for this form stay: they are the teacher's wording, not the exam's.
  const { error: deleteError } = await supabase.from('ioc_form_items').delete().eq('form_id', form.id)
  if (deleteError) return { error: 'ล้างข้อสอบเดิมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  const { data: existingStandards } = await supabase
    .from('ioc_form_standards')
    .select('id, code, description, order_index')
    .eq('form_id', form.id)
    .order('order_index')

  const formStandards = (existingStandards ?? []).map(row => ({
    id: row.id as string,
    code: (row.code as string) ?? '',
    description: (row.description as string) ?? '',
    order_index: row.order_index as number,
  }))
  const idByKey = new Map(formStandards.map(row => [standardKey(row), row.id]))
  let nextOrder = formStandards.reduce((max, row) => Math.max(max, row.order_index), 0)

  // Copy each remembered indicator into this form once, so the document has
  // its own frozen wording and the library can be edited later without
  // touching a signed page.
  const standardIdByLibraryId = new Map<string, string>()
  for (const standard of remembered.standards) {
    const key = standardKey(standard)
    const existingId = idByKey.get(key)
    if (existingId) {
      standardIdByLibraryId.set(standard.id, existingId)
      continue
    }
    nextOrder += 1
    const { data: created, error: createError } = await supabase
      .from('ioc_form_standards')
      .insert({
        org_id: form.org_id,
        form_id: form.id,
        order_index: nextOrder,
        code: standard.code,
        description: standard.description,
      })
      .select('id')
      .single()
    if (createError || !created) continue
    idByKey.set(key, created.id as string)
    standardIdByLibraryId.set(standard.id, created.id as string)
  }

  const rows = drafts.map(draft => {
    const libraryId = remembered.byQuestion.get(draft.source_question_id)
    return {
      org_id: form.org_id,
      form_id: form.id,
      standard_id: libraryId ? standardIdByLibraryId.get(libraryId) ?? null : null,
      order_index: draft.order_index,
      item_label: draft.item_label,
      section_label: draft.section_label,
      group_intro: draft.group_intro,
      prompt: draft.prompt,
      choices: draft.choices,
      image_urls: draft.image_urls,
      solution: draft.solution,
      source_question_id: draft.source_question_id,
    }
  })

  const { error: insertError } = await supabase.from('ioc_form_items').insert(rows)
  if (insertError) return { error: 'บันทึกข้อสอบลงฟอร์มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  const { error: formError } = await supabase.from('ioc_forms').update(formPatch).eq('id', form.id)
  if (formError) return { error: 'บันทึกแหล่งข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  revalidatePath(`/research/ioc/${form.id}`)
  return {
    form_id: form.id,
    item_count: rows.length,
    prefilled_count: rows.filter(row => row.standard_id).length,
  }
}

// ── Step 3: which indicator each item measures ─────────────────────────────

const standardInputSchema = z.object({
  /** Stable only within one save, so a brand-new indicator can be referenced. */
  key: z.string().min(1).max(60),
  id: z.string().uuid().nullable(),
  code: z.string().max(120),
  description: z.string().max(1000),
})

const saveStandardsSchema = z.object({
  form_id: z.string().uuid(),
  standards: z.array(standardInputSchema).max(60),
  assignments: z.array(z.object({
    item_id: z.string().uuid(),
    standard_key: z.string().max(60).nullable(),
  })).max(300),
  /** Write the pairing back to the question bank for next term's form. */
  remember: z.boolean(),
})

export type SaveIocFormStandardsInput = z.input<typeof saveStandardsSchema>

export async function saveIocFormStandards(input: SaveIocFormStandardsInput) {
  const parsed = saveStandardsSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const auth = await requireTeacher()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const editable = await loadEditableForm(supabase, parsed.data.form_id)
  if ('error' in editable) return { error: editable.error }
  const { form } = editable

  const wanted = parsed.data.standards
    .map(standard => ({
      ...standard,
      code: standard.code.trim().replace(/\s+/g, ' '),
      description: standard.description.trim().replace(/\s+/g, ' '),
    }))
    .filter(standard => standard.code || standard.description)

  const { data: existingRows } = await supabase
    .from('ioc_form_standards')
    .select('id')
    .eq('form_id', form.id)
  const existingIds = new Set((existingRows ?? []).map(row => row.id as string))

  const idByKey = new Map<string, string>()
  let order = 0
  for (const standard of wanted) {
    order += 1
    if (standard.id && existingIds.has(standard.id)) {
      const { error } = await supabase
        .from('ioc_form_standards')
        .update({ code: standard.code, description: standard.description, order_index: order })
        .eq('id', standard.id)
      if (error) return { error: 'บันทึกตัวชี้วัดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
      idByKey.set(standard.key, standard.id)
      existingIds.delete(standard.id)
      continue
    }

    const { data: created, error } = await supabase
      .from('ioc_form_standards')
      .insert({
        org_id: form.org_id,
        form_id: form.id,
        order_index: order,
        code: standard.code,
        description: standard.description,
      })
      .select('id')
      .single()
    if (error || !created) return { error: 'เพิ่มตัวชี้วัดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
    idByKey.set(standard.key, created.id as string)
  }

  // An indicator the teacher removed takes its rows' assignment with it: the
  // foreign key is ON DELETE SET NULL, so those items go back to unmatched.
  if (existingIds.size > 0) {
    await supabase.from('ioc_form_standards').delete().in('id', [...existingIds])
  }

  const { data: items } = await supabase
    .from('ioc_form_items')
    .select('id, source_question_id')
    .eq('form_id', form.id)
  const itemRows = (items ?? []) as { id: string; source_question_id: string | null }[]
  const knownItems = new Set(itemRows.map(row => row.id))

  const assignedStandardByItem = new Map<string, string | null>()
  for (const assignment of parsed.data.assignments) {
    if (!knownItems.has(assignment.item_id)) continue
    const standardId = assignment.standard_key ? idByKey.get(assignment.standard_key) ?? null : null
    assignedStandardByItem.set(assignment.item_id, standardId)
  }

  for (const [itemId, standardId] of assignedStandardByItem) {
    const { error } = await supabase
      .from('ioc_form_items')
      .update({ standard_id: standardId })
      .eq('id', itemId)
    if (error) return { error: 'บันทึกการจับคู่ตัวชี้วัดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  let rememberedCount = 0
  if (parsed.data.remember) {
    rememberedCount = await rememberStandardsOnQuestions({
      supabase,
      orgId: form.org_id,
      userId: user.id,
      items: itemRows,
      assignedStandardByItem,
      formStandards: wanted.map(standard => ({
        id: idByKey.get(standard.key) ?? '',
        code: standard.code,
        description: standard.description,
      })),
    })
  }

  revalidatePath(`/research/ioc/${form.id}`)
  return {
    form_id: form.id,
    matched_count: [...assignedStandardByItem.values()].filter(Boolean).length,
    remembered_count: rememberedCount,
  }
}

/**
 * Copies this form's wording into the school's library and pairs it with the
 * source questions, so the next form for the same questions opens filled in.
 * Never blocks the save: failing to remember is a lost convenience, not a lost
 * document.
 */
async function rememberStandardsOnQuestions({
  supabase,
  orgId,
  userId,
  items,
  assignedStandardByItem,
  formStandards,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  orgId: string
  userId: string
  items: { id: string; source_question_id: string | null }[]
  assignedStandardByItem: Map<string, string | null>
  formStandards: { id: string; code: string; description: string }[]
}): Promise<number> {
  const byFormStandardId = new Map(formStandards.map(standard => [standard.id, standard]))
  const pairs: { questionId: string; code: string; description: string }[] = []

  for (const item of items) {
    if (!item.source_question_id) continue
    if (!assignedStandardByItem.has(item.id)) continue
    const standardId = assignedStandardByItem.get(item.id)
    if (!standardId) continue
    const standard = byFormStandardId.get(standardId)
    if (!standard) continue
    pairs.push({ questionId: item.source_question_id, code: standard.code, description: standard.description })
  }

  if (pairs.length === 0) return 0

  const libraryIdByKey = new Map<string, string>()
  for (const pair of pairs) {
    const key = standardKey(pair)
    if (libraryIdByKey.has(key)) continue

    const query = supabase
      .from('learning_standards')
      .select('id, code, description')
      .eq('org_id', orgId)
    const { data: matches } = pair.code
      ? await query.eq('code', pair.code)
      : await query.eq('description', pair.description)

    const found = (matches ?? []).find(row => standardKey({
      code: (row.code as string) ?? '',
      description: (row.description as string) ?? '',
    }) === key) ?? (matches ?? [])[0]

    if (found) {
      libraryIdByKey.set(key, found.id as string)
      continue
    }

    const { data: created } = await supabase
      .from('learning_standards')
      .insert({ org_id: orgId, created_by: userId, code: pair.code, description: pair.description })
      .select('id')
      .single()
    if (created) libraryIdByKey.set(key, created.id as string)
  }

  const questionIds = [...new Set(pairs.map(pair => pair.questionId))]
  // Replace rather than add: an item now judged against a different indicator
  // must not leave the old pairing behind to prefill the next form wrongly.
  await supabase.from('question_standards').delete().in('question_id', questionIds)

  const links = pairs
    .map(pair => ({
      question_id: pair.questionId,
      standard_id: libraryIdByKey.get(standardKey(pair)),
      org_id: orgId,
      created_by: userId,
    }))
    .filter((link): link is { question_id: string; standard_id: string; org_id: string; created_by: string } =>
      Boolean(link.standard_id))

  if (links.length === 0) return 0
  const { error } = await supabase.from('question_standards').insert(links)
  return error ? 0 : links.length
}

// ── Step 4: who is judging, and how the author signs ───────────────────────

const expertInputSchema = z.object({
  id: z.string().uuid().nullable(),
  display_name: z.string().max(200),
  position_title: z.string().max(200),
  affiliation: z.string().max(200),
})

const saveExpertsSchema = z.object({
  form_id: z.string().uuid(),
  experts: z.array(expertInputSchema).min(1).max(12),
  // Drawn and uploaded signatures arrive with the expert signature pad in the
  // next phase; until then a form signs with a typed name or a blank line.
  author_signature_mode: z.enum(['typed', 'none']),
})

export type SaveIocFormExpertsInput = z.input<typeof saveExpertsSchema>

export async function saveIocFormExperts(input: SaveIocFormExpertsInput) {
  const parsed = saveExpertsSchema.safeParse(input)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const auth = await requireTeacher()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  const editable = await loadEditableForm(supabase, parsed.data.form_id)
  if ('error' in editable) return { error: editable.error }
  const { form } = editable

  const experts = parsed.data.experts.map(expert => ({
    ...expert,
    display_name: expert.display_name.trim().replace(/\s+/g, ' '),
    position_title: expert.position_title.trim(),
    affiliation: expert.affiliation.trim(),
  }))

  if (experts.some(expert => !expert.display_name)) {
    return { error: 'กรอกชื่อผู้ทรงคุณวุฒิให้ครบทุกท่าน หรือลบแถวที่ไม่ใช้ออก' }
  }

  const { data: existingRows } = await supabase
    .from('ioc_form_experts')
    .select('id')
    .eq('form_id', form.id)
  const removedIds = new Set((existingRows ?? []).map(row => row.id as string))

  let order = 0
  for (const expert of experts) {
    order += 1
    const values = {
      display_name: expert.display_name,
      position_title: expert.position_title,
      affiliation: expert.affiliation,
      expert_order: order,
    }

    if (expert.id && removedIds.has(expert.id)) {
      const { error } = await supabase.from('ioc_form_experts').update(values).eq('id', expert.id)
      if (error) return { error: 'บันทึกรายชื่อผู้ทรงคุณวุฒิไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
      removedIds.delete(expert.id)
      continue
    }

    const { error } = await supabase
      .from('ioc_form_experts')
      .insert({ org_id: form.org_id, form_id: form.id, ...values })
    if (error) return { error: 'เพิ่มผู้ทรงคุณวุฒิไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  if (removedIds.size > 0) {
    await supabase.from('ioc_form_experts').delete().in('id', [...removedIds])
  }

  const { error: formError } = await supabase
    .from('ioc_forms')
    .update({
      author_signature_mode: parsed.data.author_signature_mode,
      author_signature_consent_at: parsed.data.author_signature_mode === 'typed' ? new Date().toISOString() : null,
    })
    .eq('id', form.id)
  if (formError) return { error: 'บันทึกวิธีลงนามไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }

  revalidatePath(`/research/ioc/${form.id}`)
  return { form_id: form.id, expert_count: experts.length }
}

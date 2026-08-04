'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyOrgId } from '@/lib/actions/org'
import { toPortableQuestion, buildExportFile, parseExportFile, type PortableQuestion } from '@/lib/question-portable'
import { escapeLike } from '@/lib/utils'
import type { Question } from '@/lib/types'

type QuestionRow = Question & { question_categories?: { name: string } | null }

function slugifyFilename(title: string) {
  return title.trim().replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'question'
}

export async function exportQuestions(ids: string[]) {
  if (ids.length === 0) return { error: 'ไม่ได้เลือกโจทย์' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase
    .from('questions')
    .select('*, question_categories(name)')
    .in('id', ids)
    .eq('created_by', user.id)

  if (error) return { error: error.message }
  const rows = (data ?? []) as QuestionRow[]

  const exportable = rows.filter(q => !q.group_id)
  if (exportable.length === 0) {
    return { error: 'โจทย์แบบหลายขั้นตอน (กลุ่มข้อ) ยังไม่รองรับการส่งออกเป็นไฟล์' }
  }

  const file = buildExportFile(exportable.map(toPortableQuestion))
  const filename = exportable.length === 1
    ? `${slugifyFilename(exportable[0].title)}.korkru.json`
    : `korkru-questions-${exportable.length}.korkru.json`

  return { content: JSON.stringify(file, null, 2), filename }
}

export async function exportQuestionSet(setId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data: set, error: setError } = await supabase
    .from('question_sets')
    .select('*')
    .eq('id', setId)
    .maybeSingle()

  if (setError) return { error: setError.message }
  if (!set) return { error: 'ไม่พบชุดโจทย์นี้' }

  const { data, error } = await supabase
    .from('questions')
    .select('*, question_categories(name)')
    .in('id', set.question_ids)

  if (error) return { error: error.message }
  const rows = (data ?? []) as QuestionRow[]

  const exportable = rows.filter(q => !q.group_id)
  if (exportable.length === 0) {
    return { error: 'ชุดโจทย์นี้ไม่มีโจทย์ที่ส่งออกเป็นไฟล์ได้ (โจทย์แบบหลายขั้นตอนยังไม่รองรับ)' }
  }

  const file = buildExportFile(
    exportable.map(toPortableQuestion),
    { title: set.title, description: set.description, tags: set.tags },
  )

  return { content: JSON.stringify(file, null, 2), filename: `${slugifyFilename(set.title)}.korkru.json` }
}

function normalizeForCompare(s: string) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface DuplicateHit { index: number; title: string }

export async function checkImportDuplicates(raw: string): Promise<
  { error: string } | { duplicates: DuplicateHit[]; total: number }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const parsed = parseExportFile(raw)
  if ('error' in parsed) return { error: parsed.error }
  const file = parsed.data

  const { data: existing, error } = await supabase
    .from('questions')
    .select('title, question_text')
    .eq('created_by', user.id)

  if (error) return { error: error.message }

  const existingTitles = new Set((existing ?? []).map(r => normalizeForCompare(r.title as string)))
  const existingTexts = new Set((existing ?? []).map(r => normalizeForCompare(r.question_text as string)))

  const duplicates: DuplicateHit[] = file.questions
    .map((pq, index) => ({
      index,
      title: pq.title,
      isDup: existingTitles.has(normalizeForCompare(pq.title)) || existingTexts.has(normalizeForCompare(pq.question_text)),
    }))
    .filter(d => d.isDup)
    .map(({ index, title }) => ({ index, title }))

  return { duplicates, total: file.questions.length }
}

async function resolveUniqueTitle(supabase: Awaited<ReturnType<typeof createClient>>, baseTitle: string, userId: string) {
  const { data } = await supabase
    .from('questions')
    .select('title')
    .eq('created_by', userId)
    .ilike('title', `${escapeLike(baseTitle)}%`)

  const existingTitles = new Set((data ?? []).map(r => r.title as string))
  if (!existingTitles.has(baseTitle)) return baseTitle

  let n = 2
  while (existingTitles.has(`${baseTitle} (${n})`)) n++
  return `${baseTitle} (${n})`
}

async function resolveCategoryId(supabase: Awaited<ReturnType<typeof createClient>>, name: string | null) {
  if (!name) return null
  const { data } = await supabase
    .from('question_categories')
    .select('id')
    .ilike('name', escapeLike(name))
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function insertPortableQuestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pq: PortableQuestion,
  userId: string,
  orgId: string,
) {
  const category_id = await resolveCategoryId(supabase, pq.category_name)

  return supabase.from('questions').insert({
    org_id: orgId,
    created_by: userId,
    category_id,
    grade_level: pq.grade_level,
    subject: pq.subject,
    title: pq.title,
    question_text: pq.question_text,
    question_type: pq.question_type,
    difficulty: pq.difficulty,
    visibility: 'private',
    is_random: pq.is_random,
    variables: pq.variables,
    logic_rules: pq.logic_rules,
    answer_formula: pq.answer_formula,
    answer_unit: pq.answer_unit,
    answer_tolerance: pq.answer_tolerance,
    answer_parts: pq.answer_parts,
    mcq_options: pq.mcq_options,
    extra_data: pq.extra_data ?? {},
    solution_text: pq.solution_text,
    solution_image_urls: pq.solution_image_urls ?? [],
    tags: pq.tags,
    image_urls: pq.image_urls ?? [],
    requires_work_image: pq.requires_work_image,
  }).select('id').single()
}

export async function importQuestionsFromFile(
  raw: string,
  duplicateDecision?: 'rename' | 'skip',
  duplicateIndexes: number[] = [],
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const parsed = parseExportFile(raw)
  if ('error' in parsed) return { error: parsed.error }
  const file = parsed.data

  const dupSet = new Set(duplicateIndexes)
  const newIds: string[] = []
  for (let i = 0; i < file.questions.length; i++) {
    const pq = file.questions[i]
    if (dupSet.has(i) && duplicateDecision === 'skip') continue

    const title = (dupSet.has(i) && duplicateDecision === 'rename')
      ? await resolveUniqueTitle(supabase, pq.title, user.id)
      : pq.title

    const { data, error } = await insertPortableQuestion(supabase, { ...pq, title }, user.id, orgId)
    if (error) return { error: error.message, imported: newIds.length }
    newIds.push(data.id as string)
  }

  if (newIds.length === 0) {
    return { error: 'ข้ามโจทย์ที่ซ้ำทั้งหมด ไม่มีโจทย์ใหม่ถูกนำเข้า', imported: 0 }
  }

  let setId: string | undefined
  if (file.kind === 'question_set' && file.set) {
    const { data: set, error } = await supabase
      .from('question_sets')
      .insert({
        org_id: orgId,
        created_by: user.id,
        title: file.set.title,
        description: file.set.description,
        question_ids: newIds,
        tags: file.set.tags,
      })
      .select('id')
      .single()
    if (error) return { error: error.message, imported: newIds.length }
    setId = set.id as string
    revalidatePath('/questions/sets')
  }

  revalidatePath('/questions')
  return { imported: newIds.length, setId }
}

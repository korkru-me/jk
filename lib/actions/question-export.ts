'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyOrgId } from '@/lib/actions/org'
import { toPortableQuestion, buildExportFile, parseExportFile, type PortableQuestion } from '@/lib/question-portable'
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

/**
 * Hands out a title that doesn't collide with one the user already has.
 *
 * Loads their titles once and remembers what it hands out, so a batch import
 * neither costs a query per renamed question nor gives two of them the same
 * "(2)" suffix.
 */
function makeTitleResolver(existingTitles: string[]) {
  const taken = new Set(existingTitles)
  return function resolve(baseTitle: string) {
    if (!taken.has(baseTitle)) { taken.add(baseTitle); return baseTitle }
    let n = 2
    while (taken.has(`${baseTitle} (${n})`)) n++
    const unique = `${baseTitle} (${n})`
    taken.add(unique)
    return unique
  }
}

interface CategoryRow { id: string; name: string; parent_id: string | null }

/**
 * Resolves the `category_name` carried in an export file to an existing
 * category id, by name.
 *
 * Categories are a global, admin-managed taxonomy — an import never creates
 * one (see bulkCreateCategories in lib/actions/admin.ts for that). A name with
 * no match resolves to null, which is a valid `questions.category_id`, so an
 * unrecognised category costs the question its category rather than its import.
 *
 * `category_name` may be a single name or a "หมวดหลัก / หมวดย่อย" path; the
 * path form disambiguates the sub-categories that repeat under several parents
 * ("นิยาม" exists under more than one topic in a real bank).
 */
function makeCategoryResolver(categories: CategoryRow[]) {
  const norm = (s: string) => s.trim().toLowerCase()

  const byName = new Map<string, CategoryRow[]>()
  for (const c of categories) {
    const k = norm(c.name)
    const bucket = byName.get(k)
    if (bucket) bucket.push(c)
    else byName.set(k, [c])
  }

  return function resolve(rawName: string | null): string | null {
    if (!rawName) return null

    const parts = rawName.split('/').map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) return null

    const leaf = byName.get(norm(parts[parts.length - 1]))
    if (!leaf || leaf.length === 0) return null
    if (leaf.length === 1 || parts.length === 1) return leaf[0].id

    // Ambiguous leaf and a parent to go on: prefer the one under that parent.
    const parentIds = new Set((byName.get(norm(parts[parts.length - 2])) ?? []).map(c => c.id))
    return (leaf.find(c => c.parent_id && parentIds.has(c.parent_id)) ?? leaf[0]).id
  }
}

function toQuestionRow(
  pq: PortableQuestion,
  userId: string,
  orgId: string,
  resolveCategory: (name: string | null) => string | null,
) {
  const category_id = resolveCategory(pq.category_name)

  return {
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
  }
}

/**
 * Imports one batch of questions.
 *
 * The client splits a file into batches and calls this per batch (see
 * import-questions-button.tsx): a whole bank runs to a couple of megabytes,
 * over the Server Action body limit, and inserting it as one request meant one
 * round trip per question — a thousand of them, in series.
 *
 * `previousIds` carries the ids from earlier batches so that a question_set
 * file, whose set is created on the final batch, still lists every question.
 */
export async function importQuestionsFromFile(
  raw: string,
  duplicateDecision?: 'rename' | 'skip',
  duplicateIndexes: number[] = [],
  previousIds: string[] = [],
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
  const incoming = file.questions.filter((_, i) => !(dupSet.has(i) && duplicateDecision === 'skip'))

  // Both lookups are per batch rather than per question: the taxonomy to map
  // category names onto ids, the titles to rename around collisions.
  const [{ data: categories }, { data: existing }] = await Promise.all([
    supabase.from('question_categories').select('id, name, parent_id'),
    duplicateDecision === 'rename'
      ? supabase.from('questions').select('title').eq('created_by', user.id)
      : Promise.resolve({ data: [] as { title: string }[] }),
  ])

  const resolveCategory = makeCategoryResolver((categories ?? []) as CategoryRow[])
  const resolveTitle = makeTitleResolver((existing ?? []).map(r => r.title as string))

  const rows = file.questions.flatMap((pq, i) => {
    if (dupSet.has(i) && duplicateDecision === 'skip') return []
    const title = (dupSet.has(i) && duplicateDecision === 'rename') ? resolveTitle(pq.title) : pq.title
    return [toQuestionRow({ ...pq, title }, user.id, orgId, resolveCategory)]
  })

  let newIds: string[] = []
  if (rows.length > 0) {
    // One insert for the batch. PostgREST returns the rows in the order they
    // were sent, which is what keeps a set's question order intact.
    const { data, error } = await supabase.from('questions').insert(rows).select('id')
    if (error) return { error: error.message, imported: 0 }
    newIds = (data ?? []).map(r => r.id as string)
  }

  const allIds = [...previousIds, ...newIds]
  if (allIds.length === 0) {
    return { error: 'ข้ามโจทย์ที่ซ้ำทั้งหมด ไม่มีโจทย์ใหม่ถูกนำเข้า', imported: 0, ids: [] as string[] }
  }

  // Only the batch that carries the set descriptor creates it — the client
  // puts that on the last one.
  let setId: string | undefined
  if (file.kind === 'question_set' && file.set) {
    const { data: set, error } = await supabase
      .from('question_sets')
      .insert({
        org_id: orgId,
        created_by: user.id,
        title: file.set.title,
        description: file.set.description,
        question_ids: allIds,
        tags: file.set.tags,
      })
      .select('id')
      .single()
    if (error) return { error: error.message, imported: newIds.length, ids: newIds }
    setId = set.id as string
    revalidatePath('/questions/sets')
  }

  revalidatePath('/questions')
  return { imported: newIds.length, ids: newIds, setId }
}

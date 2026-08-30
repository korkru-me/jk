'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyOrgId } from '@/lib/actions/org'
import { toPortableQuestion, buildExportFile, parseExportFile, type PortableQuestion } from '@/lib/question-portable'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type { Question } from '@/lib/types'
// One rule for "is this the same wording?", shared with the คลัง's duplicate badge.
import { normalizeQuestionText } from '@/lib/question-content-match'
import { withContentFingerprint } from '@/lib/question-fingerprint'
import { fileQuestionsIntoSets } from '@/lib/question-set-filing'

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
    .eq('is_research_snapshot', false)

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
  if (!set) return { error: 'ไม่พบแฟ้มโจทย์นี้' }

  const { data, error } = await supabase
    .from('questions')
    .select('*, question_categories(name)')
    .in('id', set.question_ids)

  if (error) return { error: error.message }
  const rows = (data ?? []) as QuestionRow[]

  const exportable = rows.filter(q => !q.group_id)
  if (exportable.length === 0) {
    return { error: 'แฟ้มโจทย์นี้ไม่มีโจทย์ที่ส่งออกเป็นไฟล์ได้ (โจทย์แบบหลายขั้นตอนยังไม่รองรับ)' }
  }

  const file = buildExportFile(
    exportable.map(toPortableQuestion),
    { title: set.title, description: set.description, tags: set.tags },
  )

  return { content: JSON.stringify(file, null, 2), filename: `${slugifyFilename(set.title)}.korkru.json` }
}

/** `fetchAllRows` widens its error to unknown; Supabase's is a plain object with a message. */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string') return message
  }
  return 'อ่านคลังโจทย์เดิมไม่สำเร็จ'
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

  // Paged: PostgREST caps a response at 1,000 rows, so an unpaged read of a
  // bank past that compared the incoming file against only part of it, and
  // which part was left to whatever order the database happened to return.
  // A re-import of a question in the missing tail came back as "ไม่ซ้ำ".
  const { rows: existing, error } = await fetchAllRows<{ title: string; question_text: string }>(
    (from, to) => supabase
      .from('questions')
      .select('title, question_text')
      .eq('created_by', user.id)
      .eq('is_research_snapshot', false)
      .order('id')
      .range(from, to)
  )
  if (error) return { error: readErrorMessage(error) }

  const existingTitles = new Set(existing.map(r => normalizeQuestionText(r.title)))
  const existingTexts = new Set(existing.map(r => normalizeQuestionText(r.question_text)))

  const duplicates: DuplicateHit[] = file.questions
    .map((pq, index) => ({
      index,
      title: pq.title,
      isDup: existingTitles.has(normalizeQuestionText(pq.title)) || existingTexts.has(normalizeQuestionText(pq.question_text)),
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

  return withContentFingerprint({
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
  })
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
 *
 * `fileIntoSetIds` names แฟ้ม that already exist to add every imported โจทย์ to.
 * Like the set descriptor it belongs to the final call, because a แฟ้ม should
 * receive the whole import at once rather than a batch at a time; the caller
 * passes it only there. Filing is creator-checked inside `fileQuestionsIntoSets`.
 */
export async function importQuestionsFromFile(
  raw: string,
  duplicateDecision?: 'rename' | 'skip',
  duplicateIndexes: number[] = [],
  previousIds: string[] = [],
  fileIntoSetIds: string[] = [],
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
  const [{ data: categories }, existingTitles] = await Promise.all([
    supabase.from('question_categories').select('id, name, parent_id'),
    // Paged for the same reason as the duplicate check: a title read that
    // stopped at 1,000 rows could hand out a "(2)" that a later question in
    // the same bank already answers to.
    duplicateDecision === 'rename'
      ? fetchAllRows<{ title: string }>((from, to) => supabase
        .from('questions')
        .select('title')
        .eq('created_by', user.id)
        .eq('is_research_snapshot', false)
        .order('id')
        .range(from, to)
      ).then(result => result.rows)
      : Promise.resolve([] as { title: string }[]),
  ])

  const resolveCategory = makeCategoryResolver((categories ?? []) as CategoryRow[])
  const resolveTitle = makeTitleResolver(existingTitles.map(r => r.title))

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

  // Filing runs after the โจทย์ exist and never fails the import: the โจทย์ are
  // already in the คลัง at this point, so a แฟ้ม that could not be written is
  // reported alongside a success rather than as one.
  let filingError: string | undefined
  if (fileIntoSetIds.length > 0) {
    const filed = await fileQuestionsIntoSets(supabase, user.id, fileIntoSetIds, allIds)
    if ('error' in filed) filingError = filed.error
    else {
      const failed = filed.outcomes.filter(outcome => outcome.error)
      if (failed.length > 0) filingError = `เก็บเข้าแฟ้มไม่สำเร็จ: ${failed.map(o => o.title).join(', ')}`
    }
    revalidatePath('/questions/sets')
  }

  revalidatePath('/questions')
  return { imported: newIds.length, ids: newIds, setId, filingError }
}

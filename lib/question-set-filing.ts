import type { createClient } from '@/lib/supabase/server'
import { normalizeSetSections } from '@/lib/question-set-sections'

/**
 * Putting โจทย์ into แฟ้ม that already exist, without touching anything else
 * about them.
 *
 * Two callers reach the same write from opposite directions: the คลัง's filing
 * dialog, which has โจทย์ and picks แฟ้ม for them, and the create form, which
 * picks แฟ้ม before the โจทย์ it is filing exists at all. Both append ids and
 * leave every other column of the แฟ้ม alone — unlike `updateQuestionSet`,
 * which rewrites a แฟ้ม whole and would need the client to send back state it
 * never read.
 *
 * Only the caller's own แฟ้ม can be written: editing a แฟ้ม is creator-only in
 * RLS, and the read filters by `created_by` as well so a แฟ้ม that is not
 * theirs is reported as missing instead of failing silently.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** What one แฟ้ม did with the ids handed to it. */
export interface SetFilingOutcome {
  title: string
  /** 0 when the แฟ้ม already held every โจทย์ — not an error. */
  added: number
  error: string | null
}

export type FileQuestionsResult = { error: string } | { outcomes: SetFilingOutcome[] }

export async function fileQuestionsIntoSets(
  supabase: ServerClient,
  userId: string,
  setIds: string[],
  questionIds: string[],
): Promise<FileQuestionsResult> {
  const wantedSetIds = [...new Set(setIds)].filter(Boolean)
  const wantedQuestionIds = [...new Set(questionIds)].filter(Boolean)
  if (wantedSetIds.length === 0) return { error: 'ยังไม่ได้เลือกแฟ้มโจทย์' }
  if (wantedQuestionIds.length === 0) return { error: 'ยังไม่ได้เลือกโจทย์' }

  const { data: sets, error: readError } = await supabase
    .from('question_sets')
    .select('id, title, question_ids, sections')
    .in('id', wantedSetIds)
    .eq('created_by', userId)
  if (readError) return { error: readError.message }
  if (!sets || sets.length === 0) return { error: 'ไม่พบแฟ้มโจทย์ที่เลือก หรือไม่ใช่แฟ้มของคุณ' }

  // Order inside a แฟ้ม is the teacher's own, so new ids go at the end. An id
  // the แฟ้ม already holds is skipped rather than repeated, and `sections` is
  // re-normalized against the new membership so แฟ้มย่อย stay valid — a newly
  // added โจทย์ belongs to no แฟ้มย่อย until someone puts it in one.
  const outcomes = await Promise.all(sets.map(async (set: any) => {
    const current = (set.question_ids ?? []) as string[]
    const existing = new Set(current)
    const incoming = wantedQuestionIds.filter(id => !existing.has(id))
    if (incoming.length === 0) return { title: set.title as string, added: 0, error: null }

    const normalized = normalizeSetSections(set.sections ?? [], [...current, ...incoming])
    const { error } = await supabase
      .from('question_sets')
      .update({ question_ids: normalized.question_ids, sections: normalized.sections })
      .eq('id', set.id)
    return { title: set.title as string, added: incoming.length, error: error?.message ?? null }
  }))

  return { outcomes }
}

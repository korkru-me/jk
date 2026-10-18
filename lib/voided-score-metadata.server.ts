import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

type ScoreMetadata = { voided_max_score?: number }
type ScoreReadResult<T, E> = { data: T[] | null; error: E }

function isMissingVoidedScoreColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message, details } = error as { code?: unknown; message?: unknown; details?: unknown }
  return (code === '42703' || code === 'PGRST204')
    && [message, details].some(text => typeof text === 'string' && /\bvoided_max_score\b/i.test(text))
}

function projectedVoidedScore(row: object): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(row, 'voided_max_score')) return undefined
  const value = (row as { voided_max_score?: unknown }).voided_max_score
  if (value === null) return 0
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return undefined
  const score = Number(value)
  return Number.isFinite(score) && score >= 0 ? score : undefined
}

/** Include score metadata in the caller's original authorized read. Only an
 * installation missing this optional column retries the legacy projection. */
export async function readWithVoidedScoreMetadata<T extends object, E>(
  read: (includeVoided: boolean) => PromiseLike<ScoreReadResult<T, E>>,
): Promise<ScoreReadResult<T & ScoreMetadata, E>> {
  const result = await read(true)
  if (isMissingVoidedScoreColumn(result.error)) return read(false)
  if (result.error || !result.data) return result
  return {
    ...result,
    data: result.data.map(row => {
      const score = projectedVoidedScore(row)
      return score === undefined ? row : { ...row, voided_max_score: score }
    }),
  }
}

/** Add only score metadata for submission IDs the caller has already authorized.
 * Retains compatibility with an installation awaiting the new migration. */
export async function withVoidedScoreMetadata<T extends { id: string }>(reader: SupabaseClient, rows: T[]): Promise<Array<T & { voided_max_score?: number }>> {
  if (rows.length === 0) return rows
  if (rows.every(row => projectedVoidedScore(row) !== undefined)) {
    return rows.map(row => ({ ...row, voided_max_score: projectedVoidedScore(row)! }))
  }
  const removed = new Map<string, number>()
  const ids = [...new Set(rows.map(row => row.id))]
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100)
    const { data, error } = await reader.from('submissions').select('id, voided_max_score').in('id', chunk)
    if (error) {
      if (isMissingVoidedScoreColumn(error)) return rows
      throw new Error('อ่านคะแนนเต็มหลังทำข้อเป็นโมฆะไม่สำเร็จ')
    }
    const returnedIds = new Set((data ?? []).map(row => row.id))
    if ((data?.length ?? 0) !== chunk.length || returnedIds.size !== chunk.length || chunk.some(id => !returnedIds.has(id))) {
      throw new Error('สิทธิ์อ่านคะแนนมีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่')
    }
    for (const row of data ?? []) removed.set(row.id, Number(row.voided_max_score ?? 0))
  }
  return rows.map(row => ({ ...row, voided_max_score: removed.get(row.id) ?? 0 }))
}

export async function loadVoidedQuestionIds(reader: SupabaseClient, assignmentId: string): Promise<Set<string>> {
  return (await loadAssignmentGradingState(reader, assignmentId)).voidedIds
}

export async function loadAssignmentGradingState(reader: SupabaseClient, assignmentId: string): Promise<{ available: boolean; voidedIds: Set<string> }> {
  const { data, error } = await reader.from('assignment_void_questions').select('question_id').eq('assignment_id', assignmentId)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return { available: false, voidedIds: new Set() }
    throw new Error('อ่านสถานะข้อที่เป็นโมฆะไม่สำเร็จ')
  }
  return { available: true, voidedIds: new Set((data ?? []).map(row => row.question_id as string)) }
}

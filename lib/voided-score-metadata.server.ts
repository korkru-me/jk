import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Add only score metadata for submission IDs the caller has already authorized.
 * Retains compatibility with an installation awaiting the new migration. */
export async function withVoidedScoreMetadata<T extends { id: string }>(reader: SupabaseClient, rows: T[]): Promise<Array<T & { voided_max_score?: number }>> {
  if (rows.length === 0) return rows
  const removed = new Map<string, number>()
  const ids = [...new Set(rows.map(row => row.id))]
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await reader.from('submissions').select('id, voided_max_score').in('id', ids.slice(start, start + 100))
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204') return rows
      throw new Error('อ่านคะแนนเต็มหลังทำข้อเป็นโมฆะไม่สำเร็จ')
    }
    if ((data?.length ?? 0) !== ids.slice(start, start + 100).length) throw new Error('สิทธิ์อ่านคะแนนมีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่')
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

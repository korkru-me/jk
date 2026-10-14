import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { canReadPracticeLibrary, type PracticeClassroomAccess, type PracticeLibraryStatus } from '@/lib/practice-library-contracts'
import { classroomPracticeLibraryItem, type ClassroomPracticeLibrariesResult } from './classroom-practice-libraries'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type LibrarySummaryRow = {
  id: string
  title: string
  status: PracticeLibraryStatus
  practice_library_questions: Array<{ count: number }> | null
}

/** The caller verifies the classroom relationship; the session client also enforces RLS. */
export async function loadClassroomPracticeLibraries(
  supabase: SupabaseServerClient,
  classroomId: string,
  access: PracticeClassroomAccess,
): Promise<ClassroomPracticeLibrariesResult> {
  if (access === 'none') return { items: [], error: null }

  const { rows, error } = await fetchAllRows<LibrarySummaryRow>(async (from, to) => {
    let query = supabase
      .from('practice_libraries')
      .select('id, title, status, practice_library_questions(count)')
      .eq('classroom_id', classroomId)
    if (access === 'student_member') query = query.eq('status', 'published')
    const result = await query
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    return { data: result.data as unknown as LibrarySummaryRow[] | null, error: result.error }
  })
  if (error) return { items: [], error: 'โหลดคลังฝึกไม่สำเร็จ กรุณาลองโหลดหน้าใหม่' }

  return {
    items: rows
      .filter(row => canReadPracticeLibrary(access, row.status))
      .map(row => classroomPracticeLibraryItem({
        id: row.id,
        title: row.title,
        status: row.status,
        questionCount: row.practice_library_questions?.[0]?.count ?? 0,
      })),
    error: null,
  }
}

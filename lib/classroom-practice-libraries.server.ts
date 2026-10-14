import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { canReadPracticeLibrary, type PracticeClassroomAccess, type PracticeLibraryStatus } from '@/lib/practice-library-contracts'
import { classroomPracticeLibraryItem, type ClassroomPracticeLibrariesResult } from './classroom-practice-libraries'
import { isMissingAssignmentCategorySchema } from './assignment-categories'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type LibrarySummaryRow = {
  id: string
  title: string
  status: PracticeLibraryStatus
  category_id?: string | null
  display_order?: number | null
  practice_library_questions: Array<{ count: number }> | null
}

/** The caller verifies the classroom relationship; the session client also enforces RLS. */
export async function loadClassroomPracticeLibraries(
  supabase: SupabaseServerClient,
  classroomId: string,
  access: PracticeClassroomAccess,
): Promise<ClassroomPracticeLibrariesResult> {
  if (access === 'none') return { items: [], error: null }

  async function load(includeLayout: boolean) {
    return fetchAllRows<LibrarySummaryRow>(async (from, to) => {
      let query = supabase
        .from('practice_libraries')
        .select(includeLayout
          ? 'id, title, status, category_id, display_order, practice_library_questions(count)'
          : 'id, title, status, practice_library_questions(count)')
        .eq('classroom_id', classroomId)
      if (access === 'student_member') query = query.eq('status', 'published')
      const result = await query
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
      return { data: result.data as unknown as LibrarySummaryRow[] | null, error: result.error }
    })
  }
  let layoutAvailable = true
  let { rows, error } = await load(true)
  if (error && typeof error === 'object' && 'code' in error
    && isMissingAssignmentCategorySchema({ code: String(error.code) })) {
    layoutAvailable = false
    ;({ rows, error } = await load(false))
  }
  if (error) return { items: [], error: 'โหลดคลังฝึกไม่สำเร็จ กรุณาลองโหลดหน้าใหม่' }

  return {
    items: rows
      .filter(row => canReadPracticeLibrary(access, row.status))
      .map(row => classroomPracticeLibraryItem({
        id: row.id,
        title: row.title,
        status: row.status,
        questionCount: row.practice_library_questions?.[0]?.count ?? 0,
        ...(layoutAvailable ? { categoryId: row.category_id ?? null, displayOrder: row.display_order ?? null } : {}),
      })),
    error: null,
    layoutAvailable,
  }
}

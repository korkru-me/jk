import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import {
  isEligibleStudentPracticeClassroom,
  studentPracticeLibraryListItem,
  type StudentPracticeLibraryListItem,
} from './student-landing-contract'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type ClassroomSummary = {
  id: string
  name: string
  status: string
  classroom_type: string
}

type MembershipRow = {
  classroom_id: string
  classrooms: ClassroomSummary | ClassroomSummary[] | null
}

type StudentLibraryRow = {
  id: string
  classroom_id: string
  title: string
  practice_library_questions: Array<{ count: number }> | null
}

function oneClassroom(value: MembershipRow['classrooms']): ClassroomSummary | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export async function loadStudentPracticeLibraries(
  supabase: SupabaseServerClient,
  studentId: string,
): Promise<{ items: StudentPracticeLibraryListItem[]; error: string | null }> {
  const { data: memberships, error: membershipError } = await supabase
    .from('classroom_students')
    .select('classroom_id, classrooms!inner(id, name, status, classroom_type)')
    .eq('student_id', studentId)
    .eq('classrooms.status', 'active')
    .eq('classrooms.classroom_type', 'subject')
  if (membershipError) {
    return { items: [], error: 'โหลดห้องเรียนสำหรับคลังฝึกไม่สำเร็จ' }
  }

  const classrooms = new Map<string, ClassroomSummary>()
  for (const membership of (memberships ?? []) as unknown as MembershipRow[]) {
    const classroom = oneClassroom(membership.classrooms)
    if (!classroom || !isEligibleStudentPracticeClassroom({
      status: classroom.status,
      classroomType: classroom.classroom_type,
    })) continue
    classrooms.set(classroom.id, classroom)
  }
  const classroomIds = [...classrooms.keys()]
  if (classroomIds.length === 0) return { items: [], error: null }

  const { rows, error } = await fetchAllRows<StudentLibraryRow>(async (from, to) => {
    const result = await supabase
      .from('practice_libraries')
      .select('id, classroom_id, title, practice_library_questions(count)')
      .eq('status', 'published')
      .in('classroom_id', classroomIds)
      .order('published_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    return {
      data: result.data as unknown as StudentLibraryRow[] | null,
      error: result.error,
    }
  })
  if (error) return { items: [], error: 'โหลดคลังฝึกไม่สำเร็จ' }

  const items = rows.flatMap(row => {
    const classroom = classrooms.get(row.classroom_id)
    if (!classroom) return []
    return [studentPracticeLibraryListItem({
      id: row.id,
      title: row.title,
      classroomId: classroom.id,
      classroomName: classroom.name,
      questionCount: row.practice_library_questions?.[0]?.count ?? 0,
    })]
  })
  return { items, error: null }
}

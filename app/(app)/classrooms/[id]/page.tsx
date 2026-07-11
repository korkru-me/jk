import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Classroom, User } from '@/lib/types'
import { ClassroomDetailClient } from './_components/classroom-detail-client'

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role, full_name').eq('id', authUser!.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  // Use admin client to bypass RLS recursion on classrooms ↔ classroom_students
  const admin = createAdminClient()

  const { data: classroom } = await admin
    .from('classrooms').select('*').eq('id', id).maybeSingle()
  if (!classroom) notFound()

  const c = classroom as Classroom
  const isOwner = c.teacher_id === authUser!.id

  // Students in this classroom
  const { data: memberships } = await admin
    .from('classroom_students')
    .select('student_id, users!inner(id, full_name, email)')
    .eq('classroom_id', id)

  const students = (memberships ?? []).map((m: any) => m.users) as Pick<User, 'id' | 'full_name' | 'email'>[]

  // Assignment count
  const { count: assignmentCount } = await supabase
    .from('assignments')
    .select('id', { count: 'exact', head: true })
    .eq('classroom_id', id)

  // Other classrooms for "move student" feature
  let otherClassrooms: { id: string; name: string }[] = []
  if (isOwner) {
    const { data: others } = await admin
      .from('classrooms')
      .select('id, name')
      .eq('teacher_id', authUser!.id)
      .neq('id', id)
    otherClassrooms = (others ?? []) as { id: string; name: string }[]
  }

  // Owner's full name for co-teachers display
  const { data: ownerProfile } = await admin
    .from('users').select('full_name').eq('id', c.teacher_id).single()

  return (
    <ClassroomDetailClient
      classroom={c}
      students={students}
      assignmentCount={assignmentCount ?? 0}
      otherClassrooms={otherClassrooms}
      isOwner={isOwner}
      ownerName={ownerProfile?.full_name ?? 'ครูหลัก'}
    />
  )
}

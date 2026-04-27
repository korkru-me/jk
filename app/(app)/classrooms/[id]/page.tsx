import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClassroomMembers } from '@/components/classrooms/classroom-members'
import { DeleteClassroomButton } from '@/components/classrooms/delete-classroom-button'
import type { Classroom, User } from '@/lib/types'

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser!.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  const { data: classroom } = await supabase
    .from('classrooms').select('*').eq('id', id).maybeSingle()
  if (!classroom) notFound()

  const c = classroom as Classroom
  const isOwner = c.teacher_id === authUser!.id

  const { data: memberships } = await supabase
    .from('classroom_students')
    .select('student_id, users!inner(id, full_name, email)')
    .eq('classroom_id', id)

  const students = (memberships ?? []).map((m: any) => m.users) as Pick<User, 'id' | 'full_name' | 'email'>[]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
          {c.description && (
            <p className="text-sm text-gray-500 mt-1">{c.description}</p>
          )}
        </div>
        {isOwner && <DeleteClassroomButton id={id} />}
      </div>

      {isTeacher && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-medium mb-1">รหัสห้องเรียน</p>
            <p className="text-3xl font-mono font-bold text-blue-800 tracking-[0.3em]">
              {c.class_code}
            </p>
            <p className="text-xs text-blue-400 mt-1">แชร์รหัสนี้ให้นักเรียนเพื่อเข้าร่วม</p>
          </div>
          <span className="text-5xl">🔑</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">นักเรียน ({students.length} คน)</h2>
        <ClassroomMembers
          classroomId={id}
          students={students}
          isTeacher={isOwner}
        />
      </div>
    </div>
  )
}

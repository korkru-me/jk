import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClassroomMembers } from '@/components/classrooms/classroom-members'
import { DeleteClassroomButton } from '@/components/classrooms/delete-classroom-button'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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

  // Fetch assignments for this classroom
  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, title, status, mode, question_ids')
    .eq('classroom_id', id)
    .order('created_at', { ascending: false })

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

      {/* Assignments for this classroom */}
      {isOwner && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              ชุดข้อสอบ ({(assignments ?? []).length})
            </h2>
            <Link
              href={`/assignments/new`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              + สร้างชุดข้อสอบ
            </Link>
          </div>
          {(assignments ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีชุดข้อสอบ</p>
          ) : (
            <div className="space-y-2">
              {(assignments ?? []).map((a: any) => (
                <Link
                  key={a.id}
                  href={`/assignments/${a.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-400">{a.question_ids?.length ?? 0} ข้อ</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.status === 'published' ? 'bg-green-100 text-green-700'
                    : a.status === 'closed' ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {a.status === 'published' ? 'เผยแพร่แล้ว'
                      : a.status === 'closed' ? 'ปิดแล้ว' : 'ร่าง'}
                  </span>
                </Link>
              ))}
            </div>
          )}
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

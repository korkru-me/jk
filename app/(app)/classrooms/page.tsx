import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { JoinClassroomForm } from '@/components/classrooms/join-classroom-form'
import { cn } from '@/lib/utils'
import type { Classroom, User } from '@/lib/types'

export default async function ClassroomsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser!.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  if (isTeacher) {
    const { data: classrooms } = await supabase
      .from('classrooms')
      .select('*')
      .eq('teacher_id', authUser!.id)
      .order('created_at', { ascending: false })

    return <TeacherView classrooms={(classrooms ?? []) as Classroom[]} />
  } else {
    const { data: memberships } = await supabase
      .from('classroom_students')
      .select('classroom_id, classrooms(*)')
      .eq('student_id', authUser!.id)

    const classrooms = (memberships ?? [])
      .map((m: any) => m.classrooms)
      .filter(Boolean) as Classroom[]

    return <StudentView classrooms={classrooms} />
  }
}

function TeacherView({ classrooms }: { classrooms: Classroom[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ห้องเรียนของฉัน</h1>
          <p className="text-sm text-gray-500 mt-1">{classrooms.length} ห้องเรียน</p>
        </div>
        <Link href="/classrooms/new" className={cn(buttonVariants({ variant: 'default' }))}>
          + สร้างห้องเรียน
        </Link>
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">🏫</p>
          <p className="text-gray-500 font-medium">ยังไม่มีห้องเรียน</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">สร้างห้องเรียนแรกของคุณเพื่อเริ่มต้น</p>
          <Link href="/classrooms/new" className={cn(buttonVariants({ variant: 'default' }))}>
            สร้างห้องเรียน
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/classrooms/${c.id}`}
              className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                  {c.description && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <span className="shrink-0 text-2xl">🏫</span>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs font-mono text-gray-500">รหัส: <span className="font-bold text-gray-700 tracking-widest">{c.class_code}</span></p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StudentView({ classrooms }: { classrooms: Classroom[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ห้องเรียนของฉัน</h1>
        <p className="text-sm text-gray-500 mt-1">{classrooms.length} ห้องเรียน</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">เข้าร่วมห้องเรียนใหม่</p>
        <JoinClassroomForm />
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">🏫</p>
          <p className="text-gray-500 font-medium">ยังไม่ได้เข้าร่วมห้องเรียนใด</p>
          <p className="text-sm text-gray-400 mt-1">กรอกรหัสห้องเรียนจากครูเพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map((c) => (
            <Link
              key={c.id}
              href={`/classrooms/${c.id}`}
              className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                <span className="shrink-0 text-2xl">🏫</span>
              </div>
              {c.description && (
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{c.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

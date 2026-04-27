'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { removeStudent, leaveClassroom } from '@/lib/actions/classrooms'
import type { User } from '@/lib/types'

interface ClassroomMembersProps {
  classroomId: string
  students: Pick<User, 'id' | 'full_name' | 'email'>[]
  isTeacher: boolean
}

export function ClassroomMembers({ classroomId, students, isTeacher }: ClassroomMembersProps) {
  return (
    <div className="space-y-2">
      {students.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">ยังไม่มีนักเรียนในห้องเรียนนี้</p>
      )}
      {students.map((s) => (
        <StudentRow
          key={s.id}
          student={s}
          classroomId={classroomId}
          isTeacher={isTeacher}
        />
      ))}
    </div>
  )
}

function StudentRow({
  student,
  classroomId,
  isTeacher,
}: {
  student: Pick<User, 'id' | 'full_name' | 'email'>
  classroomId: string
  isTeacher: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleRemove() {
    if (!confirm(`นำ ${student.full_name} ออกจากห้องเรียน?`)) return
    startTransition(async () => {
      const res = await removeStudent(classroomId, student.id)
      if (res?.error) toast.error(res.error)
      else { toast.success('นำนักเรียนออกแล้ว'); router.refresh() }
    })
  }

  function handleLeave() {
    if (!confirm('ออกจากห้องเรียนนี้?')) return
    startTransition(async () => {
      const res = await leaveClassroom(classroomId)
      if (res?.error) toast.error(res.error)
      else { toast.success('ออกจากห้องเรียนแล้ว'); router.push('/classrooms') }
    })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">
        {student.full_name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
        <p className="text-xs text-gray-400 truncate">{student.email}</p>
      </div>
      {isTeacher ? (
        <button
          onClick={handleRemove}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
        >
          นำออก
        </button>
      ) : (
        <button
          onClick={handleLeave}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
        >
          ออก
        </button>
      )}
    </div>
  )
}

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { removeStudent, leaveClassroom } from '@/lib/actions/classrooms'
import type { User } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface ClassroomMembersProps {
  classroomId: string
  students: Pick<User, 'id' | 'full_name' | 'email'>[]
  isTeacher: boolean
}

export function ClassroomMembers({ classroomId, students, isTeacher }: ClassroomMembersProps) {
  return (
    <div className="space-y-2">
      {students.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีนักเรียนในห้องเรียนนี้</p>
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
  const [confirm, confirmDialog] = useConfirm()

  async function handleRemove() {
    const ok = await confirm({
      title: `นำ “${student.full_name}” ออกจากห้องเรียน?`,
      description: 'นักเรียนจะไม่เห็นห้องเรียนนี้อีก และเพิ่มกลับเข้ามาใหม่ได้ภายหลัง',
      confirmLabel: 'นำออก',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeStudent(classroomId, student.id)
      if (res?.error) toast.error(res.error)
      else { toast.success('นำนักเรียนออกแล้ว'); router.refresh() }
    })
  }

  async function handleLeave() {
    const ok = await confirm({
      title: 'ออกจากห้องเรียนนี้?',
      description: 'คุณจะไม่เห็นงานและประกาศของห้องเรียนนี้อีก',
      confirmLabel: 'ออกจากห้องเรียน',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await leaveClassroom(classroomId)
      if (res?.error) toast.error(res.error)
      else { toast.success('ออกจากห้องเรียนแล้ว'); router.push('/classrooms') }
    })
  }

  return (
    <Card radius="md" className="flex items-center gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
        {student.full_name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{student.full_name}</p>
        <p className="text-xs text-muted-foreground truncate">{student.email}</p>
      </div>
      {isTeacher ? (
        <button
          onClick={handleRemove}
          disabled={isPending}
          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-40"
        >
          นำออก
        </button>
      ) : (
        <button
          onClick={handleLeave}
          disabled={isPending}
          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-40"
        >
          ออก
        </button>
      )}
      {confirmDialog}
    </Card>
  )
}

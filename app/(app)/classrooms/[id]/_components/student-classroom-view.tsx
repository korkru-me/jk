import Link from 'next/link'
import { BookOpen, ChevronLeft, GraduationCap, Users } from 'lucide-react'
import { ClassroomStream } from './classroom-stream'
import { AssignmentList } from './assignment-list'
import { isCompleted, type StudentAssignmentRow } from './assignment-status'
import type { Classroom, ClassroomPost } from '@/lib/types'

export type { StudentAssignmentRow }

interface Props {
  classroom: Classroom
  teacherName: string
  studentCount: number
  assignments: StudentAssignmentRow[]
  posts: ClassroomPost[]
}

export function StudentClassroomView({ classroom, teacherName, studentCount, assignments, posts }: Props) {
  const doneCount = assignments.filter(isCompleted).length

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/classrooms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> ห้องเรียนทั้งหมด
      </Link>

      {/* Header card */}
      <div className="bg-card border rounded-2xl p-6">
        <h1 className="text-2xl font-bold leading-tight">{classroom.name}</h1>
        {classroom.description && (
          <p className="text-muted-foreground text-sm mt-1">{classroom.description}</p>
        )}

        <div className="flex items-center gap-5 mt-4 flex-wrap text-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">ครูผู้สอน:</span>
            <span className="font-medium">{teacherName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{studentCount}</span>
            <span className="text-muted-foreground">คนในห้องนี้</span>
          </div>
        </div>
      </div>

      {/* Stream */}
      <div>
        <h2 className="font-semibold mb-3">ประกาศ</h2>
        <ClassroomStream classroomId={classroom.id} canPost={false} initialPosts={posts} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <BookOpen size={18} className="text-primary" />
            <span className="text-xl font-black">{assignments.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">งานที่มอบหมายทั้งหมด</p>
        </div>
        <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl">✅</span>
            <span className="text-xl font-black text-success">{doneCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">ส่งงานแล้ว</p>
        </div>
      </div>

      {/* Assignments */}
      <div>
        <h2 className="font-semibold mb-3">งานที่มอบหมายในห้องนี้</h2>
        {assignments.length === 0 ? (
          <div className="bg-card border border-dashed rounded-2xl p-8 text-center">
            <p className="text-3xl mb-3">📝</p>
            <p className="font-semibold">ยังไม่มีงานที่มอบหมาย</p>
            <p className="text-sm text-muted-foreground mt-1">ครูจะมอบหมายแบบฝึกหัดหรือข้อสอบให้ที่นี่</p>
          </div>
        ) : (
          <AssignmentList assignments={assignments} />
        )}
      </div>
    </div>
  )
}

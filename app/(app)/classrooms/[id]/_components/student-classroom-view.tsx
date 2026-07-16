import Link from 'next/link'
import { BookOpen, Clock, ChevronLeft, GraduationCap, Users, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ClassroomStream } from './classroom-stream'
import type { Classroom, ClassroomPost } from '@/lib/types'

export interface StudentAssignmentRow {
  id: string
  title: string
  question_ids: string[]
  end_at: string | null
  duration_minutes: number | null
  submission: { id: string; status: string; total_score: number | null; max_score: number } | null
}

interface Props {
  classroom: Classroom
  teacherName: string
  studentCount: number
  assignments: StudentAssignmentRow[]
  posts: ClassroomPost[]
}

function getDueInfo(endAt: string | null): { label: string; urgent: boolean; color: string } {
  if (!endAt) return { label: 'ไม่มีกำหนด', urgent: false, color: 'text-muted-foreground' }
  const diff = new Date(endAt).getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) return { label: 'เลยกำหนด', urgent: true, color: 'text-red-600 dark:text-red-400' }
  if (hours < 24) return { label: `อีก ${hours} ชม.`, urgent: true, color: 'text-orange-600 dark:text-orange-400' }
  if (days <= 2) return { label: `อีก ${days} วัน`, urgent: true, color: 'text-amber-600 dark:text-amber-400' }
  return {
    label: new Date(endAt).toLocaleDateString('th-TH', { dateStyle: 'short' }),
    urgent: false,
    color: 'text-muted-foreground',
  }
}

export function StudentClassroomView({ classroom, teacherName, studentCount, assignments, posts }: Props) {
  const doneCount = assignments.filter(
    a => a.submission?.status === 'submitted' || a.submission?.status === 'graded'
  ).length

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
            <BookOpen size={18} className="text-blue-600 dark:text-blue-400" />
            <span className="text-xl font-black">{assignments.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">ชุดข้อสอบทั้งหมด</p>
        </div>
        <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl">✅</span>
            <span className="text-xl font-black text-green-600 dark:text-green-400">{doneCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">ส่งงานแล้ว</p>
        </div>
      </div>

      {/* Assignments */}
      <div>
        <h2 className="font-semibold mb-3">ชุดข้อสอบในห้องนี้</h2>
        {assignments.length === 0 ? (
          <div className="bg-card border border-dashed rounded-2xl p-8 text-center">
            <p className="text-3xl mb-3">📝</p>
            <p className="font-semibold">ยังไม่มีชุดข้อสอบ</p>
            <p className="text-sm text-muted-foreground mt-1">ครูจะมอบหมายข้อสอบให้ที่นี่</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {assignments.map(a => (
              <StudentAssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StudentAssignmentCard({ assignment: a }: { assignment: StudentAssignmentRow }) {
  const due = getDueInfo(a.end_at)
  const questionCount = a.question_ids.length
  const isDone = a.submission?.status === 'submitted' || a.submission?.status === 'graded'
  const isInProgress = a.submission?.status === 'in_progress'

  return (
    <div className={cn(
      'bg-card border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all',
      due.urgent && !isDone ? 'border-orange-300 dark:border-orange-800' : ''
    )}>
      <div className="flex items-start gap-2">
        {due.urgent && !isDone && (
          <AlertCircle size={15} className="text-orange-500 shrink-0 mt-0.5" />
        )}
        <p className="font-semibold text-sm line-clamp-2 leading-snug flex-1">{a.title}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen size={11} />
          {questionCount} ข้อ
        </span>
        {a.duration_minutes && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {a.duration_minutes} นาที
          </span>
        )}
        {!isDone && (
          <span className={cn('flex items-center gap-1 ml-auto font-medium', due.color)}>
            <Clock size={11} />
            {due.label}
          </span>
        )}
      </div>

      {isDone ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">ส่งแล้ว ✓</span>
          {a.submission?.total_score != null && (
            <span className="text-lg font-bold">{a.submission.total_score}/{a.submission.max_score}</span>
          )}
        </div>
      ) : (
        <Link
          href={`/assignments/${a.id}/take`}
          className={cn(
            buttonVariants({ size: 'sm' }),
            'w-full justify-center gap-1 text-xs',
            isInProgress ? 'bg-amber-500 hover:bg-amber-600 text-white border-0' : ''
          )}
        >
          {isInProgress ? '▶ ทำต่อ' : '▶ เริ่มทำข้อสอบ'}
        </Link>
      )}
    </div>
  )
}

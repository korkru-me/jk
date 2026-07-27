'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, Clock, AlertCircle, CheckCircle2, XCircle, RotateCcw, Target, FileText, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { computePassed, formatPassingThreshold } from '@/lib/grading'
import { isCompleted, type StudentAssignmentRow } from './assignment-status'

export type { StudentAssignmentRow }

function getDueInfo(endAt: string | null): { label: string; urgent: boolean; color: string; bg: string } {
  if (!endAt) return { label: 'ไม่มีกำหนดส่ง', urgent: false, color: 'text-muted-foreground', bg: 'bg-muted/40' }
  const diff = new Date(endAt).getTime() - Date.now()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) return { label: 'เลยกำหนดส่งแล้ว', urgent: true, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' }
  if (hours < 24) return { label: `เหลือเวลาอีก ${hours} ชม. จะหมดเขตส่งงาน`, urgent: true, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30' }
  if (days <= 2) return { label: `เหลือเวลาอีก ${days} วัน จะหมดเขตส่งงาน`, urgent: true, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' }
  return {
    label: `กำหนดส่งภายใน ${new Date(endAt).toLocaleDateString('th-TH', { dateStyle: 'short' })}`,
    urgent: false,
    color: 'text-muted-foreground',
    bg: 'bg-muted/40',
  }
}

const TYPE_CFG: Record<string, { label: string; bg: string; text: string; icon: typeof FileText }> = {
  exam:     { label: 'ข้อสอบ',     bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-400',   icon: FileText },
  exercise: { label: 'แบบฝึกหัด', bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400', icon: Repeat },
}

type StatusFilterKey = 'all' | 'pending' | 'done'
type TypeFilterKey = 'all' | 'exam' | 'exercise'

export function AssignmentList({ assignments }: { assignments: StudentAssignmentRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all')

  const pending = assignments.filter(a => !isCompleted(a))
  const done = assignments.filter(isCompleted)
  const exams = assignments.filter(a => a.type === 'exam')
  const exercises = assignments.filter(a => a.type === 'exercise')

  const statusFilters: { key: StatusFilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', count: assignments.length },
    { key: 'pending', label: 'ต้องทำส่ง', count: pending.length },
    { key: 'done', label: 'ส่งแล้ว', count: done.length },
  ]

  const typeFilters: { key: TypeFilterKey; label: string; count: number; icon: typeof FileText }[] = [
    { key: 'all', label: 'ทุกประเภท', count: assignments.length, icon: BookOpen },
    { key: 'exam', label: 'ข้อสอบ', count: exams.length, icon: FileText },
    { key: 'exercise', label: 'แบบฝึกหัด', count: exercises.length, icon: Repeat },
  ]

  const byStatus = statusFilter === 'pending' ? pending : statusFilter === 'done' ? done : assignments
  const visible = typeFilter === 'all' ? byStatus : byStatus.filter(a => a.type === typeFilter)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {statusFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
              statusFilter === f.key ? 'bg-gray-900 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}
          >
            {f.label} <span className="opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {typeFilters.map(f => {
          const Icon = f.icon
          return (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                typeFilter === f.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-transparent text-muted-foreground border-border hover:bg-muted/50'
              )}
            >
              <Icon size={12} />
              {f.label} <span className="opacity-70">({f.count})</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="bg-card border border-dashed rounded-2xl p-8 text-center">
          <p className="text-3xl mb-3">{statusFilter === 'pending' && typeFilter === 'all' ? '🎉' : '📝'}</p>
          <p className="font-semibold">
            {statusFilter === 'pending' && typeFilter === 'all'
              ? 'ทำครบทุกงานแล้ว เยี่ยมมาก!'
              : statusFilter === 'done' && typeFilter === 'all'
              ? 'ยังไม่มีงานที่ส่งแล้ว'
              : 'ไม่มีงานในหมวดที่เลือก'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map(a => (
            <StudentAssignmentCard key={a.id} assignment={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function StudentAssignmentCard({ assignment: a }: { assignment: StudentAssignmentRow }) {
  const due = getDueInfo(a.end_at)
  const typeCfg = TYPE_CFG[a.type] ?? TYPE_CFG.exam
  const TypeIcon = typeCfg.icon
  const questionCount = a.question_ids.length
  // `a.submission` reflects the best/official-strategy attempt for score
  // display, which may not be the student's latest attempt — e.g. they
  // scored higher on attempt 1 but attempt 2 (a retry) is still in
  // progress. `has_in_progress` tracks that independently so an unfinished
  // retry is never hidden behind an older finished attempt's score.
  const isDone = a.submission?.status === 'submitted' || a.submission?.status === 'graded'
  const isInProgress = a.has_in_progress

  const passed = isDone
    ? computePassed(a.submission?.total_score ?? null, a.submission?.max_score ?? 0, a.passing_type, a.passing_value)
    : null
  const attemptsRemaining = a.max_attempts == null || a.attempts_used < a.max_attempts
  const canRetry = !isInProgress && isDone && attemptsRemaining
  const passingThreshold = formatPassingThreshold(a.passing_type, a.passing_value)

  return (
    <div className={cn(
      'bg-card border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all',
      due.urgent && !isDone ? 'border-orange-300 dark:border-orange-800' : ''
    )}>
      <div className="flex items-start gap-2">
        {due.urgent && !isDone && (
          <AlertCircle size={15} className="text-orange-500 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-1', typeCfg.bg, typeCfg.text)}>
            <TypeIcon size={10} />
            {typeCfg.label}
          </span>
          <p className="font-semibold text-sm line-clamp-2 leading-snug">{a.title}</p>
        </div>
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
        {passingThreshold && !isDone && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
            <Target size={11} />
            เกณฑ์ผ่าน {passingThreshold}
          </span>
        )}
        {a.max_attempts != null && (
          <span className="flex items-center gap-1">
            <Repeat size={11} />
            ทำไปแล้ว {a.attempts_used}/{a.max_attempts} ครั้ง
          </span>
        )}
      </div>

      {!isDone && !isInProgress && (
        <div className={cn('flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5', due.bg, due.color)}>
          <Clock size={12} />
          {due.label}
        </div>
      )}

      {isInProgress ? (
        <div className="flex flex-col gap-2">
          {isDone && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">คะแนนครั้งก่อนหน้า</span>
              {a.submission?.total_score != null && (
                <span className="text-sm font-bold">{a.submission.total_score}/{a.submission.max_score}</span>
              )}
            </div>
          )}
          <Link
            href={`/assignments/${a.id}/take`}
            className={cn(buttonVariants({ size: 'sm' }), 'w-full justify-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0')}
          >
            ▶ ทำต่อ
          </Link>
        </div>
      ) : canRetry ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={cn(
              'text-xs font-medium flex items-center gap-1',
              passed === false ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            )}>
              {passed === false ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
              {passed === false ? 'ยังไม่ผ่านเกณฑ์' : passed === true ? 'ผ่านเกณฑ์' : 'ส่งแล้ว ✓'}
            </span>
            {a.submission?.total_score != null && (
              <span className="text-lg font-bold">{a.submission.total_score}/{a.submission.max_score}</span>
            )}
          </div>
          {passed === false && passingThreshold && (
            <p className="text-[11px] text-muted-foreground -mt-1">ต้องได้ {passingThreshold} ขึ้นไปจึงจะผ่าน</p>
          )}
          <Link
            href={`/assignments/${a.id}/take`}
            className={cn(buttonVariants({ size: 'sm' }), 'w-full justify-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0')}
          >
            <RotateCcw size={12} />
            ลองใหม่{a.max_attempts != null && ` (เหลือ ${a.max_attempts - a.attempts_used} ครั้ง)`}
          </Link>
        </div>
      ) : isDone ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className={cn(
              'text-xs font-medium flex items-center gap-1',
              passed === false ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            )}>
              {passed === false ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
              {passed === null ? 'ส่งแล้ว ✓' : passed ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'}
            </span>
            {a.submission?.total_score != null && (
              <span className="text-lg font-bold">{a.submission.total_score}/{a.submission.max_score}</span>
            )}
          </div>
          {passed === false && passingThreshold && (
            <p className="text-[11px] text-muted-foreground">เกณฑ์ผ่าน: ต้องได้ {passingThreshold} ขึ้นไป</p>
          )}
        </div>
      ) : (
        <Link
          href={`/assignments/${a.id}/take`}
          className={cn(buttonVariants({ size: 'sm' }), 'w-full justify-center gap-1 text-xs')}
        >
          ▶ เริ่มทำข้อสอบ
        </Link>
      )}
    </div>
  )
}

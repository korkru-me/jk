'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Clock, MoreVertical, Copy, BarChart3, Monitor, Printer, Pencil, RefreshCw, Target, Users, CheckCircle2 } from 'lucide-react'
import { TYPE_CFG } from '@/lib/assignment-display'
import { toast } from 'sonner'
import { duplicateAssignment } from '@/lib/actions/assignments'
import { SCORE_STRATEGY_LABELS, selectOfficialAttempt } from '@/lib/scoring'
import { formatPassingThreshold, computePassed } from '@/lib/grading'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ClassroomAssignmentRow {
  id: string
  title: string
  type: string
  mode: string
  status: string
  start_at: string | null
  end_at: string | null
  question_ids: string[]
  created_at: string
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  max_attempts: number | null
  score_strategy: 'best' | 'average' | 'latest'
  display_order?: number | null
}

export interface ClassroomAssignmentSubmissionRow {
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  attempt_number: number
}

type TypeFilter = 'all' | 'exercise' | 'exam'

// Per-assignment completion snapshot across the whole classroom roster —
// `attempted` counts any student with a submission row (even in_progress),
// `completed`/`passed` only look at each student's official attempt (per
// score_strategy) once it's actually submitted/graded.
function computeAssignmentStats(
  assignment: ClassroomAssignmentRow,
  submissions: ClassroomAssignmentSubmissionRow[]
): { attempted: number; completed: number; passed: number } {
  const byStudent = new Map<string, ClassroomAssignmentSubmissionRow[]>()
  for (const s of submissions) {
    if (s.assignment_id !== assignment.id) continue
    const arr = byStudent.get(s.student_id) ?? []
    arr.push(s)
    byStudent.set(s.student_id, arr)
  }

  let completed = 0
  let passed = 0
  for (const attempts of byStudent.values()) {
    const official = selectOfficialAttempt(attempts, assignment.score_strategy)
    if (!official) continue
    const isSubmitted = official.representative.status === 'submitted' || official.representative.status === 'graded'
    if (!isSubmitted) continue
    const isPassed = computePassed(official.total_score, official.max_score, assignment.passing_type, assignment.passing_value)
    if (isPassed !== false) completed++
    if (isPassed === true) passed++
  }

  return { attempted: byStudent.size, completed, passed }
}

const STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  draft:     { label: 'ฉบับร่าง',    bg: 'bg-muted',    text: 'text-muted-foreground' },
  published: { label: 'เผยแพร่แล้ว', bg: 'bg-success/10',  text: 'text-success' },
  closed:    { label: 'ปิดแล้ว',     bg: 'bg-destructive/10',       text: 'text-destructive' },
}

interface Props {
  classroomId: string
  assignments: ClassroomAssignmentRow[]
  submissions: ClassroomAssignmentSubmissionRow[]
  studentCount: number
  onViewScores?: () => void
}

export function ClassroomAssignmentsTab({ classroomId, assignments, submissions, studentCount, onViewScores }: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [isPending, startTransition] = useTransition()

  const filtered = assignments.filter(a => typeFilter === 'all' ? true : a.type === typeFilter)

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateAssignment(id, { targetClassroomIds: [classroomId] })
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-3">
      {/* Filter chips + create button */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'all', label: 'ทั้งหมด' },
          { key: 'exercise', label: 'แบบฝึกหัด' },
          { key: 'exam', label: 'ข้อสอบ' },
        ] as { key: TypeFilter; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              typeFilter === f.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {f.label}
          </button>
        ))}
        <Link
          href={`/assignments/new?classroom=${classroomId}`}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> มอบหมายงานใหม่
        </Link>
      </div>

      {/* List */}
      <Card edge="ring" className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {assignments.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้ห้องนี้' : 'ไม่พบงานที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(a => {
              const statusCfg = STATUS_CFG[a.status] ?? STATUS_CFG.draft
              const typeCfg = TYPE_CFG[a.type] ?? TYPE_CFG.exam
              const TypeIcon = typeCfg.icon
              const passingThreshold = formatPassingThreshold(a.passing_type, a.passing_value)
              const stats = computeAssignmentStats(a, submissions)
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <Link href={`/assignments/${a.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeCfg.bg}`}>
                      <TypeIcon className={`w-4 h-4 ${typeCfg.text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-xs text-muted-foreground">{a.question_ids.length} ข้อ</span>
                        {a.max_attempts != null && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <RefreshCw className="w-3 h-3" /> ทำได้ {a.max_attempts} ครั้ง
                          </span>
                        )}
                        {passingThreshold && (
                          <span className="flex items-center gap-0.5 text-xs text-warning">
                            <Target className="w-3 h-3" /> เกณฑ์ผ่าน {passingThreshold}
                          </span>
                        )}
                        {a.max_attempts !== 1 && (
                          <span className="text-xs text-muted-foreground">
                            · เก็บ{SCORE_STRATEGY_LABELS[a.score_strategy]}
                          </span>
                        )}
                        {a.mode === 'online' ? (
                          <Monitor className="w-3 h-3 text-muted-foreground/40" />
                        ) : (
                          <Printer className="w-3 h-3 text-muted-foreground/40" />
                        )}
                        {a.end_at && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" /> {new Date(a.end_at).toLocaleDateString('th-TH')}
                          </span>
                        )}
                        {a.status !== 'draft' && (
                          a.type === 'exercise' ? (
                            <span className="flex items-center gap-0.5 text-xs text-success">
                              <CheckCircle2 className="w-3 h-3" /> ทำเสร็จ {stats.completed}/{studentCount} คน
                            </span>
                          ) : (
                            <>
                              <span className="flex items-center gap-0.5 text-xs text-primary">
                                <Users className="w-3 h-3" /> เข้าทำ {stats.attempted}/{studentCount} คน
                              </span>
                              {passingThreshold && (
                                <span className="flex items-center gap-0.5 text-xs text-success">
                                  <CheckCircle2 className="w-3 h-3" /> ผ่าน {stats.passed}/{studentCount} คน
                                </span>
                              )}
                            </>
                          )
                        )}
                      </div>
                    </div>
                  </Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${typeCfg.bg} ${typeCfg.text}`}>
                    {typeCfg.label}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCfg.bg} ${statusCfg.text}`}>
                    {statusCfg.label}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-muted-foreground transition-colors outline-none shrink-0">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem render={<Link href={`/assignments/${a.id}/edit`} />}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> แก้ไขรายละเอียด
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(a.id)} disabled={isPending}>
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" /> ทำสำเนามาห้องนี้
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onViewScores?.()}>
                        <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" /> ดูคะแนน
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

'use client'

import { WorkTypeBadge } from '@/components/assignments/work-type'
import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Users, FileText, Timer, Clock, CheckCircle2, TrendingUp,
  AlertCircle, Activity, LockKeyhole, Smartphone,
  ClipboardCheck, ChevronDown, ChevronRight, ChevronUp, Globe, Settings2,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { updateAssignmentStatus, deleteAssignment } from '@/lib/actions/assignments'
import type { Assignment, Question } from '@/lib/types'
import type { SubmissionRow } from '../page'
import { Card } from '@/components/ui/card'
import { parseSections } from '@/lib/question-set-sections'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { cn } from '@/lib/utils'
import { ClassroomWorkHeader } from '@/components/assignments/classroom-work-header'
import { AssignmentQuestionCards } from '@/components/assignments/assignment-question-cards'
import { AssignmentContextNavigation } from './assignment-context-sidebar'

const STATUS_META = {
  draft:     { label: 'ร่าง',         color: 'bg-muted text-muted-foreground',   dot: 'bg-muted-foreground' },
  published: { label: 'เผยแพร่แล้ว',  color: 'bg-success/10 text-success', dot: 'bg-success' },
  closed:    { label: 'ปิดแล้ว',      color: 'bg-background/80 text-destructive',     dot: 'bg-destructive' },
} as const

interface Props {
  assignment: Assignment & { classrooms: { name: string; description?: string | null } | null }
  questions: Question[]
  submissions: SubmissionRow[]
  /** Hand-ins with at least one ข้อ still waiting for a teacher to score it —
   *  ข้อเขียน, ช่องเติมคำที่ครูตรวจเอง, เหตุผลของถูก/ผิด, and the like. */
  pendingSubmissionIds: string[]
  /** The lookup stops at a row cap — true means the count is a floor. */
  pendingReviewCapped: boolean
}

export function AssignmentDetailClient({
  assignment: a, questions, submissions, pendingSubmissionIds, pendingReviewCapped,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()

  const statusMeta = STATUS_META[a.status]
  const assignmentTypeLabel = a.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'
  const settingsLabel = `ตั้งค่า${assignmentTypeLabel}`
  const pendingIdSet = new Set(pendingSubmissionIds)
  // Counted as hand-ins, not students — the same unit the classroom overview
  // and the "งานที่มอบหมาย" list use, so the three screens never disagree.
  // A retry counts on its own because grading it can change which attempt
  // wins under a "best" score strategy.
  const pendingCount = pendingSubmissionIds.length
  const gradeHref = pendingCount > 0
    ? `/assignments/${a.id}/results?pending=1`
    : `/assignments/${a.id}/results`
  const submittedSubs = submissions.filter(s => s.status === 'submitted' || s.status === 'graded')
  const inProgressSubs = submissions.filter(s => s.status === 'in_progress')
  const avgScore = submittedSubs.length > 0
    ? Math.round(submittedSubs.reduce((sum, s) => sum + (s.total_score ?? 0) / (s.max_score || 1) * 100, 0) / submittedSubs.length)
    : null
  const uniqueQuestionCount = new Set(a.question_ids).size
  const missingQuestionCount = Math.max(0, uniqueQuestionCount - questions.length)
  const duplicateQuestionCount = Math.max(0, a.question_ids.length - uniqueQuestionCount)
  const completionLabel = a.completion_rule === 'streak'
    ? [
        `ถูกติดต่อกัน ${a.streak_target} ข้อ`,
        ...(a.streak_question_cap != null ? [`หยุดเมื่อทำครบ ${a.streak_question_cap} ข้อ`] : []),
        a.streak_recycle_pool === false ? 'ครบคลังแล้วจบ' : 'ครบคลังแล้ววนใหม่',
      ].join(' · ')
    : a.passing_type != null && a.passing_value != null
      ? `ผ่านเมื่อได้ ${a.passing_type === 'percent' ? `${a.passing_value}%` : `${a.passing_value} คะแนน`}`
      : 'ทำครบแล้วจบ'
  const assignmentDetails = [
    {
      label: 'ขนาดงาน',
      value: assignmentSizeLabel(a),
      icon: FileText,
    },
    {
      label: 'เวลาทำ',
      value: a.duration_minutes ? `${a.duration_minutes} นาที` : 'ไม่จำกัด',
      icon: Timer,
    },
    {
      label: 'เปิดรับ',
      value: a.start_at
        ? new Date(a.start_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
        : 'ทันทีเมื่อเผยแพร่',
      icon: Clock,
    },
    {
      label: 'ปิดรับ',
      value: a.end_at
        ? new Date(a.end_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
        : 'ไม่กำหนด',
      icon: Clock,
    },
    {
      label: 'เงื่อนไขจบ',
      value: completionLabel,
      icon: CheckCircle2,
      wide: true,
    },
  ]

  const publish = useCallback(() => {
    startTransition(async () => {
      const res = await updateAssignmentStatus(a.id, 'published')
      if (res?.error) toast.error(res.error)
      else {
        toast.success(a.status === 'closed'
          ? `เปิด${assignmentTypeLabel}ให้ทำอีกครั้งแล้ว`
          : `เผยแพร่${assignmentTypeLabel}แล้ว`)
        router.refresh()
      }
    })
  }, [a.id, a.status, assignmentTypeLabel, router])

  const close = useCallback(() => {
    startTransition(async () => {
      const res = await updateAssignmentStatus(a.id, 'closed')
      if (res?.error) toast.error(res.error)
      else { toast.success(`ปิด${assignmentTypeLabel}แล้ว`); router.refresh() }
    })
  }, [a.id, assignmentTypeLabel, router])

  const handleDelete = useCallback(async () => {
    const ok = await confirm({
      title: `ลบ${assignmentTypeLabel}นี้?`,
      description: `ข้อมูลการทำและการส่งทั้งหมดของ${assignmentTypeLabel}นี้จะถูกลบถาวร กู้คืนไม่ได้`,
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => { await deleteAssignment(a.id) })
  }, [a.id, assignmentTypeLabel, confirm])

  const renderContextualSidebar = useCallback((onNavigate?: () => void) => (
    <AssignmentContextNavigation
      assignment={a}
      pendingCount={pendingCount}
      pendingReviewCapped={pendingReviewCapped}
      gradeHref={gradeHref}
      availableQuestionCount={questions.length}
      missingQuestionCount={missingQuestionCount}
      duplicateQuestionCount={duplicateQuestionCount}
      isPending={isPending}
      onPublish={publish}
      onCloseExam={close}
      onDelete={handleDelete}
      onClose={onNavigate}
    />
  ), [a, close, duplicateQuestionCount, gradeHref, handleDelete, isPending, missingQuestionCount, pendingCount, pendingReviewCapped, publish, questions.length])

  useContextualSidebar(`/assignments/${a.id}`, renderContextualSidebar)

  return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      <ClassroomWorkHeader
        kind="assignment"
        title={a.title}
        classroom={a.classrooms}
        badges={<>
          <Badge variant="secondary" className={statusMeta.color}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${statusMeta.dot}`} />{statusMeta.label}
          </Badge>
          <WorkTypeBadge type={a.type} />
          {a.secure_browser_mode === 'seb_required' && <Badge variant="outline" className="border-success/40 bg-success/10 text-success"><LockKeyhole /> Safe Exam Browser</Badge>}
          {a.android_exam_mode === 'monitored' && <Badge variant="warning"><Smartphone /> Android ครูอนุมัติรายคน</Badge>}
        </>}
        actions={<Button size="sm" variant="outline" render={<Link href={`/assignments/${a.id}/edit`} />} className="shrink-0 bg-background/70">
          <Settings2 data-icon="inline-start" /> {settingsLabel}
        </Button>}
        details={assignmentDetails}
        summary={a.status !== 'draft' && <AssignmentSubmissionSummary submittedCount={submittedSubs.length} inProgressCount={inProgressSubs.length} totalSubs={submissions.length} avgScore={avgScore} />}
      />

      {a.status === 'draft' && a.secure_browser_mode === 'seb_required' && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">ตรวจความพร้อม SEB ก่อนเผยแพร่</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                ระบบจะปฏิเสธการเผยแพร่ หากรหัสออกและไฟล์ SEB เฉพาะข้อสอบยังไม่ตรง revision หรือยังตรวจ exact build ไม่ครบ
              </p>
            </div>
          </div>
          <Link href={`/assignments/${a.id}/edit`} className="shrink-0 font-medium text-primary hover:underline">
            ดูสถานะการตั้งค่า
          </Link>
        </div>
      )}

      <OverviewTab
        a={a}
        questions={questions}
        totalSubs={submissions.length}
        pendingCount={pendingCount}
        pendingReviewCapped={pendingReviewCapped}
        gradeHref={gradeHref}
      />

      <AssignmentQuestionCards
        questions={questions}
        sections={parseSections(a.sections)}
        showSections={a.show_sections !== false}
      />

      <StudentsTab submissions={submissions} pendingIdSet={pendingIdSet} />
      {confirmDialog}
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function AssignmentSubmissionSummary({ submittedCount, inProgressCount, totalSubs, avgScore }: {
  submittedCount: number
  inProgressCount: number
  totalSubs: number
  avgScore: number | null
}) {
  const stats = [
    { label: 'ส่งแล้ว', value: submittedCount, icon: CheckCircle2, color: 'text-success' },
    { label: 'กำลังทำ', value: inProgressCount, icon: Activity, color: 'text-warning' },
    { label: 'คะแนนเฉลี่ย', value: avgScore !== null ? `${avgScore}%` : '—', icon: TrendingUp, color: 'text-current' },
  ]
  const progressValue = totalSubs > 0 ? (submittedCount / totalSubs) * 100 : 0

  return (
    <div data-assignment-overview className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-2">
      {stats.map(stat => {
        const Icon = stat.icon
        return <p key={stat.label} className="flex items-center gap-1.5 text-xs">
          <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', stat.color)} />
          <span className="font-bold tabular-nums">{stat.value}</span><span className="text-foreground/70">{stat.label}</span>
        </p>
      })}
      <Progress value={progressValue} className="w-40 max-w-full gap-x-2 gap-y-1 [&_[data-slot=progress-track]]:order-2 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-background/80 [&_[data-slot=progress-indicator]]:bg-success">
        <ProgressLabel className="text-xs text-foreground/70">การส่ง</ProgressLabel>
        <span className="ml-auto text-xs tabular-nums">{submittedCount}/{totalSubs} คน</span>
      </Progress>
    </div>
  )
}

function DraftOverview({ a, questions, totalStudents }: {
  a: Assignment & { classrooms: { name: string } | null }
  questions: Question[]
  totalStudents: number
}) {
  const uniqueQuestionCount = new Set(a.question_ids).size
  const missingQuestionCount = Math.max(0, uniqueQuestionCount - questions.length)
  const duplicateQuestionCount = Math.max(0, a.question_ids.length - uniqueQuestionCount)
  const questionsReady = uniqueQuestionCount > 0 && missingQuestionCount === 0 && duplicateQuestionCount === 0
  const accessLabel = a.secure_browser_mode === 'seb_required'
    ? a.android_exam_mode === 'monitored'
      ? 'Safe Exam Browser · Android ครูอนุมัติรายคน'
      : 'Safe Exam Browser'
    : 'เว็บเบราว์เซอร์'
  const preparationItems = [
    {
      label: 'โจทย์ในงาน',
      detail: a.question_ids.length === 0
        ? 'ยังไม่มีโจทย์ในงาน'
        : missingQuestionCount > 0
          ? `${assignmentSizeLabel(a)} · เปิดไม่ได้ ${missingQuestionCount} ข้อ`
          : duplicateQuestionCount > 0
            ? `${assignmentSizeLabel(a)} · มีรายการซ้ำ ${duplicateQuestionCount} รายการ`
          : assignmentSizeLabel(a),
      icon: questionsReady ? CheckCircle2 : AlertCircle,
      tone: questionsReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
    },
    {
      label: 'ผู้เรียนที่จะได้รับงาน',
      detail: totalStudents > 0 ? `${totalStudents} คน` : 'ยังไม่มีนักเรียนในห้องที่มอบหมาย',
      icon: totalStudents > 0 ? Users : AlertCircle,
      tone: totalStudents > 0 ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning',
    },
    {
      label: 'วิธีเข้าใช้งาน',
      detail: accessLabel,
      icon: a.secure_browser_mode === 'seb_required' ? LockKeyhole : Globe,
      tone: 'bg-primary/10 text-primary',
    },
  ]

  return (
    <Card edge="border" padding="lg" className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-foreground">ตรวจความพร้อมก่อนเผยแพร่</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          สรุปข้อมูลสำคัญที่นักเรียนจะได้รับเมื่อเผยแพร่งานนี้
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {preparationItems.map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', item.tone)}>
                <Icon aria-hidden="true" className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function OverviewTab({ a, questions, totalSubs, pendingCount, pendingReviewCapped, gradeHref }: {
  a: Assignment & { classrooms: { name: string } | null }
  questions: Question[]
  totalSubs: number
  pendingCount: number
  pendingReviewCapped: boolean
  gradeHref: string
}) {
  if (a.status === 'draft') {
    return <DraftOverview a={a} questions={questions} totalStudents={totalSubs} />
  }

  if (pendingCount === 0) return null

  // งานที่ระบบตรวจเองไม่ได้ — ข้อเขียน ช่องเติมคำที่ครูตรวจเอง เหตุผลของ
  // ถูก/ผิด — ค้างอยู่จนกว่าครูจะกรอกคะแนน คะแนนรวมของนักเรียนจึงยัง
  // ไม่นิ่ง ปุ่มนี้พาไปที่หน้ากรอกคะแนนโดยตรง
  return (
    <Link
      href={gradeHref}
      className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3.5 transition-colors hover:bg-warning/15"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
        <ClipboardCheck className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          มี {pendingCount}{pendingReviewCapped ? '+' : ''} ชิ้นที่ระบบตรวจให้ไม่ได้ รอครูกรอกคะแนนเอง
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          คะแนนรวมของนักเรียนจะยังไม่ครบจนกว่าจะกรอกคะแนนข้อเหล่านี้
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-warning">
        ตรวจให้คะแนน <ChevronRight className="size-3.5" />
      </span>
    </Link>
  )
}

// ─── Collapsible student table ────────────────────────────────────────────────

function StudentsTab({ submissions, pendingIdSet }: { submissions: SubmissionRow[]; pendingIdSet: Set<string> }) {
  const [open, setOpen] = useState(true)
  const [sort, setSort] = useState<'name' | 'score' | 'time'>('time')

  const sorted = [...submissions].sort((a, b) => {
    if (sort === 'score') return (b.total_score ?? -1) - (a.total_score ?? -1)
    if (sort === 'name') return (a.users?.full_name ?? '').localeCompare(b.users?.full_name ?? '', 'th')
    return new Date(b.submitted_at ?? b.started_at).getTime() - new Date(a.submitted_at ?? a.started_at).getTime()
  })
  const submittedCount = submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card edge="ring" className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">นักเรียน</h2>
              <p className="text-xs text-muted-foreground">
                ส่งแล้ว {submittedCount} / {submissions.length} คน · กดชื่อเพื่อดูคำตอบและกรอกคะแนน
              </p>
            </div>
          </div>
          <CollapsibleTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'group self-start sm:self-auto')}>
            {open ? 'พับตาราง' : 'แสดงตาราง'}
            {open
              ? <ChevronUp data-icon="inline-end" />
              : <ChevronDown data-icon="inline-end" />}
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="text-xs text-muted-foreground">เรียงรายชื่อนักเรียนตาม</p>
            <ToggleGroup
              value={[sort]}
              onValueChange={values => {
                const next = values.at(-1)
                if (next === 'time' || next === 'score' || next === 'name') setSort(next)
              }}
              aria-label="เรียงรายชื่อนักเรียน"
              size="sm"
              spacing={1}
              className="rounded-lg bg-muted p-1"
            >
              <ToggleGroupItem value="time">ล่าสุด</ToggleGroupItem>
              <ToggleGroupItem value="score">คะแนน</ToggleGroupItem>
              <ToggleGroupItem value="name">ชื่อ</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Table className="min-w-[720px]">
            <TableCaption className="sr-only">รายชื่อนักเรียนและสถานะการส่งงาน</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อนักเรียน</TableHead>
                <TableHead className="w-28">สถานะ</TableHead>
                <TableHead className="w-32 text-right">คะแนน</TableHead>
                <TableHead className="w-40 text-right">เวลาส่ง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-28 text-center text-muted-foreground">
                    ยังไม่มีนักเรียนในงานนี้
                  </TableCell>
                </TableRow>
              ) : sorted.map(submission => {
                const isDone = submission.status === 'submitted' || submission.status === 'graded'
                const percentage = submission.total_score != null && submission.max_score > 0
                  ? Math.round((submission.total_score / submission.max_score) * 100)
                  : null
                // A row only opens when there is an attempt to read; a student
                // who has not started has nothing to score yet.
                const isPendingReview = submission.id != null && pendingIdSet.has(submission.id)
                return (
                  <TableRow key={submission.id ?? submission.student_id}>
                    <TableCell className="min-w-64 whitespace-normal py-3">
                      {submission.id ? (
                        <Link
                          href={`/submissions/${submission.id}`}
                          className="flex items-center gap-2 font-medium text-foreground hover:text-primary hover:underline"
                        >
                          <span>{submission.users?.full_name ?? '—'}</span>
                          {isPendingReview && (
                            <Badge variant="warning">
                              <ClipboardCheck data-icon="inline-start" /> รอตรวจ
                            </Badge>
                          )}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{submission.users?.full_name ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          isDone && 'bg-success/10 text-success',
                          submission.status === 'in_progress' && 'bg-warning/10 text-warning',
                        )}
                      >
                        {isDone ? 'ส่งแล้ว' : submission.status === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ทำ'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {submission.total_score != null ? (
                        <div className="ml-auto w-24">
                          <span className="font-bold text-foreground">{submission.total_score}/{submission.max_score}</span>
                          {percentage !== null && (
                            <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  percentage >= 70 ? 'bg-success' : percentage >= 50 ? 'bg-warning' : 'bg-destructive',
                                )}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {submission.submitted_at
                        ? new Date(submission.submitted_at).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' })
                        : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

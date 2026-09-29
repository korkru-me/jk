'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Users, FileText, Timer, Clock, CheckCircle2, TrendingUp,
  AlertCircle, Activity, Pencil, LockKeyhole, Smartphone,
  ClipboardCheck, ChevronDown, ChevronRight, ChevronUp, Globe,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { updateAssignmentStatus, deleteAssignment } from '@/lib/actions/assignments'
import { DIFF_META, TYPE_SHORT } from '@/lib/question-display'
import type { Assignment, Question } from '@/lib/types'
import type { SubmissionRow } from '../page'
import { Card } from '@/components/ui/card'
import { questionExcerpt } from '@/lib/question-display'
import { sectionByQuestionId, parseSections, type QuestionSetSection } from '@/lib/question-set-sections'
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
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { cn } from '@/lib/utils'
import { AssignmentContextNavigation } from './assignment-context-sidebar'

const STATUS_META = {
  draft:     { label: 'ร่าง',         color: 'bg-muted text-muted-foreground',   dot: 'bg-muted-foreground' },
  published: { label: 'เผยแพร่แล้ว',  color: 'bg-success/10 text-success', dot: 'bg-success' },
  closed:    { label: 'ปิดแล้ว',      color: 'bg-destructive/10 text-destructive',     dot: 'bg-destructive' },
} as const

interface Props {
  assignment: Assignment & { classrooms: { name: string } | null }
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
      studentCount={submissions.length}
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
  ), [a, close, duplicateQuestionCount, gradeHref, handleDelete, isPending, missingQuestionCount, pendingCount, pendingReviewCapped, publish, questions.length, submissions.length])

  useContextualSidebar(`/assignments/${a.id}`, renderContextualSidebar)

  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      {/* Header card */}
      <Card edge="border" padding="lg" className="border-primary/20 bg-primary/10 text-foreground">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={statusMeta.color}>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${statusMeta.dot}`} />
              {statusMeta.label}
            </Badge>
            <Badge variant="outline">{assignmentTypeLabel}</Badge>
            {a.secure_browser_mode === 'seb_required' && (
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                <LockKeyhole /> Safe Exam Browser
              </Badge>
            )}
            {a.android_exam_mode === 'monitored' && (
              <Badge variant="warning">
                <Smartphone /> Android ครูอนุมัติรายคน
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{a.title}</h1>
          {a.classrooms?.name && <p className="mt-1 text-sm text-muted-foreground">ห้องหลัก · {a.classrooms.name}</p>}
          {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
        </div>

        <Separator className="my-4 bg-primary/20" />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {assignmentDetails.map(detail => {
            const Icon = detail.icon
            return (
              <div
                key={detail.label}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl bg-background/60 p-3',
                  detail.wide && 'sm:col-span-2 lg:col-span-4',
                )}
              >
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{detail.label}</p>
                  <p className="mt-0.5 text-sm font-medium leading-5 text-foreground">{detail.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

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
        submittedCount={submittedSubs.length}
        inProgressCount={inProgressSubs.length}
        totalSubs={submissions.length}
        avgScore={avgScore}
        pendingCount={pendingCount}
        pendingReviewCapped={pendingReviewCapped}
        gradeHref={gradeHref}
      />

      <QuestionsTab
        assignmentId={a.id}
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

function OverviewTab({ a, questions, submittedCount, inProgressCount, totalSubs, avgScore, pendingCount, pendingReviewCapped, gradeHref }: {
  a: Assignment & { classrooms: { name: string } | null }
  questions: Question[]
  submittedCount: number
  inProgressCount: number
  totalSubs: number
  avgScore: number | null
  pendingCount: number
  pendingReviewCapped: boolean
  gradeHref: string
}) {
  if (a.status === 'draft') {
    return <DraftOverview a={a} questions={questions} totalStudents={totalSubs} />
  }

  const stats = [
    { label: 'ส่งแล้ว',      value: submittedCount,  icon: CheckCircle2, color: 'bg-success/10 text-success' },
    { label: 'กำลังทำ',      value: inProgressCount, icon: Activity,     color: 'bg-warning/10 text-warning' },
    { label: 'คะแนนเฉลี่ย', value: avgScore !== null ? `${avgScore}%` : '—', icon: TrendingUp, color: 'bg-primary/10 text-primary' },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* งานที่ระบบตรวจเองไม่ได้ — ข้อเขียน ช่องเติมคำที่ครูตรวจเอง เหตุผลของ
          ถูก/ผิด — ค้างอยู่จนกว่าครูจะกรอกคะแนน คะแนนรวมของนักเรียนจึงยัง
          ไม่นิ่ง ปุ่มนี้พาไปที่หน้ากรอกคะแนนโดยตรง */}
      {pendingCount > 0 && (
        <Link
          href={gradeHref}
          className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3.5 transition-colors hover:bg-warning/15"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
            <ClipboardCheck className="h-4 w-4" />
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
            ตรวจให้คะแนน <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <Card edge="ring" padding="md" className="flex items-center gap-3" key={s.label}>
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', s.color)}>
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Progress bar */}
      {totalSubs > 0 && (
        <Card edge="ring" padding="lg">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-muted-foreground">ความคืบหน้าการส่ง</span>
            <span className="text-muted-foreground">{submittedCount} / {totalSubs} คน</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${totalSubs > 0 ? (submittedCount / totalSubs) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {inProgressCount > 0 && `${inProgressCount} คนกำลังทำอยู่`}
          </p>
        </Card>
      )}
    </div>
  )
}

// ─── Collapsible question table ───────────────────────────────────────────────

function QuestionsTab({ assignmentId, questions, sections, showSections }: {
  assignmentId: string
  questions: Question[]
  sections: QuestionSetSection[]
  showSections: boolean
}) {
  const [open, setOpen] = useState(true)
  // The teacher always sees the แฟ้มย่อย they grouped by, even when students
  // don't — with a note saying so, rather than the grouping vanishing.
  const sectionOwner = sectionByQuestionId(sections)
  const diffCounts = questions.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card edge="ring" className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">โจทย์</h2>
              <p className="text-xs text-muted-foreground">{questions.length} ข้อ · ตรวจรายการโจทย์ทั้งหมดในงานนี้</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:justify-end">
            <Button
              size="sm"
              variant="ghost"
              render={<Link href={`/assignments/${assignmentId}/edit`} />}
            >
              <Pencil data-icon="inline-start" /> แก้ไขโจทย์
            </Button>
            <CollapsibleTrigger
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'group')}
            >
              {open ? 'พับตาราง' : 'แสดงตาราง'}
              {open
                ? <ChevronUp data-icon="inline-end" />
                : <ChevronDown data-icon="inline-end" />}
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <Separator />
          {Object.keys(diffCounts).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {Object.entries(diffCounts).map(([difficulty, count]) => {
                const meta = DIFF_META[difficulty]
                return (
                  <Badge
                    key={difficulty}
                    variant="secondary"
                    className={meta?.badge ?? 'bg-muted text-muted-foreground'}
                  >
                    {meta?.label ?? difficulty} · {count} ข้อ
                  </Badge>
                )
              })}
            </div>
          )}

          <Table className="min-w-[760px]">
            <TableCaption className="sr-only">รายการโจทย์ทั้งหมดในงานนี้</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">ข้อ</TableHead>
                <TableHead>โจทย์</TableHead>
                <TableHead className="w-32">แฟ้มย่อย</TableHead>
                <TableHead className="w-28">ประเภท</TableHead>
                <TableHead className="w-28">ระดับ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                    ยังไม่มีโจทย์ที่เปิดดูได้
                  </TableCell>
                </TableRow>
              ) : questions.map((question, index) => {
                const difficulty = DIFF_META[question.difficulty]
                const section = sectionOwner.get(question.id)
                return (
                  <TableRow key={question.id}>
                    <TableCell className="text-center font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="min-w-80 whitespace-normal py-3">
                      <p className="font-medium text-foreground">{question.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {questionExcerpt(question.question_text) || 'ไม่มีคำอธิบายเพิ่มเติม'}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-40 whitespace-normal text-xs text-muted-foreground">
                      {section?.title ? (
                        <span>
                          {section.title}
                          {!showSections && <span className="block">ไม่แสดงให้นักเรียนเห็น</span>}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_SHORT[question.question_type] ?? question.question_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={difficulty?.badge ?? 'bg-muted text-muted-foreground'}
                      >
                        {difficulty?.label ?? question.difficulty}
                      </Badge>
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

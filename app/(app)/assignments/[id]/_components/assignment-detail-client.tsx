'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Users, FileText, Timer, Clock, CheckCircle2, TrendingUp,
  AlertCircle, Activity, Pencil, LockKeyhole, Smartphone,
  ClipboardCheck, ChevronRight, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateAssignmentStatus, deleteAssignment } from '@/lib/actions/assignments'
import { DIFF_META, TYPE_SHORT } from '@/lib/question-display'
import type { Assignment, Question } from '@/lib/types'
import type { SubmissionRow } from '../page'
import { Card } from '@/components/ui/card'
import { questionExcerpt } from '@/lib/question-display'
import { sectionByQuestionId, parseSections, type QuestionSetSection } from '@/lib/question-set-sections'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { cn } from '@/lib/utils'
import { AssignmentContextNavigation, type AssignmentDetailTab } from './assignment-context-sidebar'

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
  initialTab?: AssignmentDetailTab
}

export function AssignmentDetailClient({
  assignment: a, questions, submissions, pendingSubmissionIds, pendingReviewCapped, initialTab = 'overview',
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<AssignmentDetailTab>(initialTab)
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

  const handleTabChange = useCallback((tab: AssignmentDetailTab) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

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
      activeTab={activeTab}
      studentCount={submissions.length}
      pendingCount={pendingCount}
      pendingReviewCapped={pendingReviewCapped}
      gradeHref={gradeHref}
      availableQuestionCount={questions.length}
      missingQuestionCount={missingQuestionCount}
      duplicateQuestionCount={duplicateQuestionCount}
      isPending={isPending}
      onTabChange={handleTabChange}
      onPublish={publish}
      onCloseExam={close}
      onDelete={handleDelete}
      onClose={onNavigate}
    />
  ), [a, activeTab, close, duplicateQuestionCount, gradeHref, handleDelete, handleTabChange, isPending, missingQuestionCount, pendingCount, pendingReviewCapped, publish, questions.length, submissions.length])

  useContextualSidebar(`/assignments/${a.id}`, renderContextualSidebar)

  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      {/* Header card */}
      <Card edge="border" padding="lg" className="border-primary/20 bg-primary/10 text-foreground">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
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

            {/* Quick stats */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span className="font-semibold">{assignmentSizeLabel(a)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <span className="font-semibold">{a.status === 'draft' ? submissions.length : submittedSubs.length}</span>
                <span className="text-muted-foreground">{a.status === 'draft' ? 'นักเรียน' : 'ส่งแล้ว'}</span>
              </div>
              {a.duration_minutes && (
                <div className="flex items-center gap-2">
                  <Timer className="size-4 text-primary" />
                  <span className="font-semibold">{a.duration_minutes}</span>
                  <span className="text-muted-foreground">นาที</span>
                </div>
              )}
              {a.status !== 'draft' && avgScore !== null && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  <span className="font-semibold">{avgScore}%</span>
                  <span className="text-muted-foreground">เฉลี่ย</span>
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          {(a.start_at || a.end_at) && (
            <div className="shrink-0 sm:text-right">
              {a.start_at && (
                <div className="mb-1">
                  <p className="text-xs text-muted-foreground">เปิด</p>
                  <p className="text-sm font-medium">{new Date(a.start_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                </div>
              )}
              {a.end_at && (
                <div>
                  <p className="text-xs text-muted-foreground">ปิด</p>
                  <p className="text-sm font-medium">{new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                </div>
              )}
            </div>
          )}
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

      <div className="min-w-0">
        {activeTab === 'overview' && (
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
        )}
        {activeTab === 'questions' && (
          <QuestionsTab
            questions={questions}
            sections={parseSections(a.sections)}
            showSections={a.show_sections !== false}
          />
        )}
        {activeTab === 'students' && (
          <StudentsTab submissions={submissions} pendingIdSet={pendingIdSet} />
        )}
      </div>
      {confirmDialog}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function AssignmentInfoCard({ a }: {
  a: Assignment & { classrooms: { name: string } | null }
}) {
  const assignmentTypeLabel = a.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'
  const rows = [
    { label: 'ประเภท', value: assignmentTypeLabel },
    ...(a.classrooms?.name ? [{ label: 'ห้องหลัก', value: a.classrooms.name }] : []),
    { label: 'ขนาดงาน', value: assignmentSizeLabel(a) },
    { label: 'เวลาทำ', value: a.duration_minutes ? `${a.duration_minutes} นาที` : 'ไม่จำกัด' },
    { label: 'เปิดรับ', value: a.start_at ? new Date(a.start_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ทันทีเมื่อเผยแพร่' },
    { label: 'ปิดรับ', value: a.end_at ? new Date(a.end_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่กำหนด' },
    // The three endings are mutually exclusive — the database refuses a
    // streak งาน that also carries a score threshold — so this reads as one
    // row, not two that could both appear.
    ...(a.completion_rule === 'streak'
      ? [
          { label: 'เงื่อนไขจบ', value: `ถูกติดต่อกัน ${a.streak_target} ข้อ` },
          ...(a.streak_question_cap != null
            ? [{ label: 'หยุดอัตโนมัติ', value: `ทำครบ ${a.streak_question_cap} ข้อ` }]
            : []),
          { label: 'ทำครบคลังแล้ว', value: a.streak_recycle_pool === false ? 'จบเลย' : 'วนกลับมาใหม่' },
        ]
      : a.passing_type != null && a.passing_value != null
        ? [{ label: 'เกณฑ์ผ่าน', value: a.passing_type === 'percent' ? `${a.passing_value}%` : `${a.passing_value} คะแนน` }]
        : [{ label: 'เงื่อนไขจบ', value: 'ทำครบแล้วจบ' }]),
  ]

  return (
    <Card edge="ring" padding="lg" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">ข้อมูล{assignmentTypeLabel}</h3>
      <div className="divide-y divide-border">
        {rows.map(row => (
          <div key={row.label} className="flex items-start justify-between gap-6 py-2.5 text-sm">
            <span className="shrink-0 text-muted-foreground">{row.label}</span>
            <span className="text-right font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </Card>
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
  const openLabel = a.start_at
    ? `เปิด ${new Date(a.start_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'เปิดทันทีเมื่อเผยแพร่'
  const closeLabel = a.end_at
    ? `ปิด ${new Date(a.end_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'ไม่กำหนดวันปิด'
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
      label: 'ช่วงเวลารับงาน',
      detail: `${openLabel} · ${closeLabel}`,
      icon: Clock,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: 'วิธีเข้าใช้งาน',
      detail: accessLabel,
      icon: a.secure_browser_mode === 'seb_required' ? LockKeyhole : Globe,
      tone: 'bg-primary/10 text-primary',
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Card edge="border" padding="lg" className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold text-foreground">ตรวจความพร้อมก่อนเผยแพร่</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            สรุปข้อมูลสำคัญที่นักเรียนจะได้รับเมื่อเผยแพร่งานนี้
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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

      <Card edge="ring" className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">ตัวอย่างโจทย์</h3>
            <p className="mt-1 text-xs text-muted-foreground">ตรวจชื่อและเนื้อหาโดยย่อก่อนเผยแพร่</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            render={<Link href={`/assignments/${a.id}/edit`} />}
          >
            <Pencil data-icon="inline-start" /> แก้ไขโจทย์ทั้งหมด
          </Button>
        </div>
        {questions.length > 0 ? (
          <div className="divide-y divide-border">
            {questions.slice(0, 3).map((question, index) => (
              <div key={question.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{question.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {questionExcerpt(question.question_text) || 'ไม่มีคำอธิบายเพิ่มเติม'}
                  </p>
                </div>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {TYPE_SHORT[question.question_type] ?? question.question_type}
                </Badge>
              </div>
            ))}
            {questions.length > 3 && (
              <p className="px-5 py-3 text-center text-xs text-muted-foreground">
                และอีก {questions.length - 3} ข้อ — ดูทั้งหมดได้ที่เมนูโจทย์
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <FileText aria-hidden="true" className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">ยังไม่มีโจทย์ที่เปิดดูได้</p>
            <p className="text-xs text-muted-foreground">เพิ่มโจทย์หรือแก้รายการโจทย์ก่อนเผยแพร่</p>
          </div>
        )}
      </Card>

      <AssignmentInfoCard a={a} />
    </div>
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
    { label: 'ขนาดงาน',      value: assignmentSizeLabel(a), icon: FileText, color: 'bg-tint-1/10 text-tint-1', compact: true },
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <Card edge="ring" padding="md" className="flex items-center gap-3" key={s.label}>
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', s.color)}>
                <Icon className="size-4" />
              </div>
              <div>
                <p className={cn('font-bold text-foreground', s.compact ? 'text-base leading-snug' : 'text-2xl leading-none')}>{s.value}</p>
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

      <AssignmentInfoCard a={a} />
    </div>
  )
}

// ─── Questions Tab ────────────────────────────────────────────────────────────

function QuestionsTab({ questions, sections, showSections }: {
  questions: Question[]
  sections: QuestionSetSection[]
  showSections: boolean
}) {
  // The teacher always sees the แฟ้มย่อย they grouped by, even when students
  // don't — with a note saying so, rather than the grouping vanishing.
  const sectionOwner = sectionByQuestionId(sections)
  const diffCounts = questions.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1; return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Difficulty breakdown */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(diffCounts).map(([d, count]) => {
          const m = DIFF_META[d]
          return (
            <span key={d} className={`text-xs font-medium px-3 py-1.5 rounded-full ${m?.badge ?? 'bg-muted text-muted-foreground'}`}>
              {m?.label ?? d} · {count} ข้อ
            </span>
          )
        })}
        <span className="text-xs text-muted-foreground self-center ml-auto">{questions.length} ข้อรวม</span>
      </div>

      <Card edge="ring" className="overflow-hidden">
        {questions.map((q, i) => {
          const diff = DIFF_META[q.difficulty]
          const section = sectionOwner.get(q.id)
          const isSectionStart = !!section?.title && sectionOwner.get(questions[i - 1]?.id)?.id !== section.id
          return (
            <div key={q.id}>
            {isSectionStart && (
              <p className="flex items-center gap-2 px-5 py-2 bg-muted/60 text-xs font-semibold text-muted-foreground border-b border-border">
                {section!.title}
                {!showSections && (
                  <span className="font-normal">(ไม่แสดงให้นักเรียนเห็น)</span>
                )}
              </p>
            )}
            <div
              className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm text-muted-foreground font-medium w-7 shrink-0 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{questionExcerpt(q.question_text)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${diff?.badge ?? 'bg-muted text-muted-foreground'}`}>
                  {diff?.label ?? q.difficulty}
                </span>
                <span className="text-xs text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                  {TYPE_SHORT[q.question_type] ?? q.question_type}
                </span>
              </div>
            </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

// ─── Students Tab ─────────────────────────────────────────────────────────────

function StudentsTab({ submissions, pendingIdSet }: { submissions: SubmissionRow[]; pendingIdSet: Set<string> }) {
  const [sort, setSort] = useState<'name' | 'score' | 'time'>('time')

  const sorted = [...submissions].sort((a, b) => {
    if (sort === 'score') return (b.total_score ?? -1) - (a.total_score ?? -1)
    if (sort === 'name') return (a.users?.full_name ?? '').localeCompare(b.users?.full_name ?? '', 'th')
    return new Date(b.submitted_at ?? b.started_at).getTime() - new Date(a.submitted_at ?? a.started_at).getTime()
  })

  if (submissions.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
        <AlertCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">ยังไม่มีการส่ง</p>
        <p className="text-sm text-muted-foreground mt-1">เมื่อนักเรียนส่งงาน ข้อมูลจะปรากฏที่นี่</p>
      </div>
    )
  }

  const submittedCount = submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          ส่งแล้ว {submittedCount} / {submissions.length} คน · กดที่ชื่อเพื่อเปิดคำตอบและกรอกคะแนน
        </p>
        <div className="flex gap-1">
          {(['time', 'score', 'name'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                sort === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {s === 'time' ? 'ล่าสุด' : s === 'score' ? 'คะแนน' : 'ชื่อ'}
            </button>
          ))}
        </div>
      </div>

      <Card edge="ring" className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-xs font-medium text-muted-foreground px-5 py-2.5 border-b border-border">
          <span>ชื่อนักเรียน</span>
          <span className="text-right w-20">สถานะ</span>
          <span className="text-right w-24">คะแนน</span>
          <span className="text-right w-28">เวลาส่ง</span>
        </div>
        {sorted.map(s => {
          const isDone = s.status === 'submitted' || s.status === 'graded'
          const pct = s.total_score != null && s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : null
          // A row only opens when there is an attempt to read; a student who
          // has not started has nothing to score yet.
          const isPending = s.id != null && pendingIdSet.has(s.id)
          return (
            <div key={s.id ?? s.student_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-5 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
              {s.id ? (
                <Link href={`/submissions/${s.id}`} className="flex items-center gap-2 min-w-0 text-sm font-medium text-foreground hover:text-primary hover:underline">
                  <span className="truncate">{s.users?.full_name ?? '—'}</span>
                  {isPending && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning no-underline">
                      <ClipboardCheck className="h-3 w-3" /> รอตรวจ
                    </span>
                  )}
                </Link>
              ) : (
                <span className="text-sm font-medium text-foreground">{s.users?.full_name ?? '—'}</span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-20 text-center ${
                isDone ? 'bg-success/10 text-success' :
                s.status === 'in_progress' ? 'bg-warning/10 text-warning' :
                'bg-muted text-muted-foreground'
              }`}>
                {isDone ? 'ส่งแล้ว' : s.status === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ทำ'}
              </span>
              <div className="text-right w-24">
                {s.total_score != null ? (
                  <div>
                    <span className="text-sm font-bold text-foreground">{s.total_score}/{s.max_score}</span>
                    {pct !== null && (
                      <div className="h-1 bg-muted rounded-full mt-1 w-16 ml-auto">
                        <div
                          className={`h-full rounded-full ${pct >= 70 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground/40">—</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground text-right w-28">
                {s.submitted_at ? new Date(s.submitted_at).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' }) : '—'}
              </span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

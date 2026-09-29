'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, Users, FileText, Timer, Clock, CheckCircle2, BookOpen,
  Play, Square, BarChart2, Trash2, TrendingUp,
  AlertCircle, Activity, Copy, Pencil, Eye, Radio, LockKeyhole, Smartphone,
  FileClock, Presentation, ClipboardCheck, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { updateAssignmentStatus, deleteAssignment, duplicateAssignment } from '@/lib/actions/assignments'
import { DIFF_META, TYPE_SHORT } from '@/lib/question-display'
import type { Assignment, Question } from '@/lib/types'
import type { SubmissionRow } from '../page'
import { Card } from '@/components/ui/card'
import { questionExcerpt } from '@/lib/question-display'
import { sectionByQuestionId, parseSections, type QuestionSetSection } from '@/lib/question-set-sections'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { withBackHref } from '@/lib/back-link'

const STATUS_META = {
  draft:     { label: 'ร่าง',         color: 'bg-muted text-muted-foreground',   dot: 'bg-muted-foreground' },
  published: { label: 'เผยแพร่แล้ว',  color: 'bg-success/10 text-success', dot: 'bg-success' },
  closed:    { label: 'ปิดแล้ว',      color: 'bg-destructive/10 text-destructive',     dot: 'bg-destructive' },
} as const

const TABS: { key: string; label: string; icon: typeof Users }[] = [
  { key: 'overview',   label: 'ภาพรวม',   icon: Activity },
  { key: 'questions',  label: 'โจทย์',    icon: FileText },
  { key: 'students',   label: 'นักเรียน', icon: Users },
  { key: 'analytics',  label: 'วิเคราะห์', icon: BarChart2 },
]

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

function seedRand(str: string, i: number) {
  const h = [...str].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (i + 7) * 2654435761) >>> 0) % 100) / 100
}

export function AssignmentDetailClient({
  assignment: a, questions, submissions, pendingSubmissionIds, pendingReviewCapped,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()

  const statusMeta = STATUS_META[a.status]
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

  function publish() {
    startTransition(async () => {
      const res = await updateAssignmentStatus(a.id, 'published')
      if (res?.error) toast.error(res.error)
      else { toast.success('เผยแพร่ชุดข้อสอบแล้ว'); router.refresh() }
    })
  }

  function close() {
    startTransition(async () => {
      const res = await updateAssignmentStatus(a.id, 'closed')
      if (res?.error) toast.error(res.error)
      else { toast.success('ปิดชุดข้อสอบแล้ว'); router.refresh() }
    })
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'ลบชุดข้อสอบนี้?',
      description: 'ข้อมูลการสอบและการส่งทั้งหมดของชุดนี้จะถูกลบถาวร กู้คืนไม่ได้',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => { await deleteAssignment(a.id) })
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateAssignment(a.id)
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      {/* Back — returns to the classroom this was assigned from */}
      <Link
        href={`/classrooms/${a.classroom_id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> {a.classrooms?.name ?? 'กลับไปห้องเรียน'}
      </Link>

      {/* Header card */}
      <Card edge="border" padding="xl" className="border-primary/20 bg-primary/10 text-foreground">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusMeta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
              {a.secure_browser_mode === 'seb_required' && (
                <span className="flex items-center gap-1 text-xs text-success border border-success/40 bg-success/10 px-2.5 py-1 rounded-full">
                  <LockKeyhole className="w-3 h-3" /> Safe Exam Browser
                </span>
              )}
              {a.android_exam_mode === 'monitored' && (
                <span className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs text-warning">
                  <Smartphone className="h-3 w-3" /> Android ครูอนุมัติรายคน
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold leading-tight">{a.title}</h1>
            {a.classrooms?.name && <p className="mt-1 text-sm text-muted-foreground">{a.classrooms.name}</p>}
            {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}

            {/* Quick stats */}
            <div className="flex items-center gap-5 mt-4 text-sm">
              <div className="flex items-center gap-2" title={a.random_question_count ? `สุ่มจากคลัง ${a.question_ids.length} ข้อ` : undefined}>
                <FileText className="size-4 text-primary" />
                <span className="font-semibold">
                  {a.random_question_count ? `${a.random_question_count}/${a.question_ids.length}` : a.question_ids.length}
                </span>
                <span className="text-muted-foreground">{a.random_question_count ? 'ข้อสุ่ม/คลัง' : 'ข้อ'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <span className="font-semibold">{submittedSubs.length}</span>
                <span className="text-muted-foreground">ส่งแล้ว</span>
              </div>
              {a.duration_minutes && (
                <div className="flex items-center gap-2">
                  <Timer className="size-4 text-primary" />
                  <span className="font-semibold">{a.duration_minutes}</span>
                  <span className="text-muted-foreground">นาที</span>
                </div>
              )}
              {avgScore !== null && (
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
            <div className="shrink-0 text-right">
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

      <Tabs
        defaultValue="overview"
        orientation="vertical"
        className="flex flex-col gap-4 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6"
      >
        <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-4">
          <div>
            <p className="mb-2 hidden px-2 text-xs font-semibold text-muted-foreground md:block">
              ในหน้านี้
            </p>
            <TabsList className="flex h-auto w-full max-w-full !flex-row justify-start overflow-x-auto rounded-xl border border-primary/15 bg-primary/5 p-1.5 md:!flex-col md:items-stretch md:overflow-visible">
              {TABS.map(tab => {
                const Icon = tab.icon
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="group/tab h-auto !w-auto shrink-0 justify-start rounded-lg px-3 py-2.5 data-active:bg-primary data-active:text-primary-foreground md:!w-full"
                  >
                    <Icon data-icon="inline-start" />
                    {tab.label}
                    {tab.key === 'students' && submissions.length > 0 && (
                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground group-data-active/tab:bg-primary-foreground/15 group-data-active/tab:text-primary-foreground">
                        {submissions.length}
                      </span>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <section aria-label="การทำงาน">
            <p className="mb-2 hidden px-2 text-xs font-semibold text-muted-foreground md:block">
              การทำงาน
            </p>
            <Card radius="md" padding="sm" className="flex gap-1.5 overflow-x-auto md:flex-col md:overflow-visible">
              {a.status === 'draft' && (
                <Button onClick={publish} disabled={isPending} size="xs" className="shrink-0 justify-start border-0 bg-success text-success-foreground hover:bg-success/90 md:w-full">
                  <Play data-icon="inline-start" /> เผยแพร่
                </Button>
              )}
              {a.status === 'published' && (
                <Button onClick={close} disabled={isPending} size="xs" variant="destructive" className="shrink-0 justify-start md:w-full">
                  <Square data-icon="inline-start" /> ปิดการสอบ
                </Button>
              )}
              {a.mode === 'online' && a.question_ids.length > 0 && (
                <Button
                  size="xs"
                  variant="outline"
                  render={<Link href={`/assignments/${a.id}/preview`} target="_blank" />}
                  className="shrink-0 justify-start md:w-full"
                >
                  <Eye data-icon="inline-start" /> ดูตัวอย่างมุมมองนักเรียน
                </Button>
              )}
              {a.question_ids.length > 0 && (
                <Button
                  size="xs"
                  variant="outline"
                  render={<Link href={withBackHref(`/assignments/${a.id}/teach`, `/assignments/${a.id}`)} target="_blank" />}
                  className="shrink-0 justify-start md:w-full"
                >
                  <Presentation data-icon="inline-start" /> โหมดสอน
                </Button>
              )}
              {a.mode === 'online' && a.type === 'exam' && (
                <Button
                  size="xs"
                  variant="outline"
                  render={<Link href={`/assignments/${a.id}/proctor`} />}
                  className="shrink-0 justify-start md:w-full"
                >
                  <Radio data-icon="inline-start" /> ห้องคุมสอบสด
                </Button>
              )}
              {a.mode === 'online' && a.type === 'exam' && (
                <Button
                  size="xs"
                  variant="outline"
                  render={<Link href={`/assignments/${a.id}/proctor/report`} />}
                  className="shrink-0 justify-start md:w-full"
                >
                  <FileClock data-icon="inline-start" /> รายงานคุมสอบ
                </Button>
              )}
              <Button
                size="xs"
                variant="outline"
                render={<Link href={`/assignments/${a.id}/edit`} />}
                className="shrink-0 justify-start md:w-full"
              >
                <Pencil data-icon="inline-start" /> แก้ไขรายละเอียด
              </Button>
              <Button
                size="xs"
                className={pendingCount > 0
                  ? 'shrink-0 justify-start border-0 bg-warning text-warning-foreground hover:bg-warning/90 md:w-full'
                  : 'shrink-0 justify-start md:w-full'}
                variant={pendingCount > 0 ? 'default' : 'outline'}
                render={<Link href={gradeHref} />}
              >
                <ClipboardCheck data-icon="inline-start" />
                {pendingCount > 0
                  ? `ตรวจให้คะแนน ${pendingCount}${pendingReviewCapped ? '+' : ''} ชิ้น`
                  : 'ตรวจให้คะแนน / ดูคำตอบ'}
              </Button>
              <Button
                size="xs"
                variant="outline"
                render={<Link href={`/assignments/${a.id}/analytics`} />}
                className="shrink-0 justify-start md:w-full"
              >
                <TrendingUp data-icon="inline-start" /> วิเคราะห์เชิงลึก
              </Button>
              <Button onClick={handleDuplicate} disabled={isPending} size="xs" variant="ghost" className="shrink-0 justify-start md:w-full">
                <Copy data-icon="inline-start" /> ทำสำเนา
              </Button>
              <Button onClick={handleDelete} disabled={isPending} size="xs" variant="destructive" className="shrink-0 justify-start md:w-full">
                <Trash2 data-icon="inline-start" /> ลบ
              </Button>
            </Card>
          </section>
        </aside>

        <div className="min-w-0">
          <TabsContent value="overview">
            <OverviewTab
              a={a}
              submittedCount={submittedSubs.length}
              inProgressCount={inProgressSubs.length}
              totalSubs={submissions.length}
              avgScore={avgScore}
              pendingCount={pendingCount}
              pendingReviewCapped={pendingReviewCapped}
              gradeHref={gradeHref}
            />
          </TabsContent>
          <TabsContent value="questions">
            <QuestionsTab
              questions={questions}
              sections={parseSections(a.sections)}
              showSections={a.show_sections !== false}
            />
          </TabsContent>
          <TabsContent value="students">
            <StudentsTab submissions={submissions} pendingIdSet={pendingIdSet} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab questions={questions} submissions={submittedSubs} assignmentId={a.id} />
          </TabsContent>
        </div>
      </Tabs>
      {confirmDialog}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ a, submittedCount, inProgressCount, totalSubs, avgScore, pendingCount, pendingReviewCapped, gradeHref }: {
  a: Assignment & { classrooms: { name: string } | null }
  submittedCount: number
  inProgressCount: number
  totalSubs: number
  avgScore: number | null
  pendingCount: number
  pendingReviewCapped: boolean
  gradeHref: string
}) {
  const stats = [
    { label: 'ส่งแล้ว',      value: submittedCount,  icon: CheckCircle2, color: 'bg-success/10 text-success' },
    { label: 'กำลังทำ',      value: inProgressCount, icon: Activity,     color: 'bg-warning/10 text-warning' },
    { label: 'คะแนนเฉลี่ย', value: avgScore !== null ? `${avgScore}%` : '—', icon: TrendingUp, color: 'bg-primary/10 text-primary' },
    { label: 'จำนวนข้อ',    value: a.question_ids.length, icon: FileText, color: 'bg-tint-1/10 text-tint-1' },
  ]

  return (
    <div className="space-y-5">
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
              <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground leading-none">{s.value}</p>
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
              className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full transition-all"
              style={{ width: `${totalSubs > 0 ? (submittedCount / totalSubs) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {inProgressCount > 0 && `${inProgressCount} คนกำลังทำอยู่`}
          </p>
        </Card>
      )}

      {/* Info */}
      <Card edge="ring" padding="lg" className="space-y-3">
        <h3 className="font-semibold text-foreground text-sm">ข้อมูลชุดข้อสอบ</h3>
        <div className="divide-y divide-border">
          {[
            { label: 'ห้องเรียน', value: a.classrooms?.name ?? '—' },
            { label: 'เวลาทำ', value: a.duration_minutes ? `${a.duration_minutes} นาที` : 'ไม่จำกัด' },
            { label: 'เปิดรับ', value: a.start_at ? new Date(a.start_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ทันที' },
            { label: 'ปิดรับ', value: a.end_at ? new Date(a.end_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่กำหนด' },
            // The three endings are mutually exclusive — the database refuses
            // a streak งาน that also carries a score threshold — so this reads
            // as one row, not two that could both appear.
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
          ].map(row => (
            <div key={row.label} className="flex justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      </Card>
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

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ questions, submissions, assignmentId }: {
  questions: Question[]
  submissions: SubmissionRow[]
  assignmentId: string
}) {
  if (submissions.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
        <BarChart2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">ยังไม่มีข้อมูลเพียงพอ</p>
        <p className="text-sm text-muted-foreground mt-1">ต้องมีการส่งอย่างน้อย 1 ครั้ง</p>
      </div>
    )
  }

  // Mock per-question accuracy (deterministic from question id + assignmentId)
  const qStats = questions.map((q, i) => {
    const acc = Math.round(30 + seedRand(q.id + assignmentId, i) * 60)
    return { q, acc }
  })

  const avgAcc = Math.round(qStats.reduce((s, x) => s + x.acc, 0) / qStats.length)

  // Score distribution buckets
  const buckets = [0, 0, 0, 0, 0] // 0-20, 21-40, 41-60, 61-80, 81-100
  for (const s of submissions) {
    const pct = s.total_score != null && s.max_score > 0 ? (s.total_score / s.max_score) * 100 : 0
    buckets[Math.min(4, Math.floor(pct / 20))]++
  }
  const maxBucket = Math.max(...buckets, 1)

  return (
    <div className="space-y-5">
      {/* Score distribution */}
      <Card edge="ring" padding="lg">
        <h3 className="font-semibold text-foreground text-sm mb-4">การกระจายคะแนน ({submissions.length} คน)</h3>
        <div className="flex items-end gap-3 h-32">
          {buckets.map((count, i) => {
            const labels = ['0–20%', '21–40%', '41–60%', '61–80%', '81–100%']
            const colors = ['bg-destructive', 'bg-flag', 'bg-warning', 'bg-success/60', 'bg-success']
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">{count}</span>
                <div className="w-full flex items-end justify-center">
                  <div
                    className={`w-full rounded-t-md ${colors[i]} transition-all`}
                    style={{ height: `${Math.max(4, (count / maxBucket) * 80)}px` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{labels[i]}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Per-question accuracy */}
      <Card edge="ring" padding="lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm">ความแม่นยำรายข้อ</h3>
          <span className="text-xs text-muted-foreground">เฉลี่ย {avgAcc}%</span>
        </div>
        <div className="space-y-2.5">
          {qStats.map(({ q, acc }, i) => {
            const diff = DIFF_META[q.difficulty]
            const barColor = acc >= 70 ? 'bg-success' : acc >= 50 ? 'bg-warning' : 'bg-destructive'
            return (
              <div key={q.id} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground truncate pr-2">{q.title}</p>
                    <span className="text-xs font-bold text-muted-foreground shrink-0">{acc}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${acc}%` }} />
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${diff?.badge ?? ''}`}>
                  {diff?.label}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

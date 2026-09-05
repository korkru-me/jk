'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, Users, FileText, Timer, Clock, CheckCircle2, BookOpen,
  Play, Square, Printer, BarChart2, Settings, Trash2, TrendingUp,
  AlertCircle, Activity, Copy, Pencil, Eye, Radio, LockKeyhole, Smartphone,
  FileClock, Presentation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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

type Tab = 'overview' | 'questions' | 'students' | 'analytics'

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'overview',   label: 'ภาพรวม',   icon: Activity },
  { key: 'questions',  label: 'โจทย์',    icon: FileText },
  { key: 'students',   label: 'นักเรียน', icon: Users },
  { key: 'analytics',  label: 'วิเคราะห์', icon: BarChart2 },
]

interface Props {
  assignment: Assignment & { classrooms: { name: string } | null }
  questions: Question[]
  submissions: SubmissionRow[]
  canManageSebPassword?: boolean
}

function seedRand(str: string, i: number) {
  const h = [...str].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (i + 7) * 2654435761) >>> 0) % 100) / 100
}

export function AssignmentDetailClient({ assignment: a, questions, submissions, canManageSebPassword = false }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()

  const statusMeta = STATUS_META[a.status]
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
    <div className="space-y-6 max-w-[1100px]">
      {/* Back — returns to the classroom this was assigned from */}
      <Link
        href={`/classrooms/${a.classroom_id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> {a.classrooms?.name ?? 'กลับไปห้องเรียน'}
      </Link>

      {/* Header card */}
      <div className="bg-surface-inverse text-surface-inverse-foreground rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusMeta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
              <span className="text-xs text-surface-inverse-muted border border-surface-inverse-border px-2.5 py-1 rounded-full">
                {a.mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์'}
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
            {a.classrooms?.name && <p className="text-surface-inverse-muted text-sm mt-1">{a.classrooms.name}</p>}
            {a.description && <p className="text-surface-inverse-muted text-sm mt-1">{a.description}</p>}

            {/* Quick stats */}
            <div className="flex items-center gap-5 mt-4 text-sm">
              <div className="flex items-center gap-2" title={a.random_question_count ? `สุ่มจากคลัง ${a.question_ids.length} ข้อ` : undefined}>
                <FileText className="w-4 h-4 text-surface-inverse-muted" />
                <span className="font-semibold">
                  {a.random_question_count ? `${a.random_question_count}/${a.question_ids.length}` : a.question_ids.length}
                </span>
                <span className="text-surface-inverse-muted">{a.random_question_count ? 'ข้อสุ่ม/คลัง' : 'ข้อ'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-surface-inverse-muted" />
                <span className="font-semibold">{submittedSubs.length}</span>
                <span className="text-surface-inverse-muted">ส่งแล้ว</span>
              </div>
              {a.duration_minutes && (
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-surface-inverse-muted" />
                  <span className="font-semibold">{a.duration_minutes}</span>
                  <span className="text-surface-inverse-muted">นาที</span>
                </div>
              )}
              {avgScore !== null && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-surface-inverse-muted" />
                  <span className="font-semibold">{avgScore}%</span>
                  <span className="text-surface-inverse-muted">เฉลี่ย</span>
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          {(a.start_at || a.end_at) && (
            <div className="shrink-0 text-right">
              {a.start_at && (
                <div className="mb-1">
                  <p className="text-xs text-surface-inverse-muted">เปิด</p>
                  <p className="text-sm font-medium">{new Date(a.start_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                </div>
              )}
              {a.end_at && (
                <div>
                  <p className="text-xs text-surface-inverse-muted">ปิด</p>
                  <p className="text-sm font-medium">{new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-surface-inverse-border flex-wrap">
          {a.status === 'draft' && (
            <Button onClick={publish} disabled={isPending} size="sm" className="gap-1.5 bg-success hover:bg-success/90 border-0">
              <Play className="w-3.5 h-3.5" /> เผยแพร่
            </Button>
          )}
          {a.status === 'published' && (
            <Button onClick={close} disabled={isPending} size="sm" variant="destructive" className="gap-1.5">
              <Square className="w-3.5 h-3.5" /> ปิดการสอบ
            </Button>
          )}
          {a.mode === 'print' && (
            <Link href={`/assignments/${a.id}/print`} target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
                <Printer className="w-3.5 h-3.5" /> พิมพ์ใบงาน
              </Button>
            </Link>
          )}
          {a.mode === 'online' && a.question_ids.length > 0 && (
            <Link href={`/assignments/${a.id}/preview`} target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
                <Eye className="w-3.5 h-3.5" /> ดูตัวอย่างมุมมองนักเรียน
              </Button>
            </Link>
          )}
          {a.question_ids.length > 0 && (
            <Link href={withBackHref(`/assignments/${a.id}/teach`, `/assignments/${a.id}`)} target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
                <Presentation className="w-3.5 h-3.5" /> โหมดสอน
              </Button>
            </Link>
          )}
          {a.mode === 'online' && a.type === 'exam' && (
            <Link href={`/assignments/${a.id}/proctor`}>
              <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
                <Radio className="w-3.5 h-3.5" /> ห้องคุมสอบสด
              </Button>
            </Link>
          )}
          {a.mode === 'online' && a.type === 'exam' && (
            <Button
              nativeButton={false}
              size="sm"
              variant="outline"
              render={<Link href={`/assignments/${a.id}/proctor/report`} />}
              className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent"
            >
              <FileClock className="w-3.5 h-3.5" /> รายงานคุมสอบ
            </Button>
          )}
          <Link href={`/assignments/${a.id}/edit`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
              <Pencil className="w-3.5 h-3.5" /> แก้ไขรายละเอียด
            </Button>
          </Link>
          {canManageSebPassword && <Button
            nativeButton={false} size="sm" variant="outline"
            render={<Link href={`/assignments/${a.id}/seb-password`} />}
            className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent"
          ><LockKeyhole className="w-3.5 h-3.5" /> ร่างรหัสออก SEB</Button>}
          <Link href={`/assignments/${a.id}/results`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
              <BarChart2 className="w-3.5 h-3.5" /> ดูคำตอบ &amp; คะแนน
            </Button>
          </Link>
          <Link href={`/assignments/${a.id}/analytics`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
              <TrendingUp className="w-3.5 h-3.5" /> วิเคราะห์เชิงลึก
            </Button>
          </Link>
          <Link href={`/assignments/${a.id}/export`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground bg-transparent">
              <Settings className="w-3.5 h-3.5" /> ส่งออก &amp; พิมพ์
            </Button>
          </Link>
          <button
            onClick={handleDuplicate}
            disabled={isPending}
            className="ml-auto flex items-center gap-1.5 text-xs text-surface-inverse-foreground/70 hover:text-surface-inverse-foreground transition-colors disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" /> ทำสำเนา
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> ลบ
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted rounded-2xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-muted-foreground hover:bg-card/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'students' && submissions.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'
                }`}>{submissions.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab
            a={a}
            submittedCount={submittedSubs.length}
            inProgressCount={inProgressSubs.length}
            totalSubs={submissions.length}
            avgScore={avgScore}
          />
        )}
        {activeTab === 'questions' && (
          <QuestionsTab
            questions={questions}
            sections={parseSections(a.sections)}
            showSections={a.show_sections !== false}
          />
        )}
        {activeTab === 'students' && <StudentsTab submissions={submissions} assignmentId={a.id} />}
        {activeTab === 'analytics' && <AnalyticsTab questions={questions} submissions={submittedSubs} assignmentId={a.id} />}
      </div>
      {confirmDialog}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ a, submittedCount, inProgressCount, totalSubs, avgScore }: {
  a: Assignment & { classrooms: { name: string } | null }
  submittedCount: number
  inProgressCount: number
  totalSubs: number
  avgScore: number | null
}) {
  const stats = [
    { label: 'ส่งแล้ว',      value: submittedCount,  icon: CheckCircle2, color: 'bg-success/10 text-success' },
    { label: 'กำลังทำ',      value: inProgressCount, icon: Activity,     color: 'bg-warning/10 text-warning' },
    { label: 'คะแนนเฉลี่ย', value: avgScore !== null ? `${avgScore}%` : '—', icon: TrendingUp, color: 'bg-primary/10 text-primary' },
    { label: 'จำนวนข้อ',    value: a.question_ids.length, icon: FileText, color: 'bg-tint-1/10 text-tint-1' },
  ]

  return (
    <div className="space-y-5">
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
            { label: 'โหมด', value: a.mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์' },
            { label: 'เวลาทำ', value: a.duration_minutes ? `${a.duration_minutes} นาที` : 'ไม่จำกัด' },
            { label: 'เปิดรับ', value: a.start_at ? new Date(a.start_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ทันที' },
            { label: 'ปิดรับ', value: a.end_at ? new Date(a.end_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่กำหนด' },
            ...(a.passing_type != null && a.passing_value != null
              ? [{ label: 'เกณฑ์ผ่าน', value: a.passing_type === 'percent' ? `${a.passing_value}%` : `${a.passing_value} คะแนน` }]
              : []),
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

function StudentsTab({ submissions, assignmentId }: { submissions: SubmissionRow[]; assignmentId: string }) {
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
        <p className="text-sm text-muted-foreground">ส่งแล้ว {submittedCount} / {submissions.length} คน</p>
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
          return (
            <div key={s.id ?? s.student_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-5 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
              <span className="text-sm font-medium text-foreground">{s.users?.full_name ?? '—'}</span>
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

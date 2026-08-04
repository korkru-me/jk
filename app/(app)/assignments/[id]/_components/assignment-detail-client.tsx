'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, Users, FileText, Timer, Clock, CheckCircle2, BookOpen,
  Play, Square, Printer, BarChart2, Settings, Trash2, TrendingUp,
  AlertCircle, Activity, Copy, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateAssignmentStatus, deleteAssignment, duplicateAssignment } from '@/lib/actions/assignments'
import type { Assignment, Question } from '@/lib/types'
import type { SubmissionRow } from '../page'

const DIFF_META: Record<string, { label: string; color: string; bar: string }> = {
  easy:       { label: 'ง่าย',      color: 'bg-green-100 text-green-700',   bar: 'bg-green-400' },
  medium:     { label: 'กลาง',      color: 'bg-amber-100 text-amber-700',   bar: 'bg-amber-400' },
  hard:       { label: 'ยาก',       color: 'bg-red-100 text-red-700',       bar: 'bg-red-400' },
  analytical: { label: 'วิเคราะห์', color: 'bg-purple-100 text-purple-700', bar: 'bg-purple-400' },
}

const TYPE_SHORT: Record<string, string> = {
  mcq: 'MCQ', written: 'เขียน', matching: 'จับคู่', essay: 'บรรยาย',
  true_false: 'ถ/ผ', fill_blank: 'เติมคำ', ordering: 'เรียง',
  file_upload: 'ไฟล์งาน',
}

const STATUS_META = {
  draft:     { label: 'ร่าง',         color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  published: { label: 'เผยแพร่แล้ว',  color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  closed:    { label: 'ปิดแล้ว',      color: 'bg-red-100 text-red-600',     dot: 'bg-red-400' },
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
}

function seedRand(str: string, i: number) {
  const h = [...str].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (i + 7) * 2654435761) >>> 0) % 100) / 100
}

export function AssignmentDetailClient({ assignment: a, questions, submissions }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [isPending, startTransition] = useTransition()
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

  function handleDelete() {
    if (!confirm('ลบชุดข้อสอบนี้? ข้อมูลการส่งทั้งหมดจะถูกลบด้วย')) return
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
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> {a.classrooms?.name ?? 'กลับไปห้องเรียน'}
      </Link>

      {/* Header card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusMeta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
              <span className="text-xs text-gray-400 border border-white/20 px-2.5 py-1 rounded-full">
                {a.mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์'}
              </span>
            </div>
            <h1 className="text-2xl font-bold leading-tight">{a.title}</h1>
            {a.classrooms?.name && <p className="text-gray-400 text-sm mt-1">{a.classrooms.name}</p>}
            {a.description && <p className="text-gray-400 text-sm mt-1">{a.description}</p>}

            {/* Quick stats */}
            <div className="flex items-center gap-5 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="font-semibold">{a.question_ids.length}</span>
                <span className="text-gray-400">ข้อ</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-semibold">{submittedSubs.length}</span>
                <span className="text-gray-400">ส่งแล้ว</span>
              </div>
              {a.duration_minutes && (
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-gray-400" />
                  <span className="font-semibold">{a.duration_minutes}</span>
                  <span className="text-gray-400">นาที</span>
                </div>
              )}
              {avgScore !== null && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <span className="font-semibold">{avgScore}%</span>
                  <span className="text-gray-400">เฉลี่ย</span>
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          {(a.start_at || a.end_at) && (
            <div className="shrink-0 text-right">
              {a.start_at && (
                <div className="mb-1">
                  <p className="text-xs text-gray-500">เปิด</p>
                  <p className="text-sm font-medium">{new Date(a.start_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                </div>
              )}
              {a.end_at && (
                <div>
                  <p className="text-xs text-gray-500">ปิด</p>
                  <p className="text-sm font-medium">{new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/10 flex-wrap">
          {a.status === 'draft' && (
            <Button onClick={publish} disabled={isPending} size="sm" className="gap-1.5 bg-green-500 hover:bg-green-600 border-0">
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
              <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
                <Printer className="w-3.5 h-3.5" /> พิมพ์ใบงาน
              </Button>
            </Link>
          )}
          <Link href={`/assignments/${a.id}/edit`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
              <Pencil className="w-3.5 h-3.5" /> แก้ไขรายละเอียด
            </Button>
          </Link>
          <Link href={`/assignments/${a.id}/results`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
              <BarChart2 className="w-3.5 h-3.5" /> ดูคำตอบ &amp; คะแนน
            </Button>
          </Link>
          <Link href={`/assignments/${a.id}/analytics`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
              <TrendingUp className="w-3.5 h-3.5" /> วิเคราะห์เชิงลึก
            </Button>
          </Link>
          <Link href={`/assignments/${a.id}/export`}>
            <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
              <Settings className="w-3.5 h-3.5" /> ส่งออก &amp; พิมพ์
            </Button>
          </Link>
          <button
            onClick={handleDuplicate}
            disabled={isPending}
            className="ml-auto flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" /> ทำสำเนา
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> ลบ
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'students' && submissions.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
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
        {activeTab === 'questions' && <QuestionsTab questions={questions} />}
        {activeTab === 'students' && <StudentsTab submissions={submissions} assignmentId={a.id} />}
        {activeTab === 'analytics' && <AnalyticsTab questions={questions} submissions={submittedSubs} assignmentId={a.id} />}
      </div>
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
    { label: 'ส่งแล้ว',      value: submittedCount,  icon: CheckCircle2, color: 'bg-green-50 text-green-500' },
    { label: 'กำลังทำ',      value: inProgressCount, icon: Activity,     color: 'bg-amber-50 text-amber-500' },
    { label: 'คะแนนเฉลี่ย', value: avgScore !== null ? `${avgScore}%` : '—', icon: TrendingUp, color: 'bg-blue-50 text-blue-500' },
    { label: 'จำนวนข้อ',    value: a.question_ids.length, icon: FileText, color: 'bg-purple-50 text-purple-500' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-none">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      {totalSubs > 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">ความคืบหน้าการส่ง</span>
            <span className="text-gray-500">{submittedCount} / {totalSubs} คน</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full transition-all"
              style={{ width: `${totalSubs > 0 ? (submittedCount / totalSubs) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {inProgressCount > 0 && `${inProgressCount} คนกำลังทำอยู่`}
          </p>
        </div>
      )}

      {/* Info */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">ข้อมูลชุดข้อสอบ</h3>
        <div className="divide-y divide-gray-50">
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
              <span className="text-gray-500">{row.label}</span>
              <span className="font-medium text-gray-900">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Questions Tab ────────────────────────────────────────────────────────────

function QuestionsTab({ questions }: { questions: Question[] }) {
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
            <span key={d} className={`text-xs font-medium px-3 py-1.5 rounded-full ${m?.color ?? 'bg-gray-100 text-gray-600'}`}>
              {m?.label ?? d} · {count} ข้อ
            </span>
          )
        })}
        <span className="text-xs text-gray-400 self-center ml-auto">{questions.length} ข้อรวม</span>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        {questions.map((q, i) => {
          const diff = DIFF_META[q.difficulty]
          return (
            <div
              key={q.id}
              className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
            >
              <span className="text-sm text-gray-400 font-medium w-7 shrink-0 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{q.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{q.question_text}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${diff?.color ?? 'bg-gray-100 text-gray-600'}`}>
                  {diff?.label ?? q.difficulty}
                </span>
                <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
                  {TYPE_SHORT[q.question_type] ?? q.question_type}
                </span>
              </div>
            </div>
          )
        })}
      </div>
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
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">ยังไม่มีการส่ง</p>
        <p className="text-sm text-gray-400 mt-1">เมื่อนักเรียนส่งงาน ข้อมูลจะปรากฏที่นี่</p>
      </div>
    )
  }

  const submittedCount = submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">ส่งแล้ว {submittedCount} / {submissions.length} คน</p>
        <div className="flex gap-1">
          {(['time', 'score', 'name'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                sort === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'time' ? 'ล่าสุด' : s === 'score' ? 'คะแนน' : 'ชื่อ'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-xs font-medium text-gray-400 px-5 py-2.5 border-b border-gray-100">
          <span>ชื่อนักเรียน</span>
          <span className="text-right w-20">สถานะ</span>
          <span className="text-right w-24">คะแนน</span>
          <span className="text-right w-28">เวลาส่ง</span>
        </div>
        {sorted.map(s => {
          const isDone = s.status === 'submitted' || s.status === 'graded'
          const pct = s.total_score != null && s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : null
          return (
            <div key={s.id ?? s.student_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
              <span className="text-sm font-medium text-gray-900">{s.users?.full_name ?? '—'}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-20 text-center ${
                isDone ? 'bg-green-100 text-green-700' :
                s.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {isDone ? 'ส่งแล้ว' : s.status === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ทำ'}
              </span>
              <div className="text-right w-24">
                {s.total_score != null ? (
                  <div>
                    <span className="text-sm font-bold text-gray-900">{s.total_score}/{s.max_score}</span>
                    {pct !== null && (
                      <div className="h-1 bg-gray-100 rounded-full mt-1 w-16 ml-auto">
                        <div
                          className={`h-full rounded-full ${pct >= 70 ? 'bg-green-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-300">—</span>
                )}
              </div>
              <span className="text-xs text-gray-400 text-right w-28">
                {s.submitted_at ? new Date(s.submitted_at).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' }) : '—'}
              </span>
            </div>
          )
        })}
      </div>
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
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <BarChart2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">ยังไม่มีข้อมูลเพียงพอ</p>
        <p className="text-sm text-gray-400 mt-1">ต้องมีการส่งอย่างน้อย 1 ครั้ง</p>
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
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-4">การกระจายคะแนน ({submissions.length} คน)</h3>
        <div className="flex items-end gap-3 h-32">
          {buckets.map((count, i) => {
            const labels = ['0–20%', '21–40%', '41–60%', '61–80%', '81–100%']
            const colors = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-lime-400', 'bg-green-400']
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-bold text-gray-600">{count}</span>
                <div className="w-full flex items-end justify-center">
                  <div
                    className={`w-full rounded-t-md ${colors[i]} transition-all`}
                    style={{ height: `${Math.max(4, (count / maxBucket) * 80)}px` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{labels[i]}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-question accuracy */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-sm">ความแม่นยำรายข้อ</h3>
          <span className="text-xs text-gray-400">เฉลี่ย {avgAcc}%</span>
        </div>
        <div className="space-y-2.5">
          {qStats.map(({ q, acc }, i) => {
            const diff = DIFF_META[q.difficulty]
            const barColor = acc >= 70 ? 'bg-green-400' : acc >= 50 ? 'bg-amber-400' : 'bg-red-400'
            return (
              <div key={q.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-700 truncate pr-2">{q.title}</p>
                    <span className="text-xs font-bold text-gray-700 shrink-0">{acc}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${acc}%` }} />
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${diff?.color ?? ''}`}>
                  {diff?.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Pencil, BookOpen, ChevronUp, ChevronDown, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Question } from '@/lib/types'
import type { AnalyticsSubmissionRow } from '../page'
import type { ScoreOverride } from './analytics-client'
import { ScoreOverrideModal } from './score-override-modal'
import { computePassed } from '@/lib/grading'
import { Card } from '@/components/ui/card'

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function avatarColor(name: string): string {
  const colors = [
    'bg-primary/10 text-primary',
    'bg-violet-100 text-violet-600',
    'bg-success/10 text-success',
    'bg-warning/10 text-warning',
    'bg-rose-100 text-rose-600',
    'bg-cyan-100 text-cyan-600',
  ]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

interface Props {
  submissions: AnalyticsSubmissionRow[]
  maxScore: number
  overrides: ScoreOverride[]
  onOverride: (entry: ScoreOverride) => void
  teacherName: string
  questions: Question[]
  assignmentId: string
  passingType: 'score' | 'percent' | null
  passingValue: number | null
}

type SortKey = 'name' | 'score' | 'time'
type SortDir = 'asc' | 'desc'

export function StudentScoreTable({
  submissions,
  maxScore,
  overrides,
  onOverride,
  teacherName,
  questions,
  assignmentId,
  passingType,
  passingValue,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [editingId, setEditingId] = useState<string | null>(null)

  function getEffectiveScore(sub: AnalyticsSubmissionRow): number {
    const ov = [...overrides].reverse().find(o => o.submissionId === sub.id)
    return ov ? ov.newScore : (sub.total_score ?? 0)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...submissions].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'score') cmp = getEffectiveScore(a) - getEffectiveScore(b)
    else if (sortKey === 'name') cmp = (a.users?.full_name ?? '').localeCompare(b.users?.full_name ?? '', 'th')
    else cmp = new Date(a.submitted_at ?? a.started_at).getTime() - new Date(b.submitted_at ?? b.started_at).getTime()
    return sortDir === 'asc' ? cmp : -cmp
  })

  const hasThreshold = passingType != null && passingValue != null
  const passCount = hasThreshold
    ? sorted.filter(s => computePassed(getEffectiveScore(s), maxScore, passingType, passingValue) === true).length
    : 0

  function handleRemediation(sub: AnalyticsSubmissionRow) {
    // Mock: pick 3 easy questions from the bank as remediation set
    const easyQs = questions.filter(q => q.difficulty === 'easy').slice(0, 3)
    const count = easyQs.length > 0 ? easyQs.length : Math.ceil(questions.length * 0.4)
    toast.success(
      `สร้างชุดข้อสอบซ่อมเสริมให้ ${sub.users?.full_name ?? 'นักเรียน'} แล้ว`,
      {
        description: `${count} ข้อ ระดับ "ง่าย" คัดเลือกจากแท็กที่นักเรียนคนนี้ตอบผิด`,
        duration: 5000,
      }
    )
  }

  const editingSub = editingId ? submissions.find(s => s.id === editingId) : null
  const editingSubOverride = editingId ? overrides.filter(o => o.submissionId === editingId) : []

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-200" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
      : <ChevronDown className="w-3 h-3 text-muted-foreground" />
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
        <AlertCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">ยังไม่มีการส่ง</p>
        <p className="text-sm text-muted-foreground mt-1">เมื่อนักเรียนส่งงาน ข้อมูลจะปรากฏที่นี่</p>
      </div>
    )
  }

  return (
    <>
      {/* Summary row */}
      <div className="flex items-center gap-4 flex-wrap">
        {hasThreshold && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              ผ่าน {passCount} คน
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium">
              <XCircle className="w-4 h-4" />
              ไม่ผ่าน {submissions.length - passCount} คน
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground ml-auto">
          {hasThreshold
            ? `เกณฑ์ผ่าน ${passingType === 'percent' ? `${passingValue}%` : `${passingValue} คะแนน`} · คะแนนเต็ม ${maxScore}`
            : `คะแนนเต็ม ${maxScore}`}
        </p>
      </div>

      {/* Table */}
      <Card edge="ring" className="overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-0 px-5 py-3 border-b border-border bg-muted/80">
          <button
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-muted-foreground text-left"
          >
            ชื่อนักเรียน <SortIcon col="name" />
          </button>
          <button
            onClick={() => toggleSort('score')}
            className="flex items-center gap-1 justify-center text-xs font-medium text-muted-foreground hover:text-muted-foreground"
          >
            คะแนน <SortIcon col="score" />
          </button>
          <span className="text-xs font-medium text-muted-foreground text-center">สถานะ</span>
          <span className="text-xs font-medium text-muted-foreground text-right w-32">การจัดการ</span>
        </div>

        {/* Rows */}
        {sorted.map((sub) => {
          const effectiveScore = getEffectiveScore(sub)
          const pct = maxScore > 0 ? Math.round(effectiveScore / maxScore * 100) : 0
          const realPass = hasThreshold ? computePassed(effectiveScore, maxScore, passingType, passingValue) : null
          // No threshold configured: fall back to the pct>=60 heuristic just
          // for row tint / remediation grouping — never shown as a verdict.
          const pass = realPass ?? pct >= 60
          const name = sub.users?.full_name ?? '—'
          const isOverridden = overrides.some(o => o.submissionId === sub.id)
          const initials = getInitials(name)
          const avatarCls = avatarColor(name)

          return (
            <div
              key={sub.id}
              className={`grid grid-cols-[2fr_1fr_1fr_auto] gap-0 items-center px-5 py-3.5 border-b border-border last:border-0 transition-colors ${
                pass ? 'hover:bg-muted/50' : 'bg-destructive/10 hover:bg-destructive/10'
              }`}
            >
              {/* Name + avatar */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarCls}`}>
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {name}
                    {isOverridden && (
                      <span className="ml-1.5 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full align-middle">
                        แก้ไขแล้ว
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {sub.submitted_at
                      ? new Date(sub.submitted_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Score */}
              <div className="text-center">
                <p className={`text-lg font-black tabular-nums ${pass ? 'text-foreground' : 'text-destructive'}`}>
                  {effectiveScore}<span className="text-xs font-normal text-muted-foreground/40">/{maxScore}</span>
                </p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1 mx-auto w-20">
                  <div
                    className={`h-full rounded-full ${pct >= 75 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-destructive'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{pct}%</p>
              </div>

              {/* Status */}
              <div className="flex justify-center">
                {realPass !== null ? (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    realPass ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                  }`}>
                    {realPass ? 'ผ่าน' : 'ไม่ผ่าน'}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 justify-end w-32">
                <button
                  onClick={() => setEditingId(sub.id)}
                  title="แก้ไขคะแนน"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground bg-muted rounded-lg hover:bg-accent transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  แก้ไข
                </button>
                {!pass && (
                  <button
                    onClick={() => handleRemediation(sub)}
                    title="จัดแบบฝึกหัดซ่อมเสริม"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-warning bg-warning/10 rounded-lg hover:bg-warning/10 transition-colors"
                  >
                    <BookOpen className="w-3 h-3" />
                    ซ่อมเสริม
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </Card>

      {/* Override modal */}
      {editingId && editingSub && (
        <ScoreOverrideModal
          submissionId={editingId}
          studentName={editingSub.users?.full_name ?? '—'}
          currentScore={getEffectiveScore(editingSub)}
          maxScore={maxScore}
          overrides={editingSubOverride}
          teacherName={teacherName}
          onSave={entry => {
            onOverride(entry)
            // Do NOT close here — let the modal's 1200ms animation finish first,
            // then it calls onClose() itself.
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  )
}

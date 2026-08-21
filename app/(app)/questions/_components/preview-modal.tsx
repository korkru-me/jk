'use client'

import { useState } from 'react'
import {
  X, Flag, AlertTriangle, BookOpen, GitBranch, BarChart2, Clock,
  CheckCircle2, TrendingUp, Activity,
} from 'lucide-react'
import { DIFF_META } from '@/lib/question-display'
import { difficultyLabel, discriminationLabel, type QuestionStats } from '@/lib/question-stats'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { RichText } from '@/components/ui/rich-text'
import type {
  Variable, MCQOption, MatchingPair, TrueFalseConfig, FillBlankConfig,
  OrderingConfig, FileUploadConfig, RandomQuestionConfig, CompositeConfig,
} from '@/lib/types'
import type { QuestionDetailWithCategory } from '../page'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'

// ── Mock data helpers ──────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'content' | 'history' | 'stats'

interface Props {
  question: QuestionDetailWithCategory
  isFlagged: boolean
  onClose: () => void
  onToggleFlag: () => void
  /** Item analysis, absent until the question has been answered in a graded attempt. */
  stats?: QuestionStats
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export function PreviewModal({ question: q, isFlagged, onClose, onToggleFlag, stats }: Props) {
  const [tab, setTab] = useState<Tab>('content')
  const diff = DIFF_META[q.difficulty]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col z-10 overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.badge}`}>{diff?.label}</span>
              {q.question_categories?.name && (
                <span className="text-xs text-muted-foreground">{q.question_categories.name}</span>
              )}
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{q.question_type}</span>
            </div>
            <h2 className="font-bold text-foreground text-base leading-snug line-clamp-2">{q.title}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleFlag}
              title={isFlagged ? 'ยกเลิกการรายงาน' : 'รายงานปัญหา'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                isFlagged ? 'bg-flag/10 text-flag' : 'text-muted-foreground hover:text-flag hover:bg-flag/10'
              }`}
            >
              <Flag className="w-4 h-4" />
            </button>
            <IconButton onClick={onClose} label="ปิด">
              <X />
            </IconButton>
          </div>
        </div>

        {/* Flagged warning */}
        {isFlagged && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-flag/10 border-b border-flag/20 shrink-0">
            <AlertTriangle className="w-4 h-4 text-flag shrink-0" />
            <p className="text-sm text-flag font-medium">
              โจทย์ข้อนี้ถูกรายงานว่าเฉลยอาจผิดพลาด กรุณาตรวจสอบ
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 px-6 border-b border-border shrink-0">
          {([
            { key: 'content' as Tab, label: 'ลองทำโจทย์',        icon: BookOpen },
            { key: 'history' as Tab, label: 'ประวัติการแก้ไข',   icon: GitBranch },
            { key: 'stats'   as Tab, label: 'สถิติ',              icon: BarChart2 },
          ]).map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                  tab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'content' && <InteractiveTab key={q.id} q={q} />}
          {tab === 'history' && <HistoryTab question={q} />}
          {tab === 'stats'   && <StatsTab stats={stats} />}
        </div>
      </div>
    </div>
  )
}

// ── Interactive Tab ────────────────────────────────────────────────────────────
// Answerable "student view" — auto-graded types (mcq/matching/written/true_false/
// fill_blank/ordering) reveal correct/incorrect plus the right answer on check;
// essay/file_upload have no auto-grading, so it's just a free try with no verdict.

function InteractiveTab({ q }: { q: QuestionDetailWithCategory }) {
  const extraData = q.extra_data as any

  return (
    <div className="space-y-5">
      <QuestionPreviewContent
        questionText={q.question_text}
        variables={(q.variables ?? []) as Variable[]}
        answerParts={q.question_type === 'written' ? (q.answer_parts ?? []) : []}
        isRandom={q.is_random}
        questionType={q.question_type}
        mcqOptions={q.question_type === 'mcq' ? ((q.mcq_options ?? []) as MCQOption[]) : []}
        matchingPairs={q.question_type === 'matching' ? ((q.mcq_options ?? []) as unknown as MatchingPair[]) : []}
        imageUrls={q.image_urls ?? []}
        trueFalseConfig={q.question_type === 'true_false' ? (extraData as TrueFalseConfig) : undefined}
        fillBlankConfig={q.question_type === 'fill_blank' ? (extraData as FillBlankConfig) : undefined}
        orderingConfig={q.question_type === 'ordering' ? (extraData as OrderingConfig) : undefined}
        compositeConfig={q.question_type === 'composite' ? (extraData as CompositeConfig) : undefined}
        partLabelStyle={(extraData as RandomQuestionConfig)?.part_label_style}
        attachmentUrls={q.question_type === 'file_upload' ? ((extraData as FileUploadConfig)?.attachment_urls ?? []) : []}
      />

      {/* Solution text */}
      {(q.solution_text || (q.solution_image_urls ?? []).length > 0) && (
        <div className="bg-warning/10 rounded-xl p-4 border border-warning/20 space-y-3">
          <p className="text-[11px] font-semibold text-warning uppercase tracking-wide mb-2">วิธีทำ / คำอธิบาย</p>
          {q.solution_text && <RichText text={q.solution_text} className="text-sm text-warning leading-relaxed block" />}
          {(q.solution_image_urls ?? []).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {(q.solution_image_urls ?? []).map(url => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="รูปประกอบเฉลย"
                  className="max-h-40 rounded-lg border border-warning/20 object-contain" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {q.tags && q.tags.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">แท็ก</p>
          <div className="flex flex-wrap gap-1.5">
            {q.tags.map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">#{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── History Tab ────────────────────────────────────────────────────────────────

function HistoryTab({ question: q }: { question: QuestionDetailWithCategory }) {
  // There is no per-edit history table yet, so the only trustworthy events are
  // the two timestamps on the row itself. Anything richer would be invented.
  const created = new Date(q.created_at)
  const updated = new Date(q.updated_at)
  const wasEdited = updated.getTime() - created.getTime() > 1000

  const fmt = (d: Date) =>
    d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

  const events = [
    ...(wasEdited ? [{ label: 'แก้ไขล่าสุด', at: updated, latest: true }] : []),
    { label: 'สร้างโจทย์', at: created, latest: !wasEdited },
  ]

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-foreground text-sm">ประวัติการแก้ไข</h3>

      <div className="relative">
        <div className="absolute left-3.5 top-4 bottom-4 w-0.5 bg-muted" />
        <div className="space-y-4">
          {events.map(ev => (
            <div key={ev.label} className="flex gap-4">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${
                ev.latest ? 'bg-primary text-primary-foreground' : 'bg-card ring-2 ring-border text-muted-foreground'
              }`}>
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <div className={`flex-1 p-3.5 rounded-xl border ${
                ev.latest ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted'
              }`}>
                <p className="text-sm text-foreground font-medium">{ev.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {fmt(ev.at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-muted rounded-xl border border-border flex items-start gap-3">
        <Activity className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          ขณะนี้ระบบเก็บเฉพาะเวลาที่สร้างและเวลาที่แก้ไขล่าสุด ยังไม่ได้บันทึกรายละเอียดของการแก้ไขแต่ละครั้งหรือผู้ที่แก้ไข
        </p>
      </div>
    </div>
  )
}

// ── Stats Tab ──────────────────────────────────────────────────────────────────

function StatsTab({ stats }: { stats?: QuestionStats }) {
  if (!stats) {
    return (
      <div className="bg-muted rounded-2xl p-8 text-center">
        <p className="text-sm font-medium text-foreground">ยังไม่มีสถิติสำหรับโจทย์ข้อนี้</p>
        <p className="text-xs text-muted-foreground mt-1">
          ค่าความยากและอำนาจจำแนกจะคำนวณจากคำตอบจริง หลังจากนักเรียนส่งข้อสอบที่มีโจทย์ข้อนี้
        </p>
      </div>
    )
  }

  const pPct = Math.round(stats.pValue * 100)
  const r = stats.discrimination
  const rPct = r != null ? Math.round(Math.max(0, r) * 100) : 0
  const correct = Math.round(stats.pValue * stats.attempts)

  const pLabel = difficultyLabel(stats.pValue)
  const pColor = pPct <= 30 ? 'text-destructive' : pPct <= 50 ? 'text-flag' : pPct <= 70 ? 'text-warning' : 'text-success'
  const rMeta = r != null ? discriminationLabel(r) : null
  const rBarColor = r == null ? 'bg-muted-foreground'
    : r >= 0.4 ? 'bg-success' : r >= 0.3 ? 'bg-primary' : r >= 0.2 ? 'bg-warning' : 'bg-destructive'

  return (
    <div className="space-y-4">
      {/* p-value & r-value */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">ค่าความยาก (p-value)</p>
          <p className={`text-4xl font-black leading-none ${pColor}`}>{stats.pValue.toFixed(2)}</p>
          <p className={`text-sm font-semibold mt-1 ${pColor}`}>ระดับ{pLabel}</p>
          {/* Gradient bar */}
          <div className="mt-3 relative">
            <div className="h-2 bg-gradient-to-r from-green-400 via-amber-400 to-red-400 rounded-full" />
            <div
              className="absolute top-0 -translate-x-1/2 w-3 h-2 bg-foreground rounded-full"
              style={{ left: `${100 - pPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>ง่าย</span><span>ยาก</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">สัดส่วนนักเรียนที่ตอบถูก</p>
        </div>

        <div className="bg-muted rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">อำนาจจำแนก (r-value)</p>
          <p className={`text-4xl font-black leading-none ${rMeta?.color ?? 'text-muted-foreground'}`}>
            {r != null ? r.toFixed(2) : '—'}
          </p>
          <p className={`text-sm font-semibold mt-1 ${rMeta?.color ?? 'text-muted-foreground'}`}>
            {rMeta?.label ?? 'ข้อมูลยังไม่พอ'}
          </p>
          <div className="mt-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${rBarColor} rounded-full transition-all`} style={{ width: `${rPct}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0.00</span><span>0.50</span><span>1.00</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">ค่าสหสัมพันธ์พอยต์ไบซีเรียล</p>
        </div>
      </div>

      {/* Usage stats */}
      <Card edge="ring" padding="md">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">สถิติการใช้งาน</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'ใช้ในชุดสอบ', value: stats.usedIn, icon: BookOpen, color: 'text-primary' },
            { label: 'ครั้งที่ตอบ', value: stats.attempts, icon: TrendingUp, color: 'text-tint-1' },
            { label: 'ตอบถูก', value: correct, icon: CheckCircle2, color: 'text-success' },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label}>
                <Icon className={`w-4 h-4 ${s.color} mx-auto mb-1`} />
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Guide */}
      <div className="p-4 bg-primary/10 rounded-xl border border-primary/20 text-xs text-primary space-y-1 leading-relaxed">
        <p><strong>p-value</strong> ควรอยู่ระหว่าง 0.30–0.70 เพื่อให้โจทย์มีความยากเหมาะสม</p>
        <p><strong>r-value</strong> ควร ≥ 0.30 ถือว่าโจทย์มีอำนาจจำแนกที่ดีตามมาตรฐาน PISA</p>
      </div>
    </div>
  )
}

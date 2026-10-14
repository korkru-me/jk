'use client'

import { useState } from 'react'
import {
  X, Flag, AlertTriangle, BookOpen, GitBranch, Clock,
  Activity,
} from 'lucide-react'
import { DIFF_META } from '@/lib/question-display'
import { QuestionPreviewContent } from './question-preview'
import { RichText } from '@/components/ui/rich-text'
import { SolutionFiles } from '@/components/questions/solution-files'
import type {
  Variable, MCQOption, MatchingPair, TrueFalseConfig, FillBlankConfig,
  OrderingConfig, FileUploadConfig, RandomQuestionConfig, CompositeConfig,
} from '@/lib/types'
import type { Question } from '@/lib/types'

/** A full question row plus the joined หมวดหมู่ the header prints. */
export type QuestionDetailWithCategory = Question & { question_categories: { name: string } | null }
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'

// ── Mock data helpers ──────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'content' | 'history'

interface Props {
  question: QuestionDetailWithCategory
  isFlagged: boolean
  onClose: () => void
  onToggleFlag: () => void
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export function PreviewModal({ question: q, isFlagged, onClose, onToggleFlag }: Props) {
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
        answerTolerance={q.answer_tolerance ?? undefined}
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
          {q.solution_text && <RichText text={q.solution_text} blocks className="text-sm text-warning leading-relaxed" />}
          <SolutionFiles urls={q.solution_image_urls} alt="รูปประกอบเฉลย" imageClassName="max-h-40 rounded-lg border border-warning/20 object-contain" />
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

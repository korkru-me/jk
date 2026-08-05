'use client'

import { useState } from 'react'
import {
  X, Flag, AlertTriangle, BookOpen, GitBranch, BarChart2, Clock,
  CheckCircle2, TrendingUp, Activity,
} from 'lucide-react'
import { DIFF_META, mockStats } from './question-card'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { RichText } from '@/components/ui/rich-text'
import type {
  Variable, MCQOption, MatchingPair, TrueFalseConfig, FillBlankConfig,
  OrderingConfig, FileUploadConfig, RandomQuestionConfig, CompositeConfig,
} from '@/lib/types'
import type { QuestionWithCategory } from '../page'

// ── Mock data helpers ──────────────────────────────────────────────────────────

function mockVersions(id: string) {
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const count = (h % 2) + 2
  return [
    { ver: '1.0', date: '1 มี.ค. 2568',    author: 'คุณครู',              change: 'สร้างโจทย์ครั้งแรก',              type: 'create' },
    { ver: '1.1', date: '15 เม.ย. 2568',   author: 'ครูวิชัย สมบูรณ์',  change: 'แก้ไขข้อความโจทย์และตัวเลือก',   type: 'edit' },
    { ver: '1.2', date: '10 พ.ค. 2569',    author: 'คุณครู',              change: 'แก้ไขตัวเลือกข้อ ก',             type: 'edit' },
  ].slice(0, count)
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'content' | 'history' | 'stats'

interface Props {
  question: QuestionWithCategory
  isFlagged: boolean
  onClose: () => void
  onToggleFlag: () => void
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export function PreviewModal({ question: q, isFlagged, onClose, onToggleFlag }: Props) {
  const [tab, setTab] = useState<Tab>('content')
  const diff = DIFF_META[q.difficulty]
  const versions = mockVersions(q.id)
  const stats = mockStats(q.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col z-10 overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.color}`}>{diff?.label}</span>
              {q.question_categories?.name && (
                <span className="text-xs text-gray-400">{q.question_categories.name}</span>
              )}
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">{q.question_type}</span>
            </div>
            <h2 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">{q.title}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleFlag}
              title={isFlagged ? 'ยกเลิกการรายงาน' : 'รายงานปัญหา'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                isFlagged ? 'bg-orange-50 text-orange-500' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
              }`}
            >
              <Flag className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Flagged warning */}
        {isFlagged && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-orange-50 border-b border-orange-100 shrink-0">
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
            <p className="text-sm text-orange-700 font-medium">
              โจทย์ข้อนี้ถูกรายงานว่าเฉลยอาจผิดพลาด กรุณาตรวจสอบ
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 px-6 border-b border-gray-100 shrink-0">
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
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
          {tab === 'history' && <HistoryTab versions={versions} />}
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

function InteractiveTab({ q }: { q: QuestionWithCategory }) {
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
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-3">
          <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide mb-2">วิธีทำ / คำอธิบาย</p>
          {q.solution_text && <RichText text={q.solution_text} className="text-sm text-amber-900 leading-relaxed block" />}
          {(q.solution_image_urls ?? []).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {(q.solution_image_urls ?? []).map(url => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="รูปประกอบเฉลย"
                  className="max-h-40 rounded-lg border border-amber-200 object-contain" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {q.tags && q.tags.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">แท็ก</p>
          <div className="flex flex-wrap gap-1.5">
            {q.tags.map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">#{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── History Tab ────────────────────────────────────────────────────────────────

function HistoryTab({ versions }: { versions: ReturnType<typeof mockVersions> }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">ประวัติการแก้ไข</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{versions.length} เวอร์ชัน</span>
      </div>

      <div className="relative">
        <div className="absolute left-3.5 top-4 bottom-4 w-0.5 bg-gray-100" />
        <div className="space-y-4">
          {versions.map((v, i) => (
            <div key={i} className="flex gap-4">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${
                i === 0 ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' : 'bg-white ring-2 ring-gray-200 text-gray-400'
              }`}>
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <div className={`flex-1 p-3.5 rounded-xl border ${
                i === 0 ? 'border-blue-100 bg-blue-50' : 'border-gray-100 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                    i === 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                  }`}>v{v.ver}</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {v.date}
                  </span>
                </div>
                <p className="text-sm text-gray-800 font-medium">{v.change}</p>
                <p className="text-xs text-gray-400 mt-0.5">โดย {v.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-3">
        <Activity className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          ระบบล็อกทุกการเปลี่ยนแปลงโดยอัตโนมัติ เพื่อป้องกันการแก้ไขโจทย์หลังการสอบผ่านไปแล้ว และใช้ตรวจสอบความสมบูรณ์ของข้อสอบ
        </p>
      </div>
    </div>
  )
}

// ── Stats Tab ──────────────────────────────────────────────────────────────────

function StatsTab({ stats }: { stats: ReturnType<typeof mockStats> }) {
  const pPct = Math.round(stats.pVal * 100)
  const rPct = Math.round(stats.rVal * 100)
  const correct = Math.round(stats.pVal * stats.attempts)

  const pLabel = pPct <= 30 ? 'ยากมาก' : pPct <= 50 ? 'ยาก' : pPct <= 70 ? 'ปานกลาง' : 'ง่าย'
  const pColor = pPct <= 30 ? 'text-red-600' : pPct <= 50 ? 'text-orange-600' : pPct <= 70 ? 'text-amber-600' : 'text-green-600'
  const rLabel = stats.rVal >= 0.4 ? 'ดีมาก' : stats.rVal >= 0.3 ? 'ดี' : stats.rVal >= 0.2 ? 'พอใช้' : 'ต่ำ'
  const rBarColor = stats.rVal >= 0.4 ? 'bg-green-400' : stats.rVal >= 0.3 ? 'bg-blue-400' : stats.rVal >= 0.2 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="space-y-4">
      {/* p-value & r-value */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">ค่าความยาก (p-value)</p>
          <p className={`text-4xl font-black leading-none ${pColor}`}>{stats.pVal.toFixed(2)}</p>
          <p className={`text-sm font-semibold mt-1 ${pColor}`}>ระดับ{pLabel}</p>
          {/* Gradient bar */}
          <div className="mt-3 relative">
            <div className="h-2 bg-gradient-to-r from-green-400 via-amber-400 to-red-400 rounded-full" />
            <div
              className="absolute top-0 -translate-x-1/2 w-3 h-2 bg-gray-800 rounded-full"
              style={{ left: `${100 - pPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>ง่าย</span><span>ยาก</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">สัดส่วนนักเรียนที่ตอบถูก</p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">อำนาจจำแนก (r-value)</p>
          <p className={`text-4xl font-black leading-none ${stats.rVal >= 0.4 ? 'text-green-600' : stats.rVal >= 0.3 ? 'text-blue-600' : stats.rVal >= 0.2 ? 'text-amber-600' : 'text-red-600'}`}>{stats.rVal.toFixed(2)}</p>
          <p className={`text-sm font-semibold mt-1 ${stats.rVal >= 0.4 ? 'text-green-600' : stats.rVal >= 0.3 ? 'text-blue-600' : stats.rVal >= 0.2 ? 'text-amber-600' : 'text-red-600'}`}>{rLabel}</p>
          <div className="mt-3">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full ${rBarColor} rounded-full transition-all`} style={{ width: `${rPct}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>0.00</span><span>0.50</span><span>1.00</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">ค่าสหสัมพันธ์พอยต์ไบซีเรียล</p>
        </div>
      </div>

      {/* Usage stats */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">สถิติการใช้งาน</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'ใช้ในชุดสอบ', value: stats.usedIn, icon: BookOpen, color: 'text-blue-500' },
            { label: 'ครั้งที่ตอบ', value: stats.attempts, icon: TrendingUp, color: 'text-purple-500' },
            { label: 'ตอบถูก', value: correct, icon: CheckCircle2, color: 'text-green-500' },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label}>
                <Icon className={`w-4 h-4 ${s.color} mx-auto mb-1`} />
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Guide */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 space-y-1 leading-relaxed">
        <p><strong>p-value</strong> ควรอยู่ระหว่าง 0.30–0.70 เพื่อให้โจทย์มีความยากเหมาะสม</p>
        <p><strong>r-value</strong> ควร ≥ 0.30 ถือว่าโจทย์มีอำนาจจำแนกที่ดีตามมาตรฐาน PISA</p>
      </div>
    </div>
  )
}

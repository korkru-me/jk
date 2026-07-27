'use client'

import { useState } from 'react'
import {
  X, Flag, AlertTriangle, BookOpen, GitBranch, BarChart2, Clock,
  CheckCircle2, TrendingUp, Activity,
} from 'lucide-react'
import { DIFF_META, mockStats } from './question-card'
import { RichText } from '@/components/ui/rich-text'
import { partLabels } from '@/lib/part-labels'
import type { TrueFalseConfig, FileUploadConfig } from '@/lib/types'
import type { QuestionWithCategory } from '../page'

function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url)
}

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
            { key: 'content' as Tab, label: 'โจทย์และเฉลย',      icon: BookOpen },
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
          {tab === 'content' && <ContentTab q={q} />}
          {tab === 'history' && <HistoryTab versions={versions} />}
          {tab === 'stats'   && <StatsTab stats={stats} />}
        </div>
      </div>
    </div>
  )
}

// ── Content Tab ────────────────────────────────────────────────────────────────

function ContentTab({ q }: { q: QuestionWithCategory }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(q.question_text)

  return (
    <div className="space-y-5">
      {/* Question body */}
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">โจทย์</p>
        {isHtml ? (
          <div className="text-gray-900 leading-relaxed rich-text-content" dangerouslySetInnerHTML={{ __html: q.question_text }} />
        ) : (
          <p className="text-gray-900 leading-relaxed whitespace-pre-line">{q.question_text}</p>
        )}
      </div>

      {/* MCQ options */}
      {q.question_type === 'mcq' && q.mcq_options && q.mcq_options.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">ตัวเลือก</p>
          <div className="space-y-2">
            {q.mcq_options.map((opt, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  opt.is_correct ? 'border-green-300 bg-green-50' : 'border-gray-200'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                  opt.is_correct ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'][i]}
                </span>
                <span className={`text-sm leading-relaxed ${opt.is_correct ? 'text-green-800 font-medium' : 'text-gray-700'}`}>
                  {opt.text}
                  {opt.is_correct && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-green-600 text-xs font-medium">
                      <CheckCircle2 className="w-3 h-3" /> เฉลยที่ถูกต้อง
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Written / random answer */}
      {(q.question_type === 'written' || q.is_random) && (q.answer_formula || q.answer_parts?.length) && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1.5">เฉลย</p>
          {q.answer_parts && q.answer_parts.length > 0 ? (
            <div className="space-y-1">
              {q.answer_parts.map((part, i) => (
                <p key={i} className="text-sm text-blue-900 font-medium">
                  {part.sub_text && (
                    <span className="text-blue-500 mr-2">
                      <RichText text={part.sub_text} />:
                    </span>
                  )}
                  {part.formula} {part.unit}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-blue-900 font-medium">{q.answer_formula} {q.answer_unit ?? ''}</p>
          )}
        </div>
      )}

      {/* Essay */}
      {q.question_type === 'essay' && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1">เฉลย</p>
          <p className="text-sm text-blue-400 italic">ตรวจโดยครู (อัตนัย)</p>
        </div>
      )}

      {/* File upload */}
      {q.question_type === 'file_upload' && (() => {
        const attachmentUrls = (q.extra_data as FileUploadConfig)?.attachment_urls ?? []
        return (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-2">
            <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1">เฉลย</p>
            <p className="text-sm text-blue-400 italic">
              นักเรียนแนบไฟล์คำตอบ — ให้คะแนนเต็มอัตโนมัติเมื่อมีการแนบไฟล์อย่างน้อย 1 ไฟล์
            </p>
            {attachmentUrls.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1">
                {attachmentUrls.map((url) => (
                  isPdfUrl(url) ? (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 transition-colors px-1.5"
                    >
                      <span className="text-lg">📄</span>
                      <span className="text-[9px] text-blue-500 text-center truncate w-full">PDF</span>
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="ไฟล์อ้างอิงโจทย์" className="w-20 h-20 rounded-lg object-cover border border-blue-200" />
                  )
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* True/False */}
      {q.question_type === 'true_false' && q.extra_data && 'correct_answer' in q.extra_data && (() => {
        const tf = q.extra_data as TrueFalseConfig
        const statements = tf.statements ?? []
        if (statements.length === 0) {
          return (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1">เฉลย</p>
              <p className="text-sm font-bold text-blue-900">
                {tf.correct_answer ? '✓ ถูก (True)' : '✗ ผิด (False)'}
              </p>
            </div>
          )
        }
        const labels = partLabels(tf.part_label_style)
        return (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-1.5">
            <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1">เฉลย</p>
            <p className="text-sm font-bold text-blue-900">{labels[0]}) {tf.correct_answer ? '✓ ถูก' : '✗ ผิด'}</p>
            {statements.map((s, i) => (
              <p key={s.id} className="text-sm font-bold text-blue-900">
                {labels[i + 1] ?? i + 2}) {s.correct_answer ? '✓ ถูก' : '✗ ผิด'}
                {s.text && <RichText text={s.text} className="ml-2 font-normal text-blue-700" />}
              </p>
            ))}
          </div>
        )
      })()}

      {/* Solution text */}
      {q.solution_text && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide mb-2">วิธีทำ / คำอธิบาย</p>
          <p className="text-sm text-amber-900 leading-relaxed">{q.solution_text}</p>
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

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Eye, Share2, Flag, Edit2, Trash2, AlertTriangle, Copy, Download,
  Users, TrendingUp, BookOpen,
} from 'lucide-react'
import { deleteQuestion, setRequiresWorkImage } from '@/lib/actions/questions'
import { exportQuestions } from '@/lib/actions/question-export'
import { storeDuplicateSeed, NEW_QUESTION_ROUTE_BY_TYPE } from '@/lib/question-duplicate'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { downloadTextFile } from '@/lib/utils'
import type { QuestionWithCategory } from '../page'

export const DIFF_META: Record<string, { label: string; color: string; bar: string }> = {
  easy:       { label: 'ง่าย',       color: 'bg-green-100 text-green-700',   bar: 'bg-green-400' },
  medium:     { label: 'ปานกลาง',   color: 'bg-amber-100 text-amber-700',   bar: 'bg-amber-400' },
  hard:       { label: 'ยาก',        color: 'bg-red-100 text-red-700',       bar: 'bg-red-400' },
  analytical: { label: 'วิเคราะห์',  color: 'bg-purple-100 text-purple-700', bar: 'bg-purple-400' },
}

export const TYPE_LABEL: Record<string, string> = {
  mcq: 'ปรนัย', written: 'อัตนัย', essay: 'บรรยาย',
  true_false: 'ถ/ผ', fill_blank: 'เติมคำ', matching: 'จับคู่', ordering: 'เรียงลำดับ',
  file_upload: 'ไฟล์งาน', composite: 'โจทย์ผสม',
}

export function mockStats(id: string) {
  const h = [...id].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  const pVal = (((h * 2654435761) >>> 0) % 71 + 20) / 100
  const rVal = (((h * 1234567891) >>> 0) % 46 + 20) / 100
  const usedIn = (((h * 987654321) >>> 0) % 8)
  const attempts = (((h * 111111111) >>> 0) % 50 + 10)
  return { pVal, rVal, usedIn, attempts }
}

export interface Teacher { id: string; name: string; initials: string; color: string }

interface Props {
  question: QuestionWithCategory
  isFlagged: boolean
  onPreview: () => void
  onToggleFlag: () => void
  teachers: Teacher[]
}

export function QuestionCard({ question: q, isFlagged, onPreview, onToggleFlag, teachers }: Props) {
  const router = useRouter()
  const [shareOpen, setShareOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [requiresWorkImage, setRequiresWorkImageLocal] = useState(q.requires_work_image)
  const { pVal, rVal, usedIn } = mockStats(q.id)
  const diff = DIFF_META[q.difficulty]
  const isGroup = q.order_in_group === 0

  const pPercent = Math.round(pVal * 100)
  const pDiffLabel = pPercent <= 30 ? 'ยากมาก' : pPercent <= 50 ? 'ยาก' : pPercent <= 70 ? 'ปานกลาง' : 'ง่าย'
  const rLabel = rVal >= 0.4 ? 'ดีมาก' : rVal >= 0.3 ? 'ดี' : rVal >= 0.2 ? 'พอใช้' : 'ต่ำ'
  const rColor = rVal >= 0.4 ? 'text-green-600' : rVal >= 0.3 ? 'text-blue-600' : rVal >= 0.2 ? 'text-amber-600' : 'text-red-500'

  function handleDelete() {
    if (!confirm('ลบโจทย์นี้? ไม่สามารถกู้คืนได้')) return
    startTransition(async () => { await deleteQuestion(q.id) })
  }

  function handleDuplicate() {
    storeDuplicateSeed(q)
    router.push(`/questions/new/${NEW_QUESTION_ROUTE_BY_TYPE[q.question_type]}`)
  }

  function handleExport() {
    setShareOpen(false)
    startTransition(async () => {
      const result = await exportQuestions([q.id])
      if ('error' in result) { toast.error(result.error); return }
      downloadTextFile(result.filename, result.content)
      toast.success('ดาวน์โหลดไฟล์โจทย์แล้ว')
    })
  }

  function handleToggleWorkImage(next: boolean) {
    setRequiresWorkImageLocal(next)
    startTransition(async () => {
      const result = await setRequiresWorkImage(q.id, next)
      if (result?.error) {
        setRequiresWorkImageLocal(!next)
        toast.error(result.error)
      }
    })
  }

  return (
    <div className={`@container bg-white rounded-2xl ring-1 transition-all hover:shadow-sm group ${
      isFlagged ? 'ring-orange-300 hover:ring-orange-400' : 'ring-black/5 hover:ring-blue-200'
    }`}>
      {/* Flagged banner */}
      {isFlagged && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-t-2xl border-b border-orange-100">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          <p className="text-xs text-orange-700 font-medium">
            โจทย์ข้อนี้ถูกรายงานว่าเฉลยอาจผิดพลาด กรุณาตรวจสอบ
          </p>
        </div>
      )}

      <div className="p-4">
        <div className="flex flex-col @md:flex-row @md:items-start gap-3">
          {/* Left: content */}
          <div className="flex-1 min-w-0">
            {/* Badge row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {isGroup && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">📚 หลายขั้นตอน</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.color}`}>
                {diff?.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {TYPE_LABEL[q.question_type] ?? q.question_type}
              </span>
              {q.question_categories?.name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  {q.question_categories.name}
                </span>
              )}
              {(q.tags ?? []).slice(0, 2).map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100">
                  #{tag}
                </span>
              ))}
            </div>

            {/* Work-image requirement toggle (written questions only) */}
            {q.question_type === 'written' && (
              <div className="flex items-center gap-2 mb-2">
                <ToggleSwitch checked={requiresWorkImage} onChange={handleToggleWorkImage} disabled={isPending} />
                <span className="text-xs text-gray-500">บังคับแนบรูปวิธีทำ</span>
              </div>
            )}

            {/* Title */}
            <button
              onClick={onPreview}
              className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left line-clamp-1 w-full"
            >
              {q.title}
            </button>

            {/* Question text preview */}
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{q.question_text}</p>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pt-3 border-t border-gray-50">
              {/* p-value bar */}
              <div className="flex-1 min-w-0 max-w-[180px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">ความยาก (p={pVal.toFixed(2)})</span>
                  <span className="text-[10px] font-semibold text-gray-600">{pPercent}% · {pDiffLabel}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${diff?.bar}`}
                    style={{ width: `${pPercent}%` }}
                  />
                </div>
              </div>

              {/* r-value */}
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-gray-400">อำนาจจำแนก</p>
                <p className={`text-xs font-bold ${rColor}`}>
                  r={rVal.toFixed(2)} <span className="font-normal text-gray-400">({rLabel})</span>
                </p>
              </div>

              {/* Usage count */}
              {usedIn > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-gray-400">ใช้ใน</p>
                  <p className="text-xs font-bold text-gray-600">{usedIn} ชุดสอบ</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: actions (always visible on hover) */}
          <div className="flex flex-wrap items-center justify-between @md:flex-col @md:items-end @md:justify-start gap-1.5 @md:shrink-0">
            {/* Primary action: preview */}
            <button
              onClick={onPreview}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
            >
              <Eye className="w-3.5 h-3.5" /> ดูตัวอย่าง
            </button>

            {/* Secondary actions row */}
            <div className="flex items-center flex-wrap gap-0.5">
              {/* Share */}
              <div className="relative">
                <button
                  onClick={() => setShareOpen(o => !o)}
                  title="แชร์ให้ครูท่านอื่น"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-violet-500 hover:bg-violet-50 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                {shareOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShareOpen(false)} />
                    <div className="absolute right-0 top-8 z-40 bg-white rounded-xl shadow-xl ring-1 ring-black/10 w-52 overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-gray-50">
                        <p className="text-xs font-semibold text-gray-500">แชร์ให้ครูท่านอื่น</p>
                      </div>
                      {!isGroup && (
                        <button
                          onClick={handleExport}
                          disabled={isPending}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 disabled:opacity-50"
                        >
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-100 text-gray-500">
                            <Download className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-sm text-gray-700">ดาวน์โหลดเป็นไฟล์ (ส่งให้ครูต่างโรงเรียน)</span>
                        </button>
                      )}
                      {teachers.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            toast.success(`แชร์ให้ ${t.name} แล้ว`)
                            setShareOpen(false)
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${t.color}`}>
                            {t.initials}
                          </span>
                          <span className="text-sm text-gray-700">{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Flag */}
              <button
                onClick={onToggleFlag}
                title={isFlagged ? 'ยกเลิกการรายงาน' : 'รายงานปัญหา'}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${
                  isFlagged
                    ? 'text-orange-500 bg-orange-50'
                    : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
              </button>

              {/* Duplicate (non-group only) */}
              {!isGroup && (
                <button
                  onClick={handleDuplicate}
                  title="ทำสำเนาเพื่อแก้ไข"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Edit */}
              <Link
                href={isGroup ? `/questions/multi/${q.group_id}` : `/questions/${q.id}/edit`}
                title="แก้ไข"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Link>

              {/* Delete (non-group only) */}
              {!isGroup && (
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  title="ลบโจทย์"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

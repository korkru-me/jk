'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Question } from '@/lib/types'

export const DIFF_META: Record<string, { label: string; color: string }> = {
  easy:       { label: 'ง่าย',      color: 'bg-green-50 text-green-700 border-green-200' },
  medium:     { label: 'กลาง',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  hard:       { label: 'ยาก',       color: 'bg-red-50 text-red-700 border-red-200' },
  analytical: { label: 'วิเคราะห์', color: 'bg-purple-50 text-purple-700 border-purple-200' },
}

export const TYPE_SHORT: Record<string, string> = {
  mcq: 'MCQ', written: 'เขียน', matching: 'จับคู่', essay: 'บรรยาย',
  true_false: 'ถ/ผ', fill_blank: 'เติมคำ', ordering: 'เรียง',
}

interface Props {
  questions: Question[]
  selectedIds: string[]
  onToggle: (id: string) => void
  search: string
  onSearchChange: (v: string) => void
  diffFilter: string
  onDiffFilterChange: (v: string) => void
  title?: string
}

export function QuestionPicker({
  questions, selectedIds, onToggle, search, onSearchChange, diffFilter, onDiffFilterChange,
  title = 'เลือกโจทย์',
}: Props) {
  const filteredQs = questions.filter(q => {
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false
    if (search && !q.title.toLowerCase().includes(search.toLowerCase()) && !q.question_text.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
          {selectedIds.length} ข้อที่เลือก
        </span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="ค้นหาโจทย์..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {['all', 'easy', 'medium', 'hard', 'analytical'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => onDiffFilterChange(d)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                diffFilter === d ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {d === 'all' ? 'ทั้งหมด' : DIFF_META[d]?.label ?? d}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
        {filteredQs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">ไม่พบโจทย์ที่ตรงกัน</div>
        ) : filteredQs.map(q => {
          const diff = DIFF_META[q.difficulty]
          const isSelected = selectedIds.includes(q.id)
          return (
            <label
              key={q.id}
              className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                isSelected ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(q.id)}
                className="mt-0.5 accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{q.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{q.question_text}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded border ${diff?.color ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  {diff?.label ?? q.difficulty}
                </span>
                <span className="text-xs text-gray-400">{TYPE_SHORT[q.question_type] ?? q.question_type}</span>
              </div>
            </label>
          )
        })}
      </div>

      {selectedIds.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">โจทย์ที่เลือก ({selectedIds.length} ข้อ)</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedIds.map((id, i) => {
              const q = questions.find(qq => qq.id === id)
              return (
                <span key={id} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                  <span className="text-gray-400 font-medium">{i + 1}.</span>
                  <span className="truncate max-w-[120px]">{q?.title ?? id}</span>
                  <button
                    type="button"
                    onClick={() => onToggle(id)}
                    className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                  >×</button>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createAssignment } from '@/lib/actions/assignments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Check, ChevronRight, ChevronLeft, Search, Eye, Timer,
  BookOpen, Globe, Calendar, Shuffle, FileText,
} from 'lucide-react'
import type { Question, Classroom } from '@/lib/types'

const STEPS = ['ข้อมูลพื้นฐาน', 'เลือกโจทย์', 'ตั้งค่า', 'กำหนดการสอบ']

const DIFF_META: Record<string, { label: string; color: string }> = {
  easy:       { label: 'ง่าย',      color: 'bg-green-50 text-green-700 border-green-200' },
  medium:     { label: 'กลาง',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  hard:       { label: 'ยาก',       color: 'bg-red-50 text-red-700 border-red-200' },
  analytical: { label: 'วิเคราะห์', color: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const TYPE_SHORT: Record<string, string> = {
  mcq: 'MCQ', written: 'เขียน', matching: 'จับคู่', essay: 'บรรยาย',
  true_false: 'ถ/ผ', fill_blank: 'เติมคำ', ordering: 'เรียง',
}

interface Props {
  classrooms: Classroom[]
  questions: Question[]
}

export function CreateAssignmentForm({ classrooms, questions }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Step 1
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '')
  const [mode, setMode] = useState<'online' | 'print'>('online')

  // Step 2
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  // Step 3
  const [duration, setDuration] = useState('')
  const [shuffleQ, setShuffleQ] = useState(false)
  const [shuffleA, setShuffleA] = useState(false)
  const [showResults, setShowResults] = useState(true)

  // Step 4
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  const filteredQs = questions.filter(q => {
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false
    if (search && !q.title.toLowerCase().includes(search.toLowerCase()) && !q.question_text.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function toggleQ(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function canNext() {
    if (step === 0) return title.trim().length > 0 && classroomId.length > 0 && classrooms.length > 0
    if (step === 1) return selectedIds.length > 0
    return true
  }

  function handleSubmit() {
    startTransition(async () => {
      const res = await createAssignment({
        classroom_id: classroomId,
        title: title.trim(),
        description: description.trim(),
        question_ids: selectedIds,
        start_at: startAt || null,
        end_at: endAt || null,
        duration_minutes: duration ? Number(duration) : null,
        mode,
      })
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-start">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < step  ? 'bg-blue-500 text-white' :
                i === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <p className={`text-xs mt-1 whitespace-nowrap ${i === step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mt-4 transition-all ${i < step ? 'bg-blue-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: ข้อมูลพื้นฐาน ─────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">ข้อมูลพื้นฐาน</h2>

            <div className="space-y-1.5">
              <Label htmlFor="title">ชื่อชุดข้อสอบ <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="เช่น แบบทดสอบกลางภาค บทที่ 1–3"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">คำอธิบาย</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>ห้องเรียน <span className="text-red-500">*</span></Label>
              {classrooms.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  ยังไม่มีห้องเรียน กรุณา{' '}
                  <a href="/classrooms" className="underline font-medium">สร้างห้องเรียน</a> ก่อน
                </div>
              ) : (
                <div className="grid gap-2">
                  {classrooms.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClassroomId(c.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        classroomId === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        classroomId === c.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        {c.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{c.description}</p>}
                      </div>
                      {classroomId === c.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">โหมดการสอบ</h2>
            <div className="grid grid-cols-2 gap-3">
              {(['online', 'print'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    mode === m ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-2">{m === 'online' ? '💻' : '🖨️'}</div>
                  <p className="font-medium text-sm text-gray-900">{m === 'online' ? 'ออนไลน์' : 'พิมพ์ใบงาน'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m === 'online' ? 'นักเรียนทำบนเว็บ + จับเวลา' : 'สร้าง PDF พร้อม QR Code'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: เลือกโจทย์ ────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">เลือกโจทย์</h2>
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
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {['all', 'easy', 'medium', 'hard', 'analytical'].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiffFilter(d)}
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
                    onChange={() => toggleQ(q.id)}
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
                        onClick={() => toggleQ(id)}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                      >×</button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: ตั้งค่า ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">ตั้งค่าการสอบ</h2>

          <div className="space-y-1.5">
            <Label htmlFor="dur" className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-gray-400" /> เวลาทำ (นาที)
            </Label>
            <Input
              id="dur"
              type="number"
              min={1}
              value={duration}
              onChange={e => setDuration(e.target.value)}
              placeholder="ไม่จำกัด (เว้นว่าง)"
              className="max-w-[200px]"
            />
          </div>

          <div className="space-y-2">
            {[
              {
                label: 'สับลำดับข้อ',
                desc: 'นักเรียนแต่ละคนได้ลำดับข้อต่างกัน',
                icon: Shuffle,
                value: shuffleQ,
                set: setShuffleQ,
              },
              {
                label: 'สับลำดับตัวเลือก (MCQ)',
                desc: 'ตัวเลือก A–D สลับสำหรับแต่ละคน',
                icon: Shuffle,
                value: shuffleA,
                set: setShuffleA,
              },
              {
                label: 'แสดงผลทันทีหลังส่ง',
                desc: 'นักเรียนเห็นคะแนนและเฉลยหลังส่งงาน',
                icon: Eye,
                value: showResults,
                set: setShowResults,
              },
            ].map(opt => {
              const Icon = opt.icon
              return (
                <label
                  key={opt.label}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.desc}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={opt.value}
                    onChange={e => opt.set(e.target.checked)}
                    className="accent-blue-600 w-4 h-4 shrink-0"
                  />
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Step 4: กำหนดการสอบ ───────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" /> กำหนดการสอบ (ไม่บังคับ)
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sat">เปิดรับตั้งแต่</Label>
                <Input id="sat" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eat">ปิดรับเมื่อ</Label>
                <Input id="eat" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
            <h3 className="font-bold text-base mb-4">สรุปก่อนสร้าง</h3>
            <div className="space-y-2.5 text-sm">
              {[
                { label: 'ชื่อ',      value: title },
                { label: 'ห้องเรียน', value: classrooms.find(c => c.id === classroomId)?.name ?? '—' },
                { label: 'โจทย์',     value: `${selectedIds.length} ข้อ` },
                { label: 'โหมด',      value: mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์' },
                ...(duration ? [{ label: 'เวลา', value: `${duration} นาที` }] : []),
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-4">
                  <span className="text-gray-400">{row.label}</span>
                  <span className="font-medium text-right truncate max-w-[200px]">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4 border-t border-white/10 pt-3">
              ชุดข้อสอบจะถูกบันทึกเป็นร่าง — เผยแพร่ได้จากหน้ารายละเอียด
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => step > 0 ? setStep(s => s - 1) : router.back()}
          className="gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext()}
            className="gap-2"
          >
            ถัดไป <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {isPending ? 'กำลังสร้าง...' : 'สร้างชุดข้อสอบ'}
          </Button>
        )}
      </div>
    </div>
  )
}

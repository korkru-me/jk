'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calendar, Clock, Layers, Target, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateAssignment } from '@/lib/actions/assignments'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import type { Assignment, ScoreStrategy } from '@/lib/types'

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  assignment: Assignment
}

export function EditAssignmentForm({ assignment: a }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(a.title)
  const [description, setDescription] = useState(a.description ?? '')
  const [startAt, setStartAt] = useState(toLocalInputValue(a.start_at))
  const [endAt, setEndAt] = useState(toLocalInputValue(a.end_at))
  const [durationMinutes, setDurationMinutes] = useState(a.duration_minutes ? String(a.duration_minutes) : '')
  const [maxAttempts, setMaxAttempts] = useState(
    a.max_attempts ? String(a.max_attempts) : a.type === 'exam' ? '1' : ''
  )
  const [scoreStrategy, setScoreStrategy] = useState<ScoreStrategy>(a.score_strategy)
  const [passingEnabled, setPassingEnabled] = useState(a.passing_type != null && a.passing_value != null)
  const [passingType, setPassingType] = useState<'score' | 'percent'>(a.passing_type ?? 'percent')
  const [passingValue, setPassingValue] = useState(a.passing_value != null ? String(a.passing_value) : '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรุณากรอกชื่อชุดข้อสอบ'); return }

    startTransition(async () => {
      const res = await updateAssignment(a.id, {
        title: title.trim(),
        description,
        start_at: startAt || null,
        end_at: endAt || null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        max_attempts: maxAttempts ? Number(maxAttempts) : null,
        score_strategy: scoreStrategy,
        passing_type: passingEnabled && passingValue ? passingType : null,
        passing_value: passingEnabled && passingValue ? Number(passingValue) : null,
      })
      if (res?.error) { toast.error(res.error); return }
      toast.success('บันทึกการแก้ไขแล้ว')
      router.push(`/assignments/${a.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">ชื่อชุดข้อสอบ</Label>
          <Input id="edit-title" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-desc">คำอธิบาย</Label>
          <Textarea id="edit-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" /> กำหนดการ
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-sat">เปิดรับตั้งแต่</Label>
            <Input id="edit-sat" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-eat">ปิดรับเมื่อ</Label>
            <Input id="edit-eat" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-duration" className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" /> เวลาทำ (นาที)
          </Label>
          <Input
            id="edit-duration"
            type="number"
            min={1}
            value={durationMinutes}
            onChange={e => setDurationMinutes(e.target.value)}
            placeholder="ไม่จำกัด (เว้นว่าง)"
            className="max-w-[200px]"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-all">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">ตั้งเกณฑ์คะแนนผ่าน</p>
                <p className="text-xs text-gray-400">
                  {a.type === 'exercise'
                    ? 'นักเรียนที่ยังไม่ผ่านจะเห็นข้อความชวนทำใหม่'
                    : 'ครูจะเห็นว่านักเรียนคนไหนสอบผ่าน/ไม่ผ่าน'}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={passingEnabled}
              onChange={e => setPassingEnabled(e.target.checked)}
              className="accent-blue-600 w-4 h-4 shrink-0"
            />
          </label>

          {passingEnabled && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-gray-200">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                {(['percent', 'score'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPassingType(t)}
                    className={`px-3 py-2 text-xs font-medium transition-all ${
                      passingType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'percent' ? 'เปอร์เซ็นต์' : 'คะแนน'}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                min={0}
                max={passingType === 'percent' ? 100 : undefined}
                value={passingValue}
                onChange={e => setPassingValue(e.target.value)}
                placeholder={passingType === 'percent' ? 'เช่น 70' : 'เช่น 7'}
                className="max-w-[120px]"
              />
              <span className="text-sm text-gray-500 shrink-0">
                {passingType === 'percent' ? '% ของคะแนนเต็ม' : 'คะแนน'}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-attempts" className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-gray-400" /> จำกัดจำนวนครั้งที่ทำได้
          </Label>
          <Input
            id="edit-attempts"
            type="number"
            min={1}
            value={maxAttempts}
            onChange={e => setMaxAttempts(e.target.value)}
            placeholder="ไม่จำกัด (เว้นว่าง)"
            className="max-w-[200px]"
          />
        </div>

        {maxAttempts !== '1' && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-gray-400" /> เลือกคะแนนของนักเรียนจาก
            </Label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
              {(Object.keys(SCORE_STRATEGY_LABELS) as ScoreStrategy[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScoreStrategy(s)}
                  className={`px-3 py-2 text-xs font-medium transition-all ${
                    scoreStrategy === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {SCORE_STRATEGY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2 text-sm text-amber-800">
        <FileText className="w-4 h-4 shrink-0 mt-0.5" />
        <p>แก้ไขได้เฉพาะกำหนดการและรายละเอียด — โจทย์และห้องเรียนที่มอบหมายไว้จะไม่เปลี่ยน</p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}

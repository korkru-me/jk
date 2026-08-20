'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calendar, Clock, Layers, Target, FileText, Scale, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateAssignment } from '@/lib/actions/assignments'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import type { Assignment, Question, ScoreStrategy, ShowResultsMode } from '@/lib/types'

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  assignment: EditableAssignment
  questions: EditableAssignmentQuestion[]
}

export type EditableAssignment = Pick<
  Assignment,
  | 'id'
  | 'title'
  | 'description'
  | 'question_ids'
  | 'question_points'
  | 'display_max_score'
  | 'start_at'
  | 'end_at'
  | 'duration_minutes'
  | 'max_attempts'
  | 'type'
  | 'score_strategy'
  | 'passing_type'
  | 'passing_value'
  | 'show_results'
>

export type EditableAssignmentQuestion = Pick<Question, 'id' | 'title' | 'question_text'>

export function EditAssignmentForm({ assignment: a, questions }: Props) {
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
  const [showResults, setShowResults] = useState<ShowResultsMode>(a.show_results)
  const [passingEnabled, setPassingEnabled] = useState(a.passing_type != null && a.passing_value != null)
  const [passingType, setPassingType] = useState<'score' | 'percent'>(a.passing_type ?? 'percent')
  const [passingValue, setPassingValue] = useState(a.passing_value != null ? String(a.passing_value) : '')

  // Every question defaults to 1 point (or its existing override); teacher
  // can edit individual questions and the total recalculates automatically.
  const [questionPointDrafts, setQuestionPointDrafts] = useState<Record<string, string>>(
    Object.fromEntries(questions.map(q => [q.id, String(a.question_points?.[q.id] ?? 1)]))
  )

  const pointsSum = Math.round(
    questions.reduce((sum, q) => sum + (Number.parseFloat(questionPointDrafts[q.id] ?? '1') || 0), 0) * 100
  ) / 100

  // Independent from the per-question points above — this only rescales
  // what's *reported* (gradebook, results, exports), never the underlying
  // question structure. Safe to change any time, even after students have
  // already finished, since it's applied at display time from each
  // submission's already-stored raw score rather than being baked in.
  const [displayMaxScore, setDisplayMaxScore] = useState(
    a.display_max_score != null ? String(a.display_max_score) : ''
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรุณากรอกชื่อชุดข้อสอบ'); return }

    const questionPoints = Object.fromEntries(
      questions.map(q => {
        const parsed = Number.parseFloat(questionPointDrafts[q.id] ?? '1')
        return [q.id, Number.isFinite(parsed) && parsed > 0 ? parsed : 1] as const
      })
    )

    const parsedDisplayMax = Number.parseFloat(displayMaxScore)
    const displayMax = displayMaxScore.trim() !== '' && Number.isFinite(parsedDisplayMax) && parsedDisplayMax > 0
      ? parsedDisplayMax
      : null

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
        question_points: questionPoints,
        display_max_score: displayMax,
        show_results: showResults,
      })
      if (res?.error) { toast.error(res.error); return }
      toast.success('บันทึกการแก้ไขแล้ว')
      router.push(`/assignments/${a.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">ชื่อชุดข้อสอบ</Label>
          <Input id="edit-title" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-desc">คำอธิบาย</Label>
          <Textarea id="edit-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">คะแนนแต่ละข้อ</h2>
          <span className="text-sm font-semibold text-primary">รวม {pointsSum} คะแนน</span>
        </div>
        <p className="text-xs text-muted-foreground">
          ค่าเริ่มต้นข้อละ 1 คะแนน — แก้ไขคะแนนข้อไหนก็ได้ ระบบจะรวมคะแนนทั้งหมดให้อัตโนมัติ
        </p>

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border">
              <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">ข้อ {i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                <p className="text-xs text-muted-foreground truncate">{q.question_text}</p>
              </div>
              <Input
                type="number"
                min={0}
                step="any"
                value={questionPointDrafts[q.id] ?? '1'}
                onChange={e => setQuestionPointDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                className="w-20 text-center shrink-0"
              />
              <span className="text-xs text-muted-foreground shrink-0">คะแนน</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">คะแนนเต็มที่แสดงผล</h2>
            <p className="text-xs text-muted-foreground">
              ปรับแยกจากคะแนนแต่ละข้อด้านบน — ใช้ตอนอยากให้คะแนนที่บันทึก/แสดงในสมุดคะแนนไม่เท่ากับผลรวมคะแนนจริง
              เช่น โจทย์รวม {pointsSum} คะแนน แต่อยากเก็บแค่ 10 คะแนน ระบบจะคูณสัดส่วนคะแนนของนักเรียนแต่ละคนให้อัตโนมัติ
              ปรับได้ตลอด แม้นักเรียนจะทำเสร็จไปแล้วก็ตาม (คะแนนดิบที่ทำจริงไม่ถูกแก้ไข)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-11">
          <Input
            type="number"
            min={0}
            step="any"
            value={displayMaxScore}
            onChange={e => setDisplayMaxScore(e.target.value)}
            placeholder={`ไม่ปรับ (เท่ากับ ${pointsSum})`}
            className="max-w-[160px]"
          />
          <span className="text-sm text-muted-foreground">คะแนน</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-1.5">
        <label className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Target className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">ตั้งเกณฑ์คะแนนผ่าน</p>
              <p className="text-xs text-muted-foreground">
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
            className="accent-primary w-4 h-4 shrink-0"
          />
        </label>

        {passingEnabled && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-border">
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              {(['percent', 'score'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPassingType(t)}
                  className={`px-3 py-2 text-xs font-medium transition-all ${
                    passingType === t ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
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
            <span className="text-sm text-muted-foreground shrink-0">
              {passingType === 'percent' ? '% ของคะแนนเต็ม' : 'คะแนน'}
            </span>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" /> กำหนดการ
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
            <Clock className="w-4 h-4 text-muted-foreground" /> เวลาทำ (นาที)
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

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-muted-foreground" /> แสดงผลลัพธ์
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: 'immediate', label: 'ทันทีหลังส่ง', desc: 'เห็นคะแนน+เฉลยทันที' },
              { key: 'score_only', label: 'แสดงคะแนน แต่ไม่แสดงเฉลย', desc: 'เห็นคะแนนรวม แต่ซ่อนคำตอบรายข้อ' },
              { key: 'after_due', label: 'หลังพ้นกำหนดส่ง', desc: 'ซ่อนเฉลยจนกว่าจะหมดเขต' },
              { key: 'never', label: 'ไม่แสดงผลลัพธ์', desc: 'เห็นเพียงว่าส่งสำเร็จ' },
            ] as const).map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => setShowResults(option.key)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  showResults === option.key
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-ring'
                }`}
              >
                <p className="font-medium text-sm text-foreground">{option.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{option.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-attempts" className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-muted-foreground" /> จำกัดจำนวนครั้งที่ทำได้
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
              <Target className="w-4 h-4 text-muted-foreground" /> เลือกคะแนนของนักเรียนจาก
            </Label>
            <div className="flex rounded-lg border border-border overflow-hidden w-fit">
              {(Object.keys(SCORE_STRATEGY_LABELS) as ScoreStrategy[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScoreStrategy(s)}
                  className={`px-3 py-2 text-xs font-medium transition-all ${
                    scoreStrategy === s ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {SCORE_STRATEGY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-2 text-sm text-amber-800">
        <FileText className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          แก้ไขได้เฉพาะกำหนดการ รายละเอียด คะแนน และการแสดงผลลัพธ์ — โจทย์และห้องเรียนที่มอบหมายไว้จะไม่เปลี่ยน
          (การเปลี่ยน &ldquo;คะแนนแต่ละข้อ&rdquo; จะมีผลกับการทำครั้งใหม่เท่านั้น ไม่กระทบคะแนนที่นักเรียนทำไปแล้ว
          ส่วน &ldquo;คะแนนเต็มที่แสดงผล&rdquo; ปรับได้ตลอดและมีผลย้อนหลังกับทุกครั้งที่ทำไปแล้วทันที)
        </p>
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

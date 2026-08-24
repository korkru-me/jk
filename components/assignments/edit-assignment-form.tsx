'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calendar, Clock, Layers, Target, FileText, Scale, Eye, ShieldCheck, Maximize, Fingerprint, ListFilter, ChevronUp, ChevronDown, X, Plus, Lock } from 'lucide-react'
import {
  moveQuestionInSet, moveQuestionToIndex, normalizeSetSections, parseSections, removeQuestionsFromSet,
} from '@/lib/question-set-sections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateAssignment } from '@/lib/actions/assignments'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import type { Assignment, Question, ScoreStrategy, ShowResultsMode } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { QuestionPicker } from '@/components/assignments/question-picker'
import type { BankQuestion } from '@/lib/question-bank'
import { questionExcerpt } from '@/lib/question-display'

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  assignment: EditableAssignment
  questions: EditableAssignmentQuestion[]
  /** This teacher's whole bank, for the "เพิ่มโจทย์" picker. */
  bank: BankQuestion[]
  /** True once anyone has started an attempt — the question set is then frozen. */
  hasSubmissions: boolean
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
  | 'mode'
  | 'type'
  | 'score_strategy'
  | 'passing_type'
  | 'passing_value'
  | 'show_results'
  | 'sections'
  | 'show_sections'
  | 'proctoring_enabled'
  | 'fullscreen_required'
  | 'block_clipboard'
  | 'random_question_count'
  | 'exam_watermark_enabled'
>

export type EditableAssignmentQuestion = Pick<Question, 'id' | 'title' | 'question_text'>

export function EditAssignmentForm({ assignment: a, questions, bank, hasSubmissions }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const assignmentSections = parseSections(a.sections)

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
  const [showSections, setShowSections] = useState(a.show_sections !== false)
  const [proctoringEnabled, setProctoringEnabled] = useState(a.proctoring_enabled)
  const [fullscreenRequired, setFullscreenRequired] = useState(a.fullscreen_required)
  const [blockClipboard, setBlockClipboard] = useState(a.block_clipboard)
  const [randomQuestionCount, setRandomQuestionCount] = useState(
    a.random_question_count != null ? String(a.random_question_count) : ''
  )
  const [examWatermarkEnabled, setExamWatermarkEnabled] = useState(a.exam_watermark_enabled)
  const [passingEnabled, setPassingEnabled] = useState(a.passing_type != null && a.passing_value != null)
  const [passingType, setPassingType] = useState<'score' | 'percent'>(a.passing_type ?? 'percent')
  const [passingValue, setPassingValue] = useState(a.passing_value != null ? String(a.passing_value) : '')

  // ── The question set ────────────────────────────────────────────────────
  // Editable only while no attempt exists: every attempt freezes the set (and
  // its คะแนนเต็ม) as it starts, so changing it afterwards would give later
  // students a different paper from the same งาน. The server enforces this
  // too — these controls only keep the teacher from trying.
  const [questionIds, setQuestionIds] = useState<string[]>(questions.map(q => q.id))
  const [sections, setSections] = useState(assignmentSections)
  const canEditQuestions = !hasSubmissions

  // Titles for everything that could end up in the list: the questions the
  // assignment came with, plus the bank the picker adds from.
  const questionsById = new Map<string, { id: string; title: string; question_text: string }>()
  for (const q of [...questions, ...bank]) questionsById.set(q.id, q)
  const orderedQuestions = questionIds.map(
    id => questionsById.get(id) ?? { id, title: 'โจทย์ที่ไม่พบ', question_text: '' }
  )

  function applyQuestionChange(next: { sections: typeof sections; question_ids: string[] }) {
    setSections(next.sections)
    setQuestionIds(next.question_ids)
  }

  // Staged like the แฟ้มโจทย์ picker: nothing changes until ยืนยัน, so a
  // mis-tick in a bank of a thousand is not an instant edit.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerDiff, setPickerDiff] = useState('all')
  const pickerAdded = draftIds.filter(id => !questionIds.includes(id))
  const pickerRemoved = questionIds.filter(id => !draftIds.includes(id))

  function openPicker() {
    setDraftIds(questionIds)
    setPickerSearch('')
    setPickerDiff('all')
    setPickerOpen(true)
  }

  function confirmPicker() {
    applyQuestionChange(normalizeSetSections(sections, draftIds))
    setPickerOpen(false)
  }

  // Every question defaults to 1 point (or its existing override); teacher
  // can edit individual questions and the total recalculates automatically.
  const [questionPointDrafts, setQuestionPointDrafts] = useState<Record<string, string>>(
    Object.fromEntries(questions.map(q => [q.id, String(a.question_points?.[q.id] ?? 1)]))
  )

  const pointsSum = Math.round(
    questionIds.reduce((sum, id) => sum + (Number.parseFloat(questionPointDrafts[id] ?? '1') || 0), 0) * 100
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

    if (questionIds.length === 0) { toast.error('ชุดข้อสอบต้องมีโจทย์อย่างน้อย 1 ข้อ'); return }

    const questionPoints = Object.fromEntries(
      questionIds.map(id => {
        const parsed = Number.parseFloat(questionPointDrafts[id] ?? '1')
        return [id, Number.isFinite(parsed) && parsed > 0 ? parsed : 1] as const
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
        // Sent only when the teacher could actually change it, so a frozen
        // assignment never trips the server's "already started" refusal just
        // by saving an unrelated field.
        ...(canEditQuestions ? { question_ids: questionIds } : {}),
        question_points: questionPoints,
        display_max_score: displayMax,
        show_results: showResults,
        show_sections: showSections,
        proctoring_enabled: proctoringEnabled,
        fullscreen_required: fullscreenRequired,
        block_clipboard: blockClipboard,
        random_question_count: randomQuestionCount ? Number(randomQuestionCount) : null,
        exam_watermark_enabled: examWatermarkEnabled,
      })
      if (res?.error) { toast.error(res.error); return }
      toast.success('บันทึกการแก้ไขแล้ว')
      router.push(`/assignments/${a.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card padding="xl" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">ชื่อชุดข้อสอบ</Label>
          <Input id="edit-title" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-desc">คำอธิบาย</Label>
          <Textarea id="edit-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>
      </Card>

      {a.mode === 'online' && a.type === 'exam' && (
        <Card padding="xl" className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ListFilter className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">สุ่มชุดข้อสอบรายคน</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                เลือกจากคลัง {a.question_ids.length} ข้อ แล้วตรึงชุดที่ได้ไว้ตลอด attempt รวมถึงหลัง reload
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-11">
            <Input
              id="edit-random-question-count"
              type="number"
              min={1}
              max={Math.max(1, a.question_ids.length - 1)}
              value={randomQuestionCount}
              onChange={event => setRandomQuestionCount(event.target.value)}
              placeholder={`ครบทั้ง ${a.question_ids.length} ข้อ`}
              disabled={a.question_ids.length < 2}
              className="max-w-[150px]"
            />
            <Label htmlFor="edit-random-question-count" className="text-sm text-muted-foreground">
              ข้อต่อคน
            </Label>
          </div>
          <p className="text-xs text-muted-foreground pl-11">
            เว้นว่างเพื่อใช้ครบทุกข้อ และจะเปลี่ยนจำนวนนี้ไม่ได้หลังมีนักเรียนเริ่มทำแล้ว
          </p>
          <label className="flex items-center justify-between gap-4 border-t border-border pt-3 cursor-pointer">
            <div className="flex items-start gap-3">
              <Fingerprint className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">แสดงลายน้ำผู้เข้าสอบ</p>
                <p className="text-xs text-muted-foreground">แสดงชื่อ รหัส attempt และเวลาบนหน้าข้อสอบ เพื่อลดการส่งภาพต่อ แต่ไม่สามารถกัน screenshot ได้ทั้งหมด</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={examWatermarkEnabled}
              onChange={event => setExamWatermarkEnabled(event.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>
        </Card>
      )}

      {a.mode === 'online' && a.type === 'exam' && (
        <Card padding="xl" className="space-y-3">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">เปิดห้องคุมสอบสด</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ครูเห็นสถานะออนไลน์ การออกจากแท็บ/เต็มจอ และเหตุการณ์ที่ควรตรวจสอบแบบเรียลไทม์
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={proctoringEnabled}
              onChange={event => setProctoringEnabled(event.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>

          {proctoringEnabled && (
            <div className="space-y-3 border-t border-border pt-3 pl-11">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Maximize className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">บังคับกลับเข้าโหมดเต็มจอ</p>
                    <p className="text-xs text-muted-foreground">หน้าข้อสอบจะถูกบังจนกว่านักเรียนจะกลับเข้าเต็มจอ</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={fullscreenRequired}
                  onChange={event => setFullscreenRequired(event.target.checked)}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">ปิดการคัดลอก วาง และเมนูคลิกขวา</p>
                  <p className="text-xs text-muted-foreground">เป็นแรงเสียดทานในเบราว์เซอร์ ไม่สามารถกันภาพถ่ายหรือเครื่องมือระดับระบบได้ทั้งหมด</p>
                </div>
                <input
                  type="checkbox"
                  checked={blockClipboard}
                  onChange={event => setBlockClipboard(event.target.checked)}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
              <p className="text-xs text-warning">
                เวลาในข้อสอบยังเดินต่อเมื่อออกจากแท็บหรือเต็มจอ เพื่อไม่ให้ใช้การออกจากหน้าเป็นวิธีหยุดเวลา
              </p>
            </div>
          )}
        </Card>
      )}

      <Card padding="xl" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">โจทย์และคะแนน</h2>
          <span className="text-sm font-semibold text-primary shrink-0">
            {questionIds.length} ข้อ · รวม {pointsSum} คะแนน
          </span>
        </div>
        {canEditQuestions ? (
          <p className="text-xs text-muted-foreground">
            เพิ่ม เอาออก และสลับลำดับข้อได้ เพราะยังไม่มีนักเรียนเริ่มทำชุดนี้ —
            ย้ายทีละขั้นด้วยลูกศร หรือพิมพ์เลขข้อที่ต้องการลงในช่องซ้ายมือแล้วกด Enter
            ค่าเริ่มต้นข้อละ 1 คะแนน ระบบรวมให้อัตโนมัติ
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-warning">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              มีนักเรียนเริ่มทำชุดนี้แล้ว จึงเพิ่ม เอาออก หรือสลับลำดับข้อไม่ได้ —
              ชุดโจทย์ถูกตรึงไว้กับการทำแต่ละครั้งตั้งแต่ตอนกดเริ่ม การแก้ตอนนี้จะทำให้คนที่ทำทีหลังได้ข้อสอบคนละชุด
              และคะแนนเต็มไม่เท่ากัน ส่วนคะแนนรายข้อยังแก้ได้ (มีผลกับการทำครั้งใหม่เท่านั้น)
            </span>
          </p>
        )}

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {orderedQuestions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border">
              {canEditQuestions ? (
                <OrderNumberInput
                  position={i + 1}
                  total={questionIds.length}
                  onMove={(to: number) => applyQuestionChange(moveQuestionToIndex(sections, questionIds, q.id, to - 1))}
                />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">ข้อ {i + 1}</span>
              )}
              {canEditQuestions && (
                <div className="flex flex-col shrink-0">
                  <IconButton
                    label="ย้ายขึ้น"
                    size="2xs"
                    disabled={i === 0}
                    onClick={() => applyQuestionChange(moveQuestionInSet(sections, questionIds, q.id, -1))}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton
                    label="ย้ายลง"
                    size="2xs"
                    disabled={i === questionIds.length - 1}
                    onClick={() => applyQuestionChange(moveQuestionInSet(sections, questionIds, q.id, 1))}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                <p className="text-xs text-muted-foreground truncate">{questionExcerpt(q.question_text)}</p>
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
              {canEditQuestions && (
                <IconButton
                  label="เอาข้อนี้ออก"
                  size="2xs"
                  className="shrink-0 hover:text-destructive"
                  disabled={questionIds.length <= 1}
                  onClick={() => applyQuestionChange(removeQuestionsFromSet(sections, questionIds, [q.id]))}
                >
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              )}
            </div>
          ))}
        </div>

        {canEditQuestions && (
          <Button type="button" variant="outline" onClick={openPicker} className="w-full">
            <Plus /> เพิ่มโจทย์จากคลัง
          </Button>
        )}
      </Card>

      <Card padding="xl" className="space-y-3">
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
      </Card>

      <Card padding="xl" className="space-y-1.5">
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

        {assignmentSections.length > 0 && (
          <label className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">แสดงชื่อแฟ้มย่อยให้นักเรียนเห็น</p>
                <p className="text-xs text-muted-foreground">
                  {assignmentSections.length} แฟ้มย่อย — ลำดับและเลขข้อไม่เปลี่ยนไม่ว่าจะเปิดหรือปิด
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={showSections}
              onChange={e => setShowSections(e.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>
        )}

        {passingEnabled && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-border">
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              {(['percent', 'score'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPassingType(t)}
                  className={`px-3 py-2 text-xs font-medium transition-all ${
                    passingType === t ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
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
      </Card>

      <Card padding="xl" className="space-y-4">
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
      </Card>

      <Card padding="xl" className="space-y-4">
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
                    scoreStrategy === s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {SCORE_STRATEGY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-2 text-sm text-warning">
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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>เพิ่มหรือเอาโจทย์ออก</DialogTitle>
            <DialogDescription>
              ติ๊กเพื่อเลือก แล้วกดยืนยันด้านล่าง — ยังไม่มีอะไรเปลี่ยนจนกว่าจะกดยืนยัน
              และยังต้องกดบันทึกอีกครั้งจึงจะมีผลจริง
            </DialogDescription>
          </DialogHeader>

          <QuestionPicker
            questions={bank}
            selectedIds={draftIds}
            baselineIds={questionIds}
            collectionNoun="ชุดข้อสอบ"
            onToggle={id => setDraftIds(prev => (
              prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
            ))}
            search={pickerSearch}
            onSearchChange={setPickerSearch}
            diffFilter={pickerDiff}
            onDiffFilterChange={setPickerDiff}
            showSelectedFooter={false}
            showHeader={false}
            surface="plain"
          />

          <DialogFooter className="sm:items-center sm:justify-between">
            <span className="text-sm">
              {pickerAdded.length === 0 && pickerRemoved.length === 0 ? (
                <span className="text-muted-foreground">ชุดนี้มี {questionIds.length} ข้อ</span>
              ) : (
                <span className="flex items-center gap-2 flex-wrap">
                  {pickerAdded.length > 0 && (
                    <span className="text-success font-medium">+ เพิ่ม {pickerAdded.length} ข้อ</span>
                  )}
                  {pickerRemoved.length > 0 && (
                    <span className="text-destructive font-medium">− เอาออก {pickerRemoved.length} ข้อ</span>
                  )}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>ยกเลิก</DialogClose>
              <Button
                type="button"
                onClick={confirmPicker}
                disabled={
                  draftIds.length === 0 || (pickerAdded.length === 0 && pickerRemoved.length === 0)
                }
              >
                ยืนยันการเปลี่ยนแปลง
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

/**
 * The order number, typed rather than only nudged.
 *
 * The arrows move one place at a time, which is nineteen clicks to lift ข้อ 20
 * to the front. This takes the destination directly: type it and press Enter,
 * or leave the field. An out-of-range number clamps rather than doing nothing,
 * and anything unparseable snaps back to where the question actually is.
 */
function OrderNumberInput({ position, total, onMove }: {
  position: number
  total: number
  onMove: (to: number) => void
}) {
  const [draft, setDraft] = useState(String(position))

  // The list reorders under this field whenever any row moves, so the draft
  // has to follow the row's real position rather than whatever was typed last.
  useEffect(() => { setDraft(String(position)) }, [position])

  function commit() {
    const parsed = Number.parseInt(draft, 10)
    if (!Number.isFinite(parsed) || parsed === position) { setDraft(String(position)); return }
    onMove(Math.max(1, Math.min(total, parsed)))
  }

  return (
    <Input
      type="number"
      min={1}
      max={total}
      value={draft}
      aria-label={`ลำดับข้อ (ตอนนี้อยู่ข้อ ${position} จาก ${total})`}
      title="พิมพ์เลขข้อที่ต้องการแล้วกด Enter"
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') setDraft(String(position))
      }}
      className="w-12 shrink-0 px-1 text-center text-xs font-semibold"
    />
  )
}

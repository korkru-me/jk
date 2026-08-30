'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { createAssignment } from '@/lib/actions/assignments'
import { createQuestionSet } from '@/lib/actions/question-sets'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Check, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Eye, Timer,
  BookOpen, Globe, Calendar, Shuffle, FileText, Layers, Target, Scale, ShieldCheck, Maximize,
  Fingerprint, ListFilter, Camera, LockKeyhole,
} from 'lucide-react'
import {
  filterSectionsToQuestions, moveQuestionOrder, moveQuestionOrderToIndex, parseSections,
  type QuestionSetSection,
} from '@/lib/question-set-sections'
import type { Classroom, QuestionSet, AssignmentStatus, ScoreStrategy, ShowResultsMode } from '@/lib/types'
import type { BankQuestion } from '@/lib/question-bank'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { OrderNumberInput } from '@/components/assignments/order-number-input'
import { QuestionPreviewDialog } from '@/components/assignments/question-preview-dialog'
import { questionExcerpt } from '@/lib/question-display'
import { subQuestionUnit } from '@/lib/question-parts'

const QuestionPicker = dynamic(
  () => import('@/components/assignments/question-picker').then(mod => mod.QuestionPicker),
  { loading: () => <div className="h-96 animate-pulse rounded-2xl bg-muted" aria-label="กำลังโหลดคลังโจทย์" /> }
)

const STEPS = ['ข้อมูลพื้นฐาน', 'เลือกโจทย์', 'คะแนน', 'ตั้งค่า', 'กำหนดการสอบ']

export type AssignmentClassroomOption = Pick<Classroom, 'id' | 'name' | 'description'>
/** A question the picker can offer, carrying the point value it is worth by
 *  default (see `default_points` in lib/question-bank.ts). */
export type AssignmentQuestionOption = BankQuestion
export type AssignmentQuestionSetOption = Pick<QuestionSet, 'id' | 'title' | 'description' | 'question_ids' | 'sections'>

interface Props {
  classrooms: AssignmentClassroomOption[]
  questions: AssignmentQuestionOption[]
  questionSets?: AssignmentQuestionSetOption[]
  preselectedClassroomId?: string
  preselectedSet?: AssignmentQuestionSetOption
}

export function CreateAssignmentForm({ classrooms, questions, questionSets = [], preselectedClassroomId, preselectedSet }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')

  // Step 1
  const [title, setTitle] = useState(preselectedSet?.title ?? '')
  const [description, setDescription] = useState(preselectedSet?.description ?? '')
  const [classroomIds, setClassroomIds] = useState<string[]>(
    preselectedClassroomId ? [preselectedClassroomId] : (classrooms[0] ? [classrooms[0].id] : [])
  )
  const [mode, setMode] = useState<'online' | 'print'>('online')
  const [assignmentType, setAssignmentType] = useState<'exercise' | 'exam'>('exercise')
  // Off unless the teacher says otherwise: turning it on blocks ส่งคำตอบ until
  // every เติมคำตอบตัวเลข answer carries a photo, and a งาน that starts out
  // able to block students is not a safe default.
  const [requireWorkImage, setRequireWorkImage] = useState(false)
  // When not starting from an existing set, offer to save the picked
  // questions back into the library as a new reusable set.
  const [saveAsSet, setSaveAsSet] = useState(false)

  // Step 2 — filter out any question_ids that no longer resolve to a real
  // question (e.g. deleted since the set was saved). Otherwise a dangling id
  // sails through into selectedIds, gets silently dropped later by
  // previewQuestions (step 3 can only render questions it can find), and the
  // teacher sees the count mysteriously shrink by however many are dangling.
  const [selectedIds, setSelectedIds] = useState<string[]>(
    (preselectedSet?.question_ids ?? []).filter(id => questions.some(q => q.id === id))
  )
  // แฟ้มย่อย carried over from the แฟ้มโจทย์ these questions came from. Trimmed
  // down to the questions actually assigned when the งาน is created.
  const [sections, setSections] = useState<QuestionSetSection[]>(
    parseSections(preselectedSet?.sections)
  )
  const [showSections, setShowSections] = useState(true)
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  // Step 3 (คะแนน) — a question starts at the point value its own structure
  // gives it (one per ข้อย่อย); teacher can edit individual questions and the
  // total recalculates automatically.
  const [questionPointDrafts, setQuestionPointDrafts] = useState<Record<string, string>>({})
  // Which row's มุมมองนักเรียน is open, as an index into selectedIds so the
  // dialog's ข้อถัดไป walks the teacher's own order. null = closed.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  // Independent of the per-question points above — rescales what's
  // *reported* only (never the underlying structure), and can be changed
  // any time later from the edit page too, even after students finish.
  const [displayMaxScore, setDisplayMaxScore] = useState('')

  // Step 4 (ตั้งค่า)
  const [duration, setDuration] = useState('')
  const [shuffleQ, setShuffleQ] = useState(false)
  const [shuffleA, setShuffleA] = useState(false)
  const [randomQuestionCount, setRandomQuestionCount] = useState('')
  const [showResults, setShowResults] = useState<ShowResultsMode>('immediate')
  const [maxAttempts, setMaxAttempts] = useState('')
  const [attemptsAuto, setAttemptsAuto] = useState(true)
  const [scoreStrategy, setScoreStrategy] = useState<ScoreStrategy>('best')
  const [accessCode, setAccessCode] = useState('')
  const [proctoringEnabled, setProctoringEnabled] = useState(false)
  const [fullscreenRequired, setFullscreenRequired] = useState(false)
  const [blockClipboard, setBlockClipboard] = useState(false)
  const [examWatermarkEnabled, setExamWatermarkEnabled] = useState(false)
  const [secureBrowserMode, setSecureBrowserMode] = useState<'browser' | 'seb_required'>('browser')
  const [passingEnabled, setPassingEnabled] = useState(false)
  const [passingType, setPassingType] = useState<'score' | 'percent'>('percent')
  const [passingValue, setPassingValue] = useState('')

  // Step 5 (กำหนดการสอบ)
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  function toggleQ(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  // Question order is the teacher's own order in selectedIds — the same array
  // that becomes the งาน's question_ids — so reordering here is what students
  // will see (unless สลับลำดับข้อแบบสุ่ม is turned on in ตั้งค่า). `sections`
  // is deliberately left alone: it still carries แฟ้มย่อย for questions that
  // are currently unticked, and is trimmed to the real selection at submit.
  function moveQuestion(id: string, delta: number) {
    setSelectedIds(prev => moveQuestionOrder(prev, id, delta))
  }

  function moveQuestionTo(id: string, position: number) {
    setSelectedIds(prev => moveQuestionOrderToIndex(prev, id, position - 1))
  }

  function importSet(set: AssignmentQuestionSetOption) {
    const validIds = set.question_ids.filter(id => questions.some(q => q.id === id))
    const missingCount = set.question_ids.length - validIds.length
    setSelectedIds(prev => Array.from(new Set([...prev, ...validIds])))
    // Sections follow their questions in. Ids already claimed by an earlier
    // แฟ้ม stay where they are, so two แฟ้ม can be merged without a question
    // showing up under two แฟ้มย่อย.
    setSections(prev => {
      const claimed = new Set(prev.flatMap(sec => sec.question_ids))
      const incoming = parseSections(set.sections)
        .map(sec => ({ ...sec, question_ids: sec.question_ids.filter(id => validIds.includes(id) && !claimed.has(id)) }))
        .filter(sec => sec.question_ids.length > 0)
      return [...prev, ...incoming]
    })
    if (missingCount > 0) {
      toast.success(`เพิ่ม ${validIds.length} ข้อจากแฟ้ม "${set.title}" (ข้าม ${missingCount} ข้อที่ถูกลบไปแล้ว)`)
    } else {
      toast.success(`เพิ่ม ${validIds.length} ข้อจากแฟ้ม "${set.title}"`)
    }
  }

  function toggleClassroom(id: string) {
    setClassroomIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  // What survives of the แฟ้มย่อย after the teacher's own picking.
  const assignedSections = filterSectionsToQuestions(sections, selectedIds)

  const previewQuestions = selectedIds
    .map(id => questions.find(q => q.id === id))
    .filter((q): q is AssignmentQuestionOption => !!q)
  // Indexes line up with previewQuestions, not selectedIds: a selected id that
  // no longer resolves to a question is dropped from the list on screen, and
  // the ดูตัวอย่าง dialog must page through exactly what is shown.
  const previewIds = previewQuestions.map(q => q.id)
  // What a question is worth until the teacher types over it.
  const defaultPointsById = new Map(questions.map(q => [q.id, q.default_points]))
  const pointsDraft = (id: string) => questionPointDrafts[id] ?? String(defaultPointsById.get(id) ?? 1)

  const pointsSum = Math.round(
    previewQuestions.reduce((sum, q) => sum + (Number.parseFloat(pointsDraft(q.id)) || 0), 0) * 100
  ) / 100

  function canNext() {
    if (step === 0) return title.trim().length > 0 && classroomIds.length > 0 && classrooms.length > 0
    if (step === 1) return selectedIds.length > 0
    return true
  }

  // Whether asking about รูปวิธีทำ makes sense at all: only เติมคำตอบตัวเลข
  // questions have working to photograph, so a งาน made entirely of ปรนัย or
  // อัตนัย never sees the switch — an option that cannot change anything is
  // just one more thing to read past.
  const hasWorkImageQuestions = selectedIds.some(
    id => questions.find(q => q.id === id)?.question_type === 'written'
  )

  function openPublishDialog() {
    setScheduleMode(false)
    setScheduleAt(startAt)
    setShowPublishDialog(true)
  }

  function handlePublishNow() {
    setShowPublishDialog(false)
    finalizeSubmit('published', startAt)
  }

  function handleScheduleConfirm() {
    if (!scheduleAt) { toast.error('กรุณาเลือกวันและเวลาที่จะเผยแพร่'); return }
    setShowPublishDialog(false)
    finalizeSubmit('published', scheduleAt)
  }

  function handleSaveDraft() {
    setShowPublishDialog(false)
    finalizeSubmit('draft', startAt)
  }

  function finalizeSubmit(status: AssignmentStatus, effectiveStartAt: string) {
    startTransition(async () => {
      let setId = preselectedSet?.id

      if (!preselectedSet && saveAsSet) {
        const setRes = await createQuestionSet({
          title: title.trim(),
          description: description.trim(),
          question_ids: selectedIds,
          visibility: 'private',
        })
        if ('error' in setRes) {
          toast.error(`บันทึกแฟ้มโจทย์ลงคลังไม่สำเร็จ: ${setRes.error} (จะมอบหมายต่อโดยไม่บันทึกลงคลัง)`)
        } else {
          setId = setRes.id
        }
      }

      // Every question gets an explicit point value — its own structural value
      // unless the teacher edited it, and 1 for invalid input.
      const questionPoints = Object.fromEntries(
        selectedIds.map(id => {
          const parsed = Number.parseFloat(pointsDraft(id))
          return [id, Number.isFinite(parsed) && parsed > 0 ? parsed : 1] as const
        })
      )

      const parsedDisplayMax = Number.parseFloat(displayMaxScore)
      const displayMax = displayMaxScore.trim() !== '' && Number.isFinite(parsedDisplayMax) && parsedDisplayMax > 0
        ? parsedDisplayMax
        : null
      const parsedRandomCount = Number(randomQuestionCount)
      const selectedRandomCount = randomQuestionCount.trim() !== ''
        && Number.isInteger(parsedRandomCount)
        && parsedRandomCount > 0
        && parsedRandomCount < selectedIds.length
          ? parsedRandomCount
          : null

      const res = await createAssignment({
        classroom_ids: classroomIds,
        title: title.trim(),
        description: description.trim(),
        question_ids: selectedIds,
        sections: filterSectionsToQuestions(sections, selectedIds),
        show_sections: showSections,
        question_points: questionPoints,
        display_max_score: displayMax,
        set_id: setId,
        start_at: effectiveStartAt || null,
        end_at: endAt || null,
        duration_minutes: duration ? Number(duration) : null,
        mode,
        type: assignmentType,
        shuffle_questions: shuffleQ,
        shuffle_options: shuffleA,
        random_question_count: selectedRandomCount,
        show_results: showResults,
        max_attempts: maxAttempts ? Number(maxAttempts) : null,
        score_strategy: scoreStrategy,
        access_code: accessCode.trim() || null,
        passing_type: passingEnabled && passingValue ? passingType : null,
        passing_value: passingEnabled && passingValue ? Number(passingValue) : null,
        // A งาน with nothing to photograph is stored as not requiring it,
        // whatever the switch was left on before the last โจทย์ was removed.
        require_work_image: hasWorkImageQuestions && requireWorkImage,
        proctoring_enabled: proctoringEnabled,
        fullscreen_required: fullscreenRequired,
        block_clipboard: blockClipboard,
        exam_watermark_enabled: examWatermarkEnabled,
        secure_browser_mode: secureBrowserMode,
        status,
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
                i < step  ? 'bg-primary text-primary-foreground' :
                i === step ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                'bg-muted text-muted-foreground'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <p className={`text-xs mt-1 whitespace-nowrap ${i === step ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                {label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mt-4 transition-all ${i < step ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: ข้อมูลพื้นฐาน ─────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <Card padding="xl" className="space-y-4">
            <h2 className="font-semibold text-foreground">ข้อมูลพื้นฐาน</h2>

            {preselectedSet && (
              <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary rounded-xl px-3 py-2.5">
                <Layers className="w-4 h-4 shrink-0" />
                ใช้แฟ้มโจทย์ &ldquo;{preselectedSet.title}&rdquo; ({selectedIds.length} ข้อ) — ปรับโจทย์ที่เลือกได้ในขั้นตอนถัดไป
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="title">ชื่อชุดข้อสอบ <span className="text-destructive">*</span></Label>
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
              <Label>ห้องเรียน <span className="text-destructive">*</span> {classroomIds.length > 1 && <span className="text-muted-foreground font-normal">({classroomIds.length} ห้อง)</span>}</Label>
              {classrooms.length === 0 ? (
                <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm text-warning">
                  ยังไม่มีห้องเรียน กรุณา{' '}
                  <a href="/classrooms" className="underline font-medium">สร้างห้องเรียน</a> ก่อน
                </div>
              ) : (
                <div className="grid gap-2">
                  {classrooms.map(c => {
                    const isSelected = classroomIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleClassroom(c.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                          isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-ring'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{c.name}</p>
                          {c.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.description}</p>}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {!preselectedSet && (
              <label className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">บันทึกเป็นแฟ้มโจทย์ไว้ใช้ซ้ำ</p>
                    <p className="text-xs text-muted-foreground">โจทย์ที่เลือกจะถูกบันทึกเป็นแฟ้มในคลังแฟ้มโจทย์ ค้นหาภายหลังด้วยชื่อแฟ้ม</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={saveAsSet}
                  onChange={e => setSaveAsSet(e.target.checked)}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
            )}
          </Card>

          <Card padding="xl" className="space-y-3">
            <h2 className="font-semibold text-foreground">ประเภทงาน</h2>
            <div className="grid grid-cols-2 gap-3">
              {(['exercise', 'exam'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setAssignmentType(t)
                    if (attemptsAuto) setMaxAttempts(t === 'exam' ? '1' : '')
                  }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    assignmentType === t ? 'border-primary bg-primary/10' : 'border-border hover:border-ring'
                  }`}
                >
                  <div className="text-2xl mb-2">{t === 'exam' ? '📝' : '🔁'}</div>
                  <p className="font-medium text-sm text-foreground">{t === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t === 'exam' ? 'ทำได้ครั้งเดียว' : 'ทำได้หลายครั้ง'}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          <Card padding="xl" className="space-y-3">
            <h2 className="font-semibold text-foreground">โหมดการสอบ</h2>
            <div className="grid grid-cols-2 gap-3">
              {(['online', 'print'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    mode === m ? 'border-primary bg-primary/10' : 'border-border hover:border-ring'
                  }`}
                >
                  <div className="text-2xl mb-2">{m === 'online' ? '💻' : '🖨️'}</div>
                  <p className="font-medium text-sm text-foreground">{m === 'online' ? 'ออนไลน์' : 'พิมพ์ใบงาน'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m === 'online' ? 'นักเรียนทำบนเว็บ + จับเวลา' : 'สร้าง PDF พร้อม QR Code'}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 2: เลือกโจทย์ ────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {questionSets.length > 0 && (
            <Card padding="md" className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">เพิ่มจากแฟ้มโจทย์ที่มีอยู่</h3>
              </div>
              <p className="text-xs text-muted-foreground">เลือกแฟ้มเพื่อเพิ่มโจทย์ทั้งหมดเข้ามา — ปรับเพิ่ม/ลดทีละข้อได้ด้านล่าง</p>
              <div className="flex flex-wrap gap-2">
                {questionSets.map(s => {
                  const validCount = s.question_ids.filter(id => questions.some(q => q.id === id)).length
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => importSet(s)}
                      className="flex items-center gap-1.5 text-xs font-medium border border-border hover:border-primary/20 hover:bg-primary/10 text-muted-foreground px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Layers className="w-3 h-3 text-muted-foreground" />
                      {s.title}
                      <span className="text-muted-foreground">({validCount})</span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}

          <QuestionPicker
            questions={questions}
            selectedIds={selectedIds}
            onToggle={toggleQ}
            search={search}
            onSearchChange={setSearch}
            diffFilter={diffFilter}
            onDiffFilterChange={setDiffFilter}
          />
        </div>
      )}

      {/* ── Step 3: คะแนน ────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card padding="xl" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">คะแนนแต่ละข้อ</h2>
              <span className="text-sm font-semibold text-primary">รวม {pointsSum} คะแนน</span>
            </div>
            <p className="text-xs text-muted-foreground">
              ค่าเริ่มต้นคิดตามจำนวนข้อย่อยในโจทย์ — ข้อย่อย 1 ข้อ = 1 คะแนน
              แก้ไขคะแนนข้อไหนก็ได้ ระบบจะรวมคะแนนทั้งหมดให้อัตโนมัติ
              สลับลำดับข้อได้ที่นี่ — ย้ายทีละขั้นด้วยลูกศร หรือพิมพ์เลขข้อที่ต้องการลงในช่องซ้ายมือแล้วกด Enter
              และกดรูปตาเพื่อดูตัวอย่างข้อนั้นแบบที่นักเรียนเห็น
            </p>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {previewQuestions.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border">
                  <OrderNumberInput
                    position={i + 1}
                    total={previewQuestions.length}
                    onMove={to => moveQuestionTo(q.id, to)}
                  />
                  <div className="flex flex-col shrink-0">
                    <IconButton
                      label="ย้ายขึ้น"
                      size="2xs"
                      disabled={i === 0}
                      onClick={() => moveQuestion(q.id, -1)}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton
                      label="ย้ายลง"
                      size="2xs"
                      disabled={i === previewQuestions.length - 1}
                      onClick={() => moveQuestion(q.id, 1)}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{questionExcerpt(q.question_text)}</p>
                  </div>
                  {q.sub_question_count > 1 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {q.sub_question_count} {subQuestionUnit(q.question_type)}
                    </span>
                  )}
                  <IconButton
                    label={`ดูตัวอย่างข้อ ${i + 1}`}
                    size="2xs"
                    className="shrink-0"
                    onClick={() => setPreviewIndex(i)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </IconButton>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={pointsDraft(q.id)}
                    onChange={e => setQuestionPointDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                    className="w-20 text-center shrink-0"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">คะแนน</span>
                </div>
              ))}
            </div>

            <QuestionPreviewDialog
              ids={previewIds}
              open={previewIndex !== null}
              startIndex={previewIndex ?? 0}
              onOpenChange={open => { if (!open) setPreviewIndex(null) }}
            />
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
                  เช่น โจทย์รวม {pointsSum} คะแนน แต่อยากเก็บแค่ 10 คะแนน ปรับได้ภายหลังจากหน้าแก้ไขได้ตลอด แม้นักเรียนทำไปแล้ว
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
                    {assignmentType === 'exercise'
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
        </div>
      )}

      {/* ── Step 4: ตั้งค่า ──────────────────────────────────────────── */}
      {step === 3 && (
        <Card padding="xl" className="space-y-5">
          <h2 className="font-semibold text-foreground">ตั้งค่าการสอบ</h2>

          <div className="space-y-1.5">
            <Label htmlFor="dur" className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-muted-foreground" /> เวลาทำ (นาที)
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
              ...(assignedSections.length > 0 ? [{
                label: 'แสดงชื่อแฟ้มย่อยให้นักเรียนเห็น',
                desc: shuffleQ
                  ? `${assignedSections.length} แฟ้มย่อย — สับลำดับข้ออยู่ ชื่อแฟ้มย่อยจะแสดงกำกับรายข้อแทนหัวเรื่อง`
                  : `${assignedSections.length} แฟ้มย่อยจากแฟ้มโจทย์ เช่น "${assignedSections[0].title || 'ไม่ได้ตั้งชื่อ'}"`,
                icon: Layers,
                value: showSections,
                set: setShowSections,
              }] : []),
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
              ...(hasWorkImageQuestions ? [{
                label: 'ให้นักเรียนแนบรูปแสดงวิธีทำ',
                desc: `${assignmentType === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}นี้มีข้อเติมคำตอบตัวเลข — เปิดไว้จะต้องแนบรูปวิธีทำทุกข้อจึงจะส่งคำตอบได้ (ข้อที่มีข้อย่อย แนบข้อย่อยละ 1 รูป)`,
                icon: Camera,
                value: requireWorkImage,
                set: setRequireWorkImage,
              }] : []),
            ].map(opt => {
              const Icon = opt.icon
              return (
                <label
                  key={opt.label}
                  className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={opt.value}
                    onChange={e => opt.set(e.target.checked)}
                    className="accent-primary w-4 h-4 shrink-0"
                  />
                </label>
              )
            })}
          </div>

          {mode === 'online' && assignmentType === 'exam' && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <LockKeyhole className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">บังคับใช้ Safe Exam Browser</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ล็อกเครื่องและตรวจ Config Key + Browser Exam Key ก่อนเริ่ม อ่าน บันทึก อัปโหลด และส่งข้อสอบ
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={secureBrowserMode === 'seb_required'}
                  onChange={event => {
                    const enabled = event.target.checked
                    setSecureBrowserMode(enabled ? 'seb_required' : 'browser')
                    if (enabled) setProctoringEnabled(true)
                  }}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
              <p className="pl-11 text-xs text-warning">
                ใช้ได้กับ Windows, macOS, iPhone และ iPad · Android ยังไม่รองรับในเฟสนี้ และนักเรียนต้องติดตั้ง SEB ก่อนสอบ
              </p>
            </div>
          )}

          {mode === 'online' && assignmentType === 'exam' && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ListFilter className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">สุ่มชุดข้อสอบรายคน</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    เลือกจากคลัง {selectedIds.length} ข้อ แล้วตรึงชุดที่ได้ไว้ตลอด attempt รวมถึงหลัง reload
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-11">
                <Input
                  id="random-question-count"
                  type="number"
                  min={1}
                  max={Math.max(1, selectedIds.length - 1)}
                  value={randomQuestionCount}
                  onChange={event => setRandomQuestionCount(event.target.value)}
                  placeholder={`ครบทั้ง ${selectedIds.length} ข้อ`}
                  disabled={selectedIds.length < 2}
                  className="max-w-[150px]"
                />
                <Label htmlFor="random-question-count" className="text-sm text-muted-foreground">
                  ข้อต่อคน
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pl-11">
                เว้นว่างเพื่อใช้ครบทุกข้อ หากคะแนนแต่ละข้อไม่เท่ากัน ควรตั้ง “คะแนนเต็มที่แสดงผล” เพื่อให้เปรียบเทียบกันได้ง่าย
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
            </div>
          )}

          {mode === 'online' && assignmentType === 'exam' && (
            <div className="space-y-3 rounded-xl border border-border p-4">
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
                  onChange={event => setProctoringEnabled(
                    secureBrowserMode === 'seb_required' ? true : event.target.checked
                  )}
                  disabled={secureBrowserMode === 'seb_required'}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>

              {proctoringEnabled && (
                <div className="space-y-2 border-t border-border pt-3 pl-11">
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Maximize className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">บังคับกลับเข้าโหมดเต็มจอ</p>
                        <p className="text-xs text-muted-foreground">หากออกจากเต็มจอ หน้าข้อสอบจะถูกบังจนกว่าจะกลับเข้า</p>
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
                      <p className="text-xs text-muted-foreground">ลดการนำข้อความออกจากหน้า แต่ไม่สามารถกันภาพถ่ายหรือเครื่องมือระดับระบบได้ทั้งหมด</p>
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
            </div>
          )}

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
              ] as const).map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setShowResults(o.key)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    showResults === o.key ? 'border-primary bg-primary/10' : 'border-border hover:border-ring'
                  }`}
                >
                  <p className="font-medium text-sm text-foreground">{o.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="attempts" className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-muted-foreground" /> จำกัดจำนวนครั้งที่ทำได้
            </Label>
            <Input
              id="attempts"
              type="number"
              min={1}
              value={maxAttempts}
              onChange={e => {
                setMaxAttempts(e.target.value)
                setAttemptsAuto(false)
              }}
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

          <div className="space-y-1.5">
            <Label htmlFor="code" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-muted-foreground" /> รหัสผ่านเข้าทำ (ถ้ามี)
            </Label>
            <Input
              id="code"
              value={accessCode}
              onChange={e => setAccessCode(e.target.value)}
              placeholder="ไม่บังคับ — เว้นว่างถ้าไม่ต้องใช้รหัส"
              className="max-w-[200px]"
            />
          </div>
        </Card>
      )}

      {/* ── Step 5: กำหนดการสอบ ───────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card padding="xl" className="space-y-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" /> กำหนดการสอบ (ไม่บังคับ)
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
          </Card>

          {/* Summary */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
            <h3 className="font-bold text-base mb-4">สรุปก่อนสร้าง</h3>
            <div className="space-y-2.5 text-sm">
              {[
                { label: 'ชื่อ',      value: title },
                {
                  label: 'ห้องเรียน',
                  value: classroomIds.length <= 1
                    ? (classrooms.find(c => c.id === classroomIds[0])?.name ?? '—')
                    : `${classrooms.find(c => c.id === classroomIds[0])?.name ?? ''} และอีก ${classroomIds.length - 1} ห้อง`,
                },
                { label: 'ประเภท',    value: assignmentType === 'exam' ? '📝 ข้อสอบ' : '🔁 แบบฝึกหัด' },
                { label: 'โจทย์',     value: `${selectedIds.length} ข้อ` },
                {
                  label: 'คะแนนเต็ม',
                  value: displayMaxScore.trim() && Number(displayMaxScore) > 0
                    ? `${displayMaxScore} คะแนน (จริง ${pointsSum})`
                    : `${pointsSum} คะแนน`,
                },
                { label: 'โหมด',      value: mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์' },
                ...(duration ? [{ label: 'เวลา', value: `${duration} นาที` }] : []),
                ...(passingEnabled && passingValue ? [{ label: 'เกณฑ์ผ่าน', value: passingType === 'percent' ? `${passingValue}%` : `${passingValue} คะแนน` }] : []),
                ...(maxAttempts ? [{ label: 'จำนวนครั้ง', value: `${maxAttempts} ครั้ง` }] : []),
                ...(maxAttempts !== '1' ? [{ label: 'วิธีเก็บคะแนน', value: SCORE_STRATEGY_LABELS[scoreStrategy] }] : []),
                ...(accessCode.trim() ? [{ label: 'รหัสผ่าน', value: accessCode.trim() }] : []),
                ...(mode === 'online' && assignmentType === 'exam' && proctoringEnabled
                  ? [{ label: 'คุมสอบสด', value: fullscreenRequired ? 'เปิด · บังคับเต็มจอ' : 'เปิด' }]
                  : []),
                ...(mode === 'online' && assignmentType === 'exam' && secureBrowserMode === 'seb_required'
                  ? [{ label: 'Safe Exam Browser', value: 'บังคับใช้' }]
                  : []),
                ...(hasWorkImageQuestions
                  ? [{ label: 'รูปวิธีทำ', value: requireWorkImage ? 'บังคับแนบทุกข้อตัวเลข' : 'ไม่บังคับ' }]
                  : []),
                { label: 'แสดงผล',    value: showResults === 'immediate' ? 'ทันทีหลังส่ง' : 'หลังพ้นกำหนดส่ง' },
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-right truncate max-w-[200px]">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 border-t border-white/10 pt-3">
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
            onClick={openPublishDialog}
            disabled={isPending}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {isPending ? 'กำลังสร้าง...' : assignmentType === 'exam' ? 'สร้างชุดข้อสอบ' : 'สร้างแบบฝึกหัด'}
          </Button>
        )}
      </div>

      {/* Publish timing dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay backdrop-blur-sm px-4">
          <Card padding="xl" elevation="xl" className="max-w-sm w-full">
            <h3 className="font-bold text-lg text-foreground">เผยแพร่{assignmentType === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}นี้เมื่อไหร่?</h3>
            <p className="text-sm text-muted-foreground mt-2">
              เลือกได้ว่าจะให้นักเรียนเห็นและเริ่มทำได้ทันที ตั้งเวลาให้เปิดล่วงหน้า หรือเก็บไว้เป็นร่างก่อนแล้วค่อยเผยแพร่ทีหลัง
            </p>

            {!scheduleMode ? (
              <div className="flex flex-col gap-2 mt-5">
                <Button type="button" onClick={handlePublishNow} disabled={isPending} className="w-full">
                  {isPending ? 'กำลังสร้าง...' : 'เผยแพร่ทันที'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setScheduleMode(true)} disabled={isPending} className="w-full">
                  ตั้งเวลาเผยแพร่ล่วงหน้า
                </Button>
                <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isPending} className="w-full">
                  {isPending ? 'กำลังบันทึก...' : 'ยังไม่เผยแพร่ (เก็บไว้เป็นร่าง)'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPublishDialog(false)}
                  disabled={isPending}
                  className="w-full text-muted-foreground"
                >
                  ยกเลิก
                </Button>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scheduleAt">เผยแพร่เมื่อ</Label>
                  <Input
                    id="scheduleAt"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={e => setScheduleAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">นักเรียนจะเริ่มเห็นและเข้าทำได้ตั้งแต่เวลานี้เป็นต้นไป</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" onClick={handleScheduleConfirm} disabled={isPending} className="w-full">
                    {isPending ? 'กำลังสร้าง...' : 'ยืนยันตั้งเวลาเผยแพร่'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setScheduleMode(false)} disabled={isPending} className="w-full text-muted-foreground">
                    ย้อนกลับ
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

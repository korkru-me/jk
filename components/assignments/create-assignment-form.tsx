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
  Check, ChevronRight, ChevronLeft, Eye, Timer,
  BookOpen, Globe, Calendar, Shuffle, FileText, Layers, Target, Scale,
} from 'lucide-react'
import type { Question, Classroom, QuestionSet, AssignmentStatus, ScoreStrategy, ShowResultsMode } from '@/lib/types'
import { Card } from '@/components/ui/card'

const QuestionPicker = dynamic(
  () => import('@/components/assignments/question-picker').then(mod => mod.QuestionPicker),
  { loading: () => <div className="h-96 animate-pulse rounded-2xl bg-muted" aria-label="กำลังโหลดคลังโจทย์" /> }
)

const STEPS = ['ข้อมูลพื้นฐาน', 'เลือกโจทย์', 'คะแนน', 'ตั้งค่า', 'กำหนดการสอบ']

export type AssignmentClassroomOption = Pick<Classroom, 'id' | 'name' | 'description'>
export type AssignmentQuestionOption = Pick<
  Question,
  'id' | 'title' | 'question_text' | 'difficulty' | 'question_type' | 'requires_work_image' | 'tags'
>
export type AssignmentQuestionSetOption = Pick<QuestionSet, 'id' | 'title' | 'description' | 'question_ids'>

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
  const [showWorkImageConfirm, setShowWorkImageConfirm] = useState(false)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [pendingRequireWorkImage, setPendingRequireWorkImage] = useState(true)
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
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  // Step 3 (คะแนน) — every question defaults to 1 point; teacher can edit
  // individual questions and the total recalculates automatically.
  const [questionPointDrafts, setQuestionPointDrafts] = useState<Record<string, string>>({})
  // Independent of the per-question points above — rescales what's
  // *reported* only (never the underlying structure), and can be changed
  // any time later from the edit page too, even after students finish.
  const [displayMaxScore, setDisplayMaxScore] = useState('')

  // Step 4 (ตั้งค่า)
  const [duration, setDuration] = useState('')
  const [shuffleQ, setShuffleQ] = useState(false)
  const [shuffleA, setShuffleA] = useState(false)
  const [showResults, setShowResults] = useState<ShowResultsMode>('immediate')
  const [maxAttempts, setMaxAttempts] = useState('')
  const [attemptsAuto, setAttemptsAuto] = useState(true)
  const [scoreStrategy, setScoreStrategy] = useState<ScoreStrategy>('best')
  const [accessCode, setAccessCode] = useState('')
  const [passingEnabled, setPassingEnabled] = useState(false)
  const [passingType, setPassingType] = useState<'score' | 'percent'>('percent')
  const [passingValue, setPassingValue] = useState('')

  // Step 5 (กำหนดการสอบ)
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  function toggleQ(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function importSet(set: AssignmentQuestionSetOption) {
    const validIds = set.question_ids.filter(id => questions.some(q => q.id === id))
    const missingCount = set.question_ids.length - validIds.length
    setSelectedIds(prev => Array.from(new Set([...prev, ...validIds])))
    if (missingCount > 0) {
      toast.success(`เพิ่ม ${validIds.length} ข้อจากชุด "${set.title}" (ข้าม ${missingCount} ข้อที่ถูกลบไปแล้ว)`)
    } else {
      toast.success(`เพิ่ม ${validIds.length} ข้อจากชุด "${set.title}"`)
    }
  }

  function toggleClassroom(id: string) {
    setClassroomIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const previewQuestions = selectedIds
    .map(id => questions.find(q => q.id === id))
    .filter((q): q is AssignmentQuestionOption => !!q)
  const pointsSum = Math.round(
    previewQuestions.reduce((sum, q) => sum + (Number.parseFloat(questionPointDrafts[q.id] ?? '1') || 0), 0) * 100
  ) / 100

  function canNext() {
    if (step === 0) return title.trim().length > 0 && classroomIds.length > 0 && classrooms.length > 0
    if (step === 1) return selectedIds.length > 0
    return true
  }

  // Selected questions where the teacher (in the question/set editor) has
  // turned on "บังคับแนบรูปวิธีทำ" — only relevant for exams, so the
  // teacher gets asked whether to keep that enforced for this assignment.
  const hasWorkImageQuestions = selectedIds.some(
    id => questions.find(q => q.id === id)?.requires_work_image
  )

  function handleConfirmClick() {
    if (assignmentType === 'exam' && hasWorkImageQuestions) {
      setShowWorkImageConfirm(true)
      return
    }
    openPublishDialog(true)
  }

  function resolveWorkImageChoice(requireWorkImage: boolean) {
    setShowWorkImageConfirm(false)
    openPublishDialog(requireWorkImage)
  }

  function openPublishDialog(requireWorkImage: boolean) {
    setPendingRequireWorkImage(requireWorkImage)
    setScheduleMode(false)
    setScheduleAt(startAt)
    setShowPublishDialog(true)
  }

  function handlePublishNow() {
    setShowPublishDialog(false)
    finalizeSubmit(pendingRequireWorkImage, 'published', startAt)
  }

  function handleScheduleConfirm() {
    if (!scheduleAt) { toast.error('กรุณาเลือกวันและเวลาที่จะเผยแพร่'); return }
    setShowPublishDialog(false)
    finalizeSubmit(pendingRequireWorkImage, 'published', scheduleAt)
  }

  function handleSaveDraft() {
    setShowPublishDialog(false)
    finalizeSubmit(pendingRequireWorkImage, 'draft', startAt)
  }

  function finalizeSubmit(requireWorkImage: boolean, status: AssignmentStatus, effectiveStartAt: string) {
    startTransition(async () => {
      let setId = preselectedSet?.id

      if (!preselectedSet && saveAsSet) {
        const classroomName = classrooms.find(c => c.id === classroomIds[0])?.name
        const setRes = await createQuestionSet({
          title: title.trim(),
          description: description.trim(),
          question_ids: selectedIds,
          tags: classroomName ? [classroomName] : [],
          visibility: 'private',
        })
        if ('error' in setRes) {
          toast.error(`บันทึกชุดโจทย์ลงคลังไม่สำเร็จ: ${setRes.error} (จะมอบหมายต่อโดยไม่บันทึกลงคลัง)`)
        } else {
          setId = setRes.id
        }
      }

      // Every question gets an explicit point value — defaults to 1 unless
      // the teacher edited it, and falls back to 1 for invalid input.
      const questionPoints = Object.fromEntries(
        selectedIds.map(id => {
          const parsed = Number.parseFloat(questionPointDrafts[id] ?? '1')
          return [id, Number.isFinite(parsed) && parsed > 0 ? parsed : 1] as const
        })
      )

      const parsedDisplayMax = Number.parseFloat(displayMaxScore)
      const displayMax = displayMaxScore.trim() !== '' && Number.isFinite(parsedDisplayMax) && parsedDisplayMax > 0
        ? parsedDisplayMax
        : null

      const res = await createAssignment({
        classroom_ids: classroomIds,
        title: title.trim(),
        description: description.trim(),
        question_ids: selectedIds,
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
        show_results: showResults,
        max_attempts: maxAttempts ? Number(maxAttempts) : null,
        score_strategy: scoreStrategy,
        access_code: accessCode.trim() || null,
        passing_type: passingEnabled && passingValue ? passingType : null,
        passing_value: passingEnabled && passingValue ? Number(passingValue) : null,
        require_work_image: requireWorkImage,
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
                i < step  ? 'bg-primary text-white' :
                i === step ? 'bg-primary text-white ring-4 ring-blue-100' :
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
                ใช้ชุดโจทย์ &ldquo;{preselectedSet.title}&rdquo; ({selectedIds.length} ข้อ) — ปรับโจทย์ที่เลือกได้ในขั้นตอนถัดไป
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
                <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm text-amber-800">
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
                          isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
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
                    <p className="text-sm font-medium text-foreground">บันทึกชุดโจทย์นี้ไว้ในคลังเพื่อใช้ซ้ำ</p>
                    <p className="text-xs text-muted-foreground">โจทย์ที่เลือกจะถูกบันทึกเป็นชุดในคลังชุดโจทย์ ติดแท็กชื่อห้องเรียนให้อัตโนมัติ</p>
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
                <h3 className="text-sm font-semibold text-foreground">เพิ่มจากชุดโจทย์ที่มีอยู่</h3>
              </div>
              <p className="text-xs text-muted-foreground">เลือกชุดเพื่อเพิ่มโจทย์ทั้งหมดเข้ามา — ปรับเพิ่ม/ลดทีละข้อได้ด้านล่าง</p>
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
              ค่าเริ่มต้นข้อละ 1 คะแนน — แก้ไขคะแนนข้อไหนก็ได้ ระบบจะรวมคะแนนทั้งหมดให้อัตโนมัติ
            </p>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {previewQuestions.map((q, i) => (
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
                      scoreStrategy === s ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'
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
            onClick={handleConfirmClick}
            disabled={isPending}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {isPending ? 'กำลังสร้าง...' : assignmentType === 'exam' ? 'สร้างชุดข้อสอบ' : 'สร้างแบบฝึกหัด'}
          </Button>
        )}
      </div>

      {/* Work-image enforcement confirm dialog */}
      {showWorkImageConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <Card padding="xl" elevation="xl" className="max-w-sm w-full">
            <h3 className="font-bold text-lg text-foreground">บังคับแนบรูปวิธีทำหรือไม่?</h3>
            <p className="text-sm text-muted-foreground mt-2">
              ชุดข้อสอบนี้มีโจทย์ที่ตั้งค่าไว้ให้นักเรียนต้องแนบรูปวิธีทำ
              ต้องการให้นักเรียนแนบรูปวิธีทำแบบบังคับก่อนส่งคำตอบสำหรับข้อสอบชุดนี้หรือไม่
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <Button type="button" onClick={() => resolveWorkImageChoice(true)} disabled={isPending} className="w-full">
                ใช่ บังคับแนบรูป
              </Button>
              <Button type="button" variant="outline" onClick={() => resolveWorkImageChoice(false)} disabled={isPending} className="w-full">
                ไม่ใช่ ไม่ต้องบังคับ
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowWorkImageConfirm(false)}
                disabled={isPending}
                className="w-full text-muted-foreground"
              >
                ยกเลิก
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Publish timing dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
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

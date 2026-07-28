'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createAssignment } from '@/lib/actions/assignments'
import { createQuestionSet } from '@/lib/actions/question-sets'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { QuestionPicker } from '@/components/assignments/question-picker'
import {
  Check, ChevronRight, ChevronLeft, Eye, Timer,
  BookOpen, Globe, Calendar, Shuffle, FileText, Layers, Target,
} from 'lucide-react'
import type { Question, Classroom, QuestionSet, AssignmentStatus, ScoreStrategy } from '@/lib/types'

const STEPS = ['ข้อมูลพื้นฐาน', 'เลือกโจทย์', 'ตั้งค่า', 'กำหนดการสอบ']

interface PreselectedSet {
  id: string
  title: string
  description: string | null
  question_ids: string[]
}

interface Props {
  classrooms: Classroom[]
  questions: Question[]
  questionSets?: QuestionSet[]
  preselectedClassroomId?: string
  preselectedSet?: PreselectedSet
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

  // Step 2
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedSet?.question_ids ?? [])
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  // Step 3
  const [duration, setDuration] = useState('')
  const [shuffleQ, setShuffleQ] = useState(false)
  const [shuffleA, setShuffleA] = useState(false)
  const [showResults, setShowResults] = useState<'immediate' | 'after_due'>('immediate')
  const [maxAttempts, setMaxAttempts] = useState('')
  const [attemptsAuto, setAttemptsAuto] = useState(true)
  const [scoreStrategy, setScoreStrategy] = useState<ScoreStrategy>('best')
  const [accessCode, setAccessCode] = useState('')
  const [passingEnabled, setPassingEnabled] = useState(false)
  const [passingType, setPassingType] = useState<'score' | 'percent'>('percent')
  const [passingValue, setPassingValue] = useState('')

  // Step 4
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  function toggleQ(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function importSet(set: QuestionSet) {
    setSelectedIds(prev => Array.from(new Set([...prev, ...set.question_ids])))
    toast.success(`เพิ่ม ${set.question_ids.length} ข้อจากชุด "${set.title}"`)
  }

  function toggleClassroom(id: string) {
    setClassroomIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

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
        if (setRes?.error) {
          toast.error(`บันทึกชุดโจทย์ลงคลังไม่สำเร็จ: ${setRes.error} (จะมอบหมายต่อโดยไม่บันทึกลงคลัง)`)
        } else if ('id' in setRes) {
          setId = setRes.id
        }
      }

      const res = await createAssignment({
        classroom_ids: classroomIds,
        title: title.trim(),
        description: description.trim(),
        question_ids: selectedIds,
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

            {preselectedSet && (
              <div className="flex items-center gap-2 text-sm bg-blue-50 text-blue-700 rounded-xl px-3 py-2.5">
                <Layers className="w-4 h-4 shrink-0" />
                ใช้ชุดโจทย์ &ldquo;{preselectedSet.title}&rdquo; ({preselectedSet.question_ids.length} ข้อ) — ปรับโจทย์ที่เลือกได้ในขั้นตอนถัดไป
              </div>
            )}

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
              <Label>ห้องเรียน <span className="text-red-500">*</span> {classroomIds.length > 1 && <span className="text-gray-400 font-normal">({classroomIds.length} ห้อง)</span>}</Label>
              {classrooms.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
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
                          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{c.name}</p>
                          {c.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{c.description}</p>}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {!preselectedSet && (
              <label className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">บันทึกชุดโจทย์นี้ไว้ในคลังเพื่อใช้ซ้ำ</p>
                    <p className="text-xs text-gray-400">โจทย์ที่เลือกจะถูกบันทึกเป็นชุดในคลังชุดโจทย์ ติดแท็กชื่อห้องเรียนให้อัตโนมัติ</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={saveAsSet}
                  onChange={e => setSaveAsSet(e.target.checked)}
                  className="accent-blue-600 w-4 h-4 shrink-0"
                />
              </label>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">ประเภทงาน</h2>
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
                    assignmentType === t ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-2">{t === 'exam' ? '📝' : '🔁'}</div>
                  <p className="font-medium text-sm text-gray-900">{t === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t === 'exam' ? 'ทำได้ครั้งเดียว' : 'ทำได้หลายครั้ง'}
                  </p>
                </button>
              ))}
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
        <div className="space-y-4">
          {questionSets.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">เพิ่มจากชุดโจทย์ที่มีอยู่</h3>
              </div>
              <p className="text-xs text-gray-400">เลือกชุดเพื่อเพิ่มโจทย์ทั้งหมดเข้ามา — ปรับเพิ่ม/ลดทีละข้อได้ด้านล่าง</p>
              <div className="flex flex-wrap gap-2">
                {questionSets.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => importSet(s)}
                    className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Layers className="w-3 h-3 text-gray-400" />
                    {s.title}
                    <span className="text-gray-400">({s.question_ids.length})</span>
                  </button>
                ))}
              </div>
            </div>
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

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-gray-400" /> แสดงผลลัพธ์
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: 'immediate', label: 'ทันทีหลังส่ง', desc: 'เห็นคะแนน+เฉลยทันที' },
                { key: 'after_due', label: 'หลังพ้นกำหนดส่ง', desc: 'ซ่อนเฉลยจนกว่าจะหมดเขต' },
              ] as const).map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setShowResults(o.key)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    showResults === o.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900">{o.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-all">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">ตั้งเกณฑ์คะแนนผ่าน</p>
                  <p className="text-xs text-gray-400">
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
            <Label htmlFor="attempts" className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-gray-400" /> จำกัดจำนวนครั้งที่ทำได้
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

          <div className="space-y-1.5">
            <Label htmlFor="code" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-gray-400" /> รหัสผ่านเข้าทำ (ถ้ามี)
            </Label>
            <Input
              id="code"
              value={accessCode}
              onChange={e => setAccessCode(e.target.value)}
              placeholder="ไม่บังคับ — เว้นว่างถ้าไม่ต้องใช้รหัส"
              className="max-w-[200px]"
            />
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
                {
                  label: 'ห้องเรียน',
                  value: classroomIds.length <= 1
                    ? (classrooms.find(c => c.id === classroomIds[0])?.name ?? '—')
                    : `${classrooms.find(c => c.id === classroomIds[0])?.name ?? ''} และอีก ${classroomIds.length - 1} ห้อง`,
                },
                { label: 'ประเภท',    value: assignmentType === 'exam' ? '📝 ข้อสอบ' : '🔁 แบบฝึกหัด' },
                { label: 'โจทย์',     value: `${selectedIds.length} ข้อ` },
                { label: 'โหมด',      value: mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์' },
                ...(duration ? [{ label: 'เวลา', value: `${duration} นาที` }] : []),
                ...(passingEnabled && passingValue ? [{ label: 'เกณฑ์ผ่าน', value: passingType === 'percent' ? `${passingValue}%` : `${passingValue} คะแนน` }] : []),
                ...(maxAttempts ? [{ label: 'จำนวนครั้ง', value: `${maxAttempts} ครั้ง` }] : []),
                ...(maxAttempts !== '1' ? [{ label: 'วิธีเก็บคะแนน', value: SCORE_STRATEGY_LABELS[scoreStrategy] }] : []),
                ...(accessCode.trim() ? [{ label: 'รหัสผ่าน', value: accessCode.trim() }] : []),
                { label: 'แสดงผล',    value: showResults === 'immediate' ? 'ทันทีหลังส่ง' : 'หลังพ้นกำหนดส่ง' },
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
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-lg text-gray-900">บังคับแนบรูปวิธีทำหรือไม่?</h3>
            <p className="text-sm text-gray-500 mt-2">
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
                className="w-full text-gray-500"
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Publish timing dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-lg text-gray-900">เผยแพร่{assignmentType === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}นี้เมื่อไหร่?</h3>
            <p className="text-sm text-gray-500 mt-2">
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
                  className="w-full text-gray-500"
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
                  <p className="text-xs text-gray-400">นักเรียนจะเริ่มเห็นและเข้าทำได้ตั้งแต่เวลานี้เป็นต้นไป</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" onClick={handleScheduleConfirm} disabled={isPending} className="w-full">
                    {isPending ? 'กำลังสร้าง...' : 'ยืนยันตั้งเวลาเผยแพร่'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setScheduleMode(false)} disabled={isPending} className="w-full text-gray-500">
                    ย้อนกลับ
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

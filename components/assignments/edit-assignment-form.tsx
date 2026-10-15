'use client'

import { workTypeConfig } from '@/lib/assignment-display'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ListFilter, ChevronUp, ChevronDown, X, Plus, Lock } from 'lucide-react'
import { SolutionReleaseSetting } from '@/components/assignments/solution-release-setting'
import {
  moveQuestionInSet, moveQuestionToIndex, normalizeSetSections, parseSections, removeQuestionsFromSet,
} from '@/lib/question-set-sections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { updateAssignment } from '@/lib/actions/assignments'
import { CompletionAttemptSettings } from '@/components/assignments/completion-attempt-settings'
import {
  CompletionRuleCard,
  completionRuleInputClassName,
} from '@/components/assignments/completion-rule-card'
import { CompletionThresholdUnitMenu } from '@/components/assignments/completion-threshold-unit-menu'
import type { Assignment, CompletionRule, Question, RetryScope, ScoreStrategy, ShowResultsMode } from '@/lib/types'
import {
  STREAK_TARGET_DEFAULT, STREAK_TARGET_MAX, STREAK_TARGET_MIN, STREAK_CAP_MAX, STREAK_CAP_MIN,
  decideCompletion, defaultQuestionCap, streakEligibleCount, streakExcludedCount, streakPoolAdvice,
} from '@/lib/streak-completion'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { IconButton } from '@/components/ui/icon-button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { OrderNumberInput } from '@/components/assignments/order-number-input'
import { AssignmentAnnouncementEditor } from '@/components/assignments/assignment-announcement-editor'
import { QuestionPicker } from '@/components/assignments/question-picker'
import type { BankQuestion } from '@/lib/question-bank'
import { questionExcerpt } from '@/lib/question-display'
import { SebQuitPasswordSettings } from '@/components/assignments/seb-quit-password-settings'
import type { SebQuitPasswordSetupState } from '@/lib/seb-quit-password-service.server'
import {
  InstantCheckAnswerKeySettingLabel,
  INSTANT_CHECK_SETTING_DESCRIPTION,
  INSTANT_CHECK_SETTING_LABEL,
} from '@/components/assignments/instant-check-setting-label'
import { AssignmentSettingToggle } from '@/components/assignments/assignment-setting-toggle'
import {
  RESULT_VISIBILITY_OPTIONS,
} from '@/components/assignments/result-visibility-options'
import {
  LateSubmissionScheduleFields,
  type LateBandDraft,
} from '@/components/assignments/late-submission-schedule-fields'
import { thaiLocalDateTimeToIso, toThaiLocalDateTimeInput } from '@/lib/thai-time'

const CALCULATOR_SETTING_DESCRIPTION =
  'เปิดให้นักเรียนใช้เครื่องคิดเลขวิทยาศาสตร์ภายในเว็บไซต์ระหว่างทำแบบฝึกหัดหรือข้อสอบ'
const SCRATCHPAD_SETTING_DESCRIPTION =
  'เปิดให้นักเรียนใช้กระดาษทดภายในเว็บไซต์เพื่อเขียนหรือวาดวิธีคิดระหว่างทำโจทย์'
const WORK_IMAGE_SETTING_DESCRIPTION =
  'สำหรับโจทย์เติมคำตอบตัวเลข นักเรียนต้องแนบรูปแสดงวิธีทำก่อนจึงจะส่งคำตอบได้ โดยผู้สอนต้องตรวจวิธีทำจากรูปที่แนบด้วยตนเอง'
const SHARED_RANDOM_VALUES_SETTING_DESCRIPTION =
  'กำหนดให้โจทย์ประเภทสุ่มตัวเลขใช้ตัวเลขชุดเดียวกันสำหรับนักเรียนทุกคน'

interface Props {
  assignment: EditableAssignment
  questions: EditableAssignmentQuestion[]
  /** This teacher's whole bank, for the "เพิ่มโจทย์" picker. */
  bank: BankQuestion[]
  /** True once anyone has started an attempt — the question set is then frozen. */
  hasSubmissions: boolean
  sebQuitPasswordSetup: SebQuitPasswordSetupState
}

export type EditableAssignment = Pick<
  Assignment,
  | 'id'
  | 'org_id'
  | 'created_by'
  | 'status'
  | 'title'
  | 'description'
  | 'question_ids'
  | 'question_points'
  | 'display_max_score'
  | 'start_at'
  | 'due_at'
  | 'late_bands'
  | 'end_at'
  | 'duration_minutes'
  | 'max_attempts'
  | 'mode'
  | 'type'
  | 'score_strategy'
  | 'retry_scope'
  | 'questions_per_page'
  | 'instant_check'
  | 'instant_check_answer_key'
  | 'completion_rule'
  | 'streak_target'
  | 'streak_question_cap'
  | 'streak_recycle_pool'
  | 'passing_type'
  | 'passing_value'
  | 'show_results'
  | 'show_solutions'
  | 'sections'
  | 'show_sections'
  | 'shuffle_questions'
  | 'shuffle_options'
  | 'access_code'
  | 'proctoring_enabled'
  | 'fullscreen_required'
  | 'block_clipboard'
  | 'random_question_count'
  | 'shared_random_seed'
  | 'exam_watermark_enabled'
  | 'require_work_image'
  | 'calculator_enabled'
  | 'scratchpad_enabled'
  | 'secure_browser_mode'
  | 'android_exam_mode'
>

export type EditableAssignmentQuestion = Pick<Question, 'id' | 'title' | 'question_text' | 'question_type'> & {
  /** What this question is worth before any override — see lib/question-bank.ts. */
  default_points: number
  /** Whether students can get different numbers on it — see lib/question-bank.ts. */
  has_random_values: boolean
}

export function EditAssignmentForm({ assignment: a, questions, bank, hasSubmissions, sebQuitPasswordSetup }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const assignmentNoun = a.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'
  const completionSectionLabel = `เงื่อนไขการทำ${assignmentNoun}เสร็จ`

  const assignmentSections = parseSections(a.sections)

  const [title, setTitle] = useState(a.title)
  const [description, setDescription] = useState(a.description ?? '')
  const [startAt, setStartAt] = useState(toThaiLocalDateTimeInput(a.start_at))
  const [dueAt, setDueAt] = useState(toThaiLocalDateTimeInput(a.due_at))
  const [endAt, setEndAt] = useState(toThaiLocalDateTimeInput(a.end_at))
  const [lateBands, setLateBands] = useState<LateBandDraft[]>(() => a.late_bands.map(band => ({
    id: band.id,
    startsAt: toThaiLocalDateTimeInput(band.starts_at),
    label: band.label,
    color: band.color,
  })))
  const [durationMinutes, setDurationMinutes] = useState(a.duration_minutes ? String(a.duration_minutes) : '')
  const [maxAttempts, setMaxAttempts] = useState(
    a.max_attempts ? String(a.max_attempts) : a.type === 'exam' ? '1' : ''
  )
  const [scoreStrategy, setScoreStrategy] = useState<ScoreStrategy>(a.score_strategy)
  const [retryScope, setRetryScope] = useState<RetryScope>(a.retry_scope ?? 'all')
  const [questionsPerPage, setQuestionsPerPage] = useState(String(a.questions_per_page ?? 1))
  // A แบบฝึกหัด created before this setting existed reads as off, matching the
  // migration's default — its students have been finishing the whole set
  // before seeing anything, and turning that on under a running งาน is the
  // teacher's call, not a side effect of opening the edit page.
  const [instantCheck, setInstantCheck] = useState(a.instant_check === true)
  const [instantCheckAnswerKey, setInstantCheckAnswerKey] = useState(a.instant_check_answer_key === true)
  const [showResults, setShowResults] = useState<ShowResultsMode>(a.show_results)
  // Changeable at any time, even after everyone has finished — it decides only
  // whether a เฉลยวิธีทำ opens. Ticking it late is the way to hold a ข้อสอบ's
  // เฉลย back until every class has sat it.
  const [showSolutions, setShowSolutions] = useState(a.show_solutions === true)
  const [showSections, setShowSections] = useState(a.show_sections !== false)
  const [shuffleQuestions, setShuffleQuestions] = useState(a.shuffle_questions === true)
  const [shuffleOptions, setShuffleOptions] = useState(a.shuffle_options === true)
  const [accessCode, setAccessCode] = useState(a.access_code ?? '')
  const [accessCodeEnabled, setAccessCodeEnabled] = useState(Boolean(a.access_code?.trim()))
  const [proctoringEnabled, setProctoringEnabled] = useState(a.proctoring_enabled)
  const [fullscreenRequired, setFullscreenRequired] = useState(a.fullscreen_required)
  const [blockClipboard, setBlockClipboard] = useState(a.block_clipboard)
  const initialRandomQuestionCount = a.random_question_count
  const [randomQuestionCount, setRandomQuestionCount] = useState(
    initialRandomQuestionCount != null ? String(initialRandomQuestionCount) : ''
  )
  const [sharedRandomValues, setSharedRandomValues] = useState(a.shared_random_seed != null)
  const [examWatermarkEnabled, setExamWatermarkEnabled] = useState(a.exam_watermark_enabled)
  const [secureBrowserMode, setSecureBrowserMode] = useState(a.secure_browser_mode ?? 'browser')
  const [androidExamMode, setAndroidExamMode] = useState(a.android_exam_mode ?? 'blocked')
  const [requireWorkImage, setRequireWorkImage] = useState(a.require_work_image ?? false)
  const [calculatorEnabled, setCalculatorEnabled] = useState(a.calculator_enabled ?? false)
  const [scratchpadEnabled, setScratchpadEnabled] = useState(a.scratchpad_enabled ?? false)
  const requestedInitialCompletionRule = a.completion_rule ?? 'fixed'
  const [completionRule, setCompletionRule] = useState<CompletionRule>(
    requestedInitialCompletionRule === 'streak' && initialRandomQuestionCount == null && !hasSubmissions
      ? 'fixed'
      : requestedInitialCompletionRule,
  )
  const [streakTarget, setStreakTarget] = useState(
    a.streak_target != null ? String(a.streak_target) : String(STREAK_TARGET_DEFAULT)
  )
  const [streakCapEnabled, setStreakCapEnabled] = useState(a.streak_question_cap != null)
  const [streakCap, setStreakCap] = useState(
    String(a.streak_question_cap ?? defaultQuestionCap(a.streak_target ?? STREAK_TARGET_DEFAULT))
  )
  const [streakRecycle, setStreakRecycle] = useState(a.streak_recycle_pool !== false)
  const [passingEnabled, setPassingEnabled] = useState(a.passing_type != null && a.passing_value != null)
  const [passingType, setPassingType] = useState<'score' | 'percent'>(a.passing_type ?? 'percent')
  const [passingValue, setPassingValue] = useState(a.passing_value != null
    ? String(a.passing_value) : passingType === 'percent' ? '70' : '7')
  const accessCodeInvalid = accessCodeEnabled && !accessCode.trim()

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
  const questionsById = new Map<string, { id: string; title: string; question_text: string; question_type?: string; has_random_values?: boolean }>()
  for (const q of [...questions, ...bank]) questionsById.set(q.id, q)
  const orderedQuestions = questionIds.map(
    id => questionsById.get(id) ?? { id, title: 'โจทย์ที่ไม่พบ', question_text: '' }
  )
  const parsedRandomQuestionCount = Number(randomQuestionCount)
  const randomDrawOn = randomQuestionCount.trim() !== ''
    && Number.isInteger(parsedRandomQuestionCount)
    && parsedRandomQuestionCount > 0
    && parsedRandomQuestionCount < questionIds.length

  // Only เติมคำตอบตัวเลข has working to photograph, so the ask appears exactly
  // when this งาน holds one — and follows the list as the teacher edits it.
  const hasWorkImageQuestions = orderedQuestions.some(q => q.question_type === 'written')
  // "ตัวเลขชุดเดียวกัน" follows the list the same way, and freezes with it:
  // once anyone has started, their numbers are already drawn one way or the
  // other, so switching would split the class in two.
  const randomValueQuestionCount = orderedQuestions.filter(q => 'has_random_values' in q && q.has_random_values).length

  // ── เงื่อนไขจบงาน ────────────────────────────────────────────────────────
  // Same resolver as the create wizard and updateAssignment, so all three
  // agree on whether this งาน can end on a run of correct answers. Read off
  // the list as the teacher edits it, not off the stored set.
  const poolQuestionTypes = orderedQuestions.map(q => q.question_type ?? '')
  const streakEligible = streakEligibleCount(poolQuestionTypes)
  const streakExcluded = streakExcludedCount(poolQuestionTypes)
  const streakCapValue = streakCapEnabled && streakCap.trim() !== '' ? Number(streakCap) : null
  const streakDecision = decideCompletion({
    requested: 'streak',
    target: Number(streakTarget),
    questionCap: streakCapValue,
    recyclePool: streakRecycle,
    poolQuestionTypes,
  })
  const streakBlocked = streakDecision.refusedReason
  const streakAdvice = streakBlocked ? null : streakPoolAdvice(poolQuestionTypes, streakDecision.target as number)
  const streakOffered = a.mode === 'online'
  const streakAvailable = streakOffered && randomDrawOn
  const streakOn = completionRule === 'streak'
  // The rule and the target are what passing means, so both freeze the moment
  // anyone starts — otherwise two students' results measure different things.
  // The ceiling and pool recycling stay editable: relaxing either does not
  // change what "ผ่าน" means. The server refuses the locked pair as well.
  const canEditCompletion = !hasSubmissions
  const completionChoice: 'complete' | 'threshold' | 'streak' =
    streakOn ? 'streak' : (passingEnabled ? 'threshold' : 'complete')

  function chooseCompletion(choice: 'complete' | 'threshold' | 'streak') {
    if (!canEditCompletion) return
    if (choice === 'streak' && !streakAvailable) return
    if (choice === 'streak') {
      setCompletionRule('streak')
      setPassingEnabled(false)
      return
    }
    setCompletionRule('fixed')
    setPassingEnabled(choice === 'threshold')
  }

  function applyQuestionChange(next: { sections: typeof sections; question_ids: string[] }) {
    setSections(next.sections)
    setQuestionIds(next.question_ids)
  }

  // Staged like the แฟ้มโจทย์ picker: nothing changes until ยืนยัน, so a
  // mis-tick in a bank of a thousand is not an instant edit.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [confirmingPickerDiscard, setConfirmingPickerDiscard] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerDiff, setPickerDiff] = useState('all')
  const pickerAdded = draftIds.filter(id => !questionIds.includes(id))
  const pickerRemoved = questionIds.filter(id => !draftIds.includes(id))
  const pickerDirty = pickerAdded.length > 0 || pickerRemoved.length > 0

  function handlePickerOpenChange(open: boolean) {
    if (!open && pickerDirty) {
      setConfirmingPickerDiscard(true)
      return
    }
    setPickerOpen(open)
  }

  function discardPickerChanges() {
    setDraftIds(questionIds)
    setPickerOpen(false)
  }

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

  // Every question starts at its existing override, or at the point value its
  // own structure gives it; teacher can edit individual questions and the
  // total recalculates automatically.
  const [questionPointDrafts, setQuestionPointDrafts] = useState<Record<string, string>>(
    Object.fromEntries(questions.map(q => [q.id, String(a.question_points?.[q.id] ?? q.default_points)]))
  )

  // What a question is worth until the teacher types over it — one คะแนน per
  // ข้อย่อย. A question the picker adds later needs it too, so this covers the
  // bank as well as the questions the งาน came with.
  const defaultPointsById = new Map<string, number>(
    [...questions, ...bank].map(q => [q.id, q.default_points]),
  )
  const pointsDraft = (id: string) => questionPointDrafts[id] ?? String(defaultPointsById.get(id) ?? 1)

  const pointsSum = Math.round(
    questionIds.reduce((sum, id) => sum + (Number.parseFloat(pointsDraft(id)) || 0), 0) * 100
  ) / 100
  const automaticDisplayMax = randomDrawOn ? parsedRandomQuestionCount : pointsSum

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
    if (!title.trim()) { toast.error('กรุณากรอกชื่องานที่มอบหมาย'); return }

    if (questionIds.length === 0) { toast.error('ชุดข้อสอบต้องมีโจทย์อย่างน้อย 1 ข้อ'); return }

    if (accessCodeEnabled && !accessCode.trim()) {
      toast.error('กรุณากรอกรหัสผ่านเข้าทำ')
      return
    }

    const questionPoints = Object.fromEntries(
      questionIds.map(id => {
        if (randomDrawOn) return [id, 1] as const
        const parsed = Number.parseFloat(pointsDraft(id))
        return [id, Number.isFinite(parsed) && parsed > 0 ? parsed : 1] as const
      })
    )

    const parsedDisplayMax = Number.parseFloat(displayMaxScore)
    const displayMax = displayMaxScore.trim() !== '' && Number.isFinite(parsedDisplayMax) && parsedDisplayMax > 0
      ? parsedDisplayMax
      : null

    if (completionChoice === 'threshold' && (passingValue.trim() === '' || !Number.isFinite(Number(passingValue)) || Number(passingValue) < 0 || (passingType === 'percent' && Number(passingValue) > 100))) {
      toast.error('กรุณากรอกเกณฑ์ผ่านให้ถูกต้อง')
      return
    }
    startTransition(async () => {
      const res = await updateAssignment(a.id, {
        title: title.trim(),
        description,
        access_code: accessCodeEnabled ? accessCode.trim() : null,
        start_at: thaiLocalDateTimeToIso(startAt),
        end_at: thaiLocalDateTimeToIso(endAt),
        ...(!hasSubmissions ? {
          due_at: thaiLocalDateTimeToIso(dueAt),
          late_bands: lateBands.map(band => ({
            id: band.id,
            starts_at: thaiLocalDateTimeToIso(band.startsAt) ?? band.startsAt,
            label: band.label,
            color: band.color,
          })),
        } : {}),
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        max_attempts: completionChoice === 'complete' && maxAttempts ? Number(maxAttempts) : null,
        score_strategy: completionChoice === 'complete' ? scoreStrategy : 'best',
        retry_scope: retryScope,
        questions_per_page: Number(questionsPerPage) || 1,
        ...(hasSubmissions ? {} : {
          shuffle_questions: shuffleQuestions,
          shuffle_options: shuffleOptions,
        }),
        instant_check: instantCheck,
        instant_check_answer_key: instantCheckAnswerKey,
        completion_rule: completionRule,
        streak_target: streakOn ? Number(streakTarget) : null,
        streak_question_cap: streakOn ? streakCapValue : null,
        streak_recycle_pool: streakRecycle,
        // Cleared for a streak งาน for the same reason the controls are hidden:
        // a variable-length attempt has no fixed total to take a share of, and
        // the database refuses the pair.
        passing_type: streakOn ? null : (passingEnabled && passingValue ? passingType : null),
        passing_value: streakOn ? null : (passingEnabled && passingValue ? Number(passingValue) : null),
        // Sent only when the teacher could actually change it, so a frozen
        // assignment never trips the server's "already started" refusal just
        // by saving an unrelated field.
        ...(canEditQuestions ? { question_ids: questionIds } : {}),
        question_points: questionPoints,
        display_max_score: displayMax,
        show_results: showResults,
        show_solutions: showSolutions,
        show_sections: showSections,
        proctoring_enabled: proctoringEnabled,
        fullscreen_required: fullscreenRequired,
        block_clipboard: blockClipboard,
        random_question_count: randomQuestionCount ? Number(randomQuestionCount) : null,
        exam_watermark_enabled: examWatermarkEnabled,
        secure_browser_mode: secureBrowserMode,
        android_exam_mode: secureBrowserMode === 'seb_required' ? androidExamMode : 'blocked',
        require_work_image: hasWorkImageQuestions && requireWorkImage,
        calculator_enabled: a.mode === 'online' && calculatorEnabled,
        scratchpad_enabled: a.mode === 'online' && scratchpadEnabled,
        // Sent only while it can still change, like question_ids above, so
        // saving a started งาน never trips the server's refusal.
        ...(hasSubmissions ? {} : { shared_random_values: randomValueQuestionCount > 0 && sharedRandomValues }),
      })
      if (res?.error) { toast.error(res.error); return }
      toast.success('บันทึกการแก้ไขแล้ว')
      router.push(`/assignments/${a.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">ข้อมูลพื้นฐาน</h2>
        <div className="space-y-1.5">
          <Label htmlFor="edit-title">ชื่องานที่มอบหมาย</Label>
          <Input id="edit-title" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>ชี้แจงรายละเอียดเพิ่มเติม</Label>
          <p data-assignment-description className="text-xs text-muted-foreground">
            นักเรียนจะเห็นข้อความและรูปนี้ก่อนเข้าทำ{assignmentNoun} สามารถพิมพ์ วาง หรือลากรูปลงในช่องได้
          </p>
          <AssignmentAnnouncementEditor value={description} onChange={setDescription} />
        </div>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">โจทย์ คะแนน และเวลา</h2>
          <span className="text-sm font-semibold text-primary shrink-0">
            {questionIds.length} ข้อ · {randomDrawOn ? 'ข้อละ 1 คะแนน' : `รวม ${pointsSum} คะแนน`}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-foreground">คะแนนแต่ละข้อ</h3>
        {randomDrawOn ? (
          <p className="text-xs text-muted-foreground">
            งานที่สุ่มโจทย์คิดคะแนนตามจำนวนข้อที่ตอบถูก โดยกำหนดให้ทุกข้อมีค่า 1 คะแนน
            จึงไม่ใช้คะแนนรายข้อที่ตั้งไว้ในโหมดนี้
          </p>
        ) : canEditQuestions ? (
          <p className="text-xs text-muted-foreground">
            เพิ่ม เอาออก และสลับลำดับข้อได้ เพราะยังไม่มีนักเรียนเริ่มทำชุดนี้ —
            ย้ายทีละขั้นด้วยลูกศร หรือพิมพ์เลขข้อที่ต้องการลงในช่องซ้ายมือแล้วกด Enter
            ค่าเริ่มต้นคิดตามจำนวนข้อย่อยในโจทย์ (ข้อย่อย 1 ข้อ = 1 คะแนน) ระบบรวมให้อัตโนมัติ
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-foreground">
            <Lock className="mt-px size-3.5 shrink-0 text-warning" />
            <span>
              มีนักเรียนเริ่มทำชุดนี้แล้ว จึงเพิ่ม เอาออก หรือสลับลำดับข้อไม่ได้ —
              ชุดโจทย์ถูกตรึงไว้กับการทำแต่ละครั้งตั้งแต่ตอนกดเริ่ม การแก้ตอนนี้จะทำให้คนที่ทำทีหลังได้ข้อสอบคนละชุด
              และคะแนนเต็มไม่เท่ากัน ส่วนคะแนนรายข้อยังแก้ได้ (มีผลกับการทำครั้งใหม่เท่านั้น)
            </span>
          </p>
        )}

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {orderedQuestions.map((q, i) => (
            <div key={q.id} className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-border sm:flex-nowrap">
              <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
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
              </div>
              <Input
                type="number"
                min={0}
                step="any"
                value={randomDrawOn ? '1' : pointsDraft(q.id)}
                aria-label={`คะแนนข้อ ${i + 1}`}
                disabled={randomDrawOn}
                title={randomDrawOn ? 'โหมดสุ่มกำหนดให้ทุกข้อมีค่า 1 คะแนน' : undefined}
                onChange={e => setQuestionPointDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                className="w-16 text-center shrink-0 sm:w-20"
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
        {a.mode === 'online' && (
          <>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2">
              {streakOn && (
                <p className="text-xs text-muted-foreground rounded-lg bg-muted px-3 py-2">
                  {completionSectionLabel}เป็น “ทำถูกติดต่อกัน {streakTarget} ข้อ” — หน้าทำโจทย์แสดงทีละ 1 ข้อ และเปิดการตรวจทีละข้อให้เสมอ
                  ปรับสองอย่างนี้ที่นี่ไม่ได้
                </p>
              )}

              {!streakOn && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-per-page" className="flex items-center gap-1.5">
                    <ListFilter className="w-4 h-4 text-muted-foreground" /> จำนวนข้อต่อหนึ่งหน้า
                  </Label>
                  <Input
                    id="edit-per-page"
                    type="number"
                    min={1}
                    max={50}
                    value={questionsPerPage}
                    onChange={e => setQuestionsPerPage(e.target.value)}
                    className="max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    1 = แสดงทีละข้อเหมือนเดิม · เป็นการจัดหน้าจออย่างเดียว ไม่กระทบคะแนน และมีผลทันทีแม้กับคนที่กำลังทำอยู่
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-duration">เวลาทำ (นาที)</Label>
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
          </>
        )}
      </Card>

      {questionIds.length > 0 && (
        <Card padding="md" className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">ชุดโจทย์ที่นักเรียนได้รับ</h2>
            <p data-assignment-description className="text-xs text-muted-foreground">
              คลังของงานนี้ {questionIds.length} ข้อ — เลือกว่าจะให้นักเรียนทำทั้งหมด หรือสุ่มมาบางข้อ
            </p>
          </div>

          {a.mode === 'online' && questionIds.length >= 2 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={hasSubmissions}
              onClick={() => {
                setRandomQuestionCount('')
                if (completionRule === 'streak' && canEditCompletion) {
                  setCompletionRule('fixed')
                  setPassingEnabled(false)
                }
              }}
              className={`rounded-lg border border-border p-2.5 text-left transition-colors ${
                !randomDrawOn ? 'bg-primary/10 shadow-sm' : 'bg-card hover:bg-muted/50'
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <p className="text-sm font-medium text-foreground">ให้ทำทุกข้อ</p>
              <p data-assignment-description className="text-xs text-muted-foreground">นักเรียนทุกคนได้รับโจทย์ที่เลือกไว้ทั้งหมด</p>
            </button>
            <button
              type="button"
              disabled={hasSubmissions}
              onClick={() => {
                if (!randomDrawOn) setRandomQuestionCount(String(Math.min(5, questionIds.length - 1)))
              }}
              className={`rounded-lg border border-border p-2.5 text-left transition-colors ${
                randomDrawOn ? 'bg-primary/10 shadow-sm' : 'bg-card hover:bg-muted/50'
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <p className="text-sm font-medium text-foreground">สุ่มจากโจทย์ที่เลือกข้างต้น</p>
              <p data-assignment-description className="text-xs text-muted-foreground">นักเรียนแต่ละคนและแต่ละรอบอาจได้รับชุดโจทย์ต่างกัน</p>
            </button>
          </div>
          )}

          {randomDrawOn && (
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="edit-random-question-count">ให้นักเรียนทำ</Label>
              <Input
                id="edit-random-question-count"
                type="number"
                min={1}
                max={Math.max(1, questionIds.length - 1)}
                value={randomQuestionCount}
                onChange={event => {
                  const nextValue = event.target.value
                  setRandomQuestionCount(nextValue)
                  if (nextValue.trim() === '' && completionRule === 'streak' && canEditCompletion) {
                    setCompletionRule('fixed')
                    setPassingEnabled(false)
                  }
                }}
                disabled={hasSubmissions}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">ข้อ จากคลัง {questionIds.length} ข้อ</span>
            </div>
          )}

          {hasSubmissions && (
            <p className="text-xs text-muted-foreground">ล็อกการจ่ายชุดโจทย์แล้ว เพราะมีนักเรียนเริ่มทำงานนี้</p>
          )}

          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-display-max-score">คะแนนเต็มที่แสดงผล</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="edit-display-max-score"
                type="number"
                min={0}
                step="any"
                value={displayMaxScore}
                onChange={e => setDisplayMaxScore(e.target.value)}
                placeholder={randomDrawOn
                  ? `อัตโนมัติ (${automaticDisplayMax})`
                  : `ไม่ปรับ (เท่ากับ ${pointsSum})`}
                className="max-w-[180px]"
              />
              <span className="text-sm text-muted-foreground">คะแนน</span>
            </div>
            <p data-assignment-description className="text-xs text-muted-foreground">
              เว้นว่างเพื่อใช้คะแนนเต็มอัตโนมัติ หรือกรอกค่าที่ต้องการเพื่อปรับสเกลผลรวม โดยไม่เปลี่ยนคะแนนดิบ
            </p>
          </div>
        </Card>
      )}

      <Card radius="md" padding="sm" className="space-y-2.5">
        <div>
            <h2 className="text-sm font-semibold text-foreground">{completionSectionLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {canEditCompletion
                ? 'นักเรียนทำถึงตรงไหนถือว่าเสร็จ และครูวัดว่าผ่านจากอะไร'
                : 'ล็อกแล้วเพราะมีนักเรียนเริ่มทำ — เปลี่ยนตอนนี้จะทำให้ผลของคนที่ทำไปแล้วเทียบกับคนที่ทำทีหลังไม่ได้'}
            </p>
        </div>

        <div data-completion-rules role="group" aria-label={completionSectionLabel} className={`grid grid-cols-1 gap-2 ${streakOffered ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <CompletionRuleCard
            selected={completionChoice === 'complete'}
            disabled={!canEditCompletion}
            label="อนุญาตให้ทำ"
            description={`นักเรียนทำ${assignmentNoun}ได้ไม่เกินจำนวนครั้งที่กำหนด`}
            onSelect={() => chooseCompletion('complete')}
          >
            <div className="flex flex-wrap items-center gap-1 text-sm font-medium text-foreground">
              <span>อนุญาตให้ทำ</span>
              <Input
                id="edit-attempts"
                type="number"
                min={1}
                step={1}
                value={maxAttempts}
                onFocus={() => chooseCompletion('complete')}
                onChange={event => {
                  const value = event.target.value
                  setMaxAttempts(value)
                  if (value === '1') setRetryScope('all')
                }}
                placeholder="ไม่จำกัด"
                disabled={!canEditCompletion}
                aria-label="จำนวนครั้งที่อนุญาตให้ทำ"
                className={completionRuleInputClassName}
              />
              <span>ครั้ง</span>
            </div>
          </CompletionRuleCard>

          <CompletionRuleCard
            selected={completionChoice === 'threshold'}
            disabled={!canEditCompletion}
            label="ผ่านเกณฑ์"
            description={`นักเรียนทำ${assignmentNoun}ซ้ำได้โดยไม่จำกัดจำนวนครั้ง จนได้คะแนนถึงเกณฑ์ที่กำหนด จึงถือว่าทำ${assignmentNoun}เสร็จ`}
            onSelect={() => chooseCompletion('threshold')}
          >
            <div className="flex flex-nowrap items-center gap-1 text-sm font-medium text-foreground">
              <span className="whitespace-nowrap">ผ่านเกณฑ์</span>
              <Input
                type="number"
                min={0}
                max={passingType === 'percent' ? 100 : undefined}
                value={passingValue}
                onFocus={() => chooseCompletion('threshold')}
                onChange={event => setPassingValue(event.target.value)}
                disabled={!canEditCompletion}
                aria-label="ค่าเกณฑ์ผ่าน"
                className={completionRuleInputClassName}
              />
              <CompletionThresholdUnitMenu
                value={passingType}
                disabled={!canEditCompletion}
                onValueChange={value => {
                  chooseCompletion('threshold')
                  setPassingType(value)
                }}
              />
            </div>
          </CompletionRuleCard>

          {streakOffered && (
            <CompletionRuleCard
              selected={completionChoice === 'streak'}
              disabled={!canEditCompletion || !streakAvailable}
              label="ทำถูกติดต่อกัน"
              description={`${!streakAvailable ? 'ใช้ได้เมื่อเลือก “สุ่มจากโจทย์ที่เลือกข้างต้น” ' : ''}นักเรียนต้องตอบถูกติดต่อกันครบตามจำนวนที่กำหนด จึงถือว่าทำ${assignmentNoun}เสร็จ`}
              onSelect={() => chooseCompletion('streak')}
            >
              <div className="flex flex-wrap items-center gap-1 text-sm font-medium text-foreground">
                <span>ทำถูกติดต่อกัน</span>
                <Input
                  type="number"
                  min={STREAK_TARGET_MIN}
                  max={STREAK_TARGET_MAX}
                  value={streakTarget}
                  onFocus={() => chooseCompletion('streak')}
                  onChange={event => setStreakTarget(event.target.value)}
                  disabled={!canEditCompletion || !streakAvailable}
                  aria-label="จำนวนข้อที่ต้องทำถูกติดต่อกัน"
                  className={completionRuleInputClassName}
                />
                <span>ข้อ</span>
              </div>
            </CompletionRuleCard>
          )}
        </div>

        {completionChoice === 'complete' && (
          <CompletionAttemptSettings id="edit-attempts" maxAttempts={maxAttempts}
            scoreStrategy={scoreStrategy} onScoreStrategyChange={setScoreStrategy} />
        )}
        {completionChoice !== 'complete' && (
          <p className="text-xs text-muted-foreground">ทำรอบใหม่ได้จนกว่าจะผ่าน เมื่อผ่านแล้วจะเริ่มรอบใหม่ไม่ได้ · เก็บคะแนนจากรอบที่ดีที่สุด</p>
        )}

        {completionChoice === 'streak' && (
          <div className="space-y-3 p-4 rounded-xl border border-border">
            {/* The ceiling and pool recycling stay editable after students
                start: neither changes what passing means. */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
                <div>
                  <p className="text-sm font-medium text-foreground">หยุดให้เองเมื่อทำครบจำนวนที่กำหนด</p>
                  <p className="text-xs text-muted-foreground">ถึงเพดานแล้วจบเป็น “ยังไม่ผ่าน”</p>
                </div>
                <input
                  type="checkbox"
                  checked={streakCapEnabled}
                  onChange={event => setStreakCapEnabled(event.target.checked)}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
              {streakCapEnabled && (
                <div className="flex items-center gap-2 pl-3">
                  <Input
                    type="number"
                    aria-label="จำนวนข้อสูงสุดก่อนหยุด"
                    min={STREAK_CAP_MIN}
                    max={STREAK_CAP_MAX}
                    value={streakCap}
                    onChange={event => setStreakCap(event.target.value)}
                    className="max-w-[100px]"
                  />
                  <span className="text-sm text-muted-foreground">ข้อ</span>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
              <div>
                <p className="text-sm font-medium text-foreground">ทำครบคลังแล้ววนกลับมาใหม่</p>
                <p className="text-xs text-muted-foreground">
                  โจทย์สุ่มตัวเลขได้ตัวเลขชุดใหม่ ข้อคงที่ซ้ำของเดิม · ปิดไว้ = ทำครบคลังแล้วจบเลย
                </p>
              </div>
              <input
                type="checkbox"
                checked={streakRecycle}
                onChange={event => setStreakRecycle(event.target.checked)}
                className="accent-primary w-4 h-4 shrink-0"
              />
            </label>

            {streakBlocked && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{streakBlocked}</p>
            )}
            {!streakBlocked && streakExcluded > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
                ข้อเขียนและข้อส่งไฟล์ {streakExcluded} ข้อจะไม่ถูกสุ่มมาในโหมดนี้ — เหลือโจทย์ที่ใช้ได้ {streakEligible} ข้อ
              </p>
            )}
            {streakAdvice && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">{streakAdvice}</p>
            )}

            {/* Same reason as in the create wizard: this mode hides the
                ตรวจทีละข้อ switch because it is forced on, but whether the
                check reveals the เฉลย is still the teacher's to choose. */}
            <div className="border-t border-border pt-3">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
                <p className="text-sm font-medium text-foreground">
                  <InstantCheckAnswerKeySettingLabel />
                </p>
                <input
                  type="checkbox"
                  checked={instantCheckAnswerKey}
                  onChange={event => setInstantCheckAnswerKey(event.target.checked)}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
            </div>

            <p className="text-xs text-muted-foreground">
              โหมดนี้ตั้งให้เอง: เปิดการตรวจทีละข้อ · แสดงทีละ 1 ข้อ · ไม่ใช้เกณฑ์คะแนน/เปอร์เซ็นต์ ·
              เก็บคะแนนจากรอบที่ดีที่สุด · รอบใหม่เริ่มใหม่ทั้งชุด
            </p>
          </div>
        )}
      </Card>

      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          {a.type === 'exam' ? 'ตั้งค่าข้อสอบ' : 'ตั้งค่าแบบฝึกหัด'}
        </h2>

        <div className="space-y-2">
          {a.mode === 'online' && a.type === 'exercise' && !streakOn && (
            <AssignmentSettingToggle
              label={INSTANT_CHECK_SETTING_LABEL}
              description={INSTANT_CHECK_SETTING_DESCRIPTION}
              descriptionOnHover
              checked={instantCheck}
              onCheckedChange={setInstantCheck}
              footer={instantCheck ? (
                <div className="pl-3">
                  <label className="flex min-h-10 cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2 transition-colors hover:border-ring">
                    <p className="text-sm font-medium text-foreground"><InstantCheckAnswerKeySettingLabel /></p>
                    <input
                      type="checkbox"
                      checked={instantCheckAnswerKey}
                      onChange={event => setInstantCheckAnswerKey(event.target.checked)}
                      className="size-4 shrink-0 accent-primary"
                    />
                  </label>
                </div>
              ) : null}
            />
          )}

          <AssignmentSettingToggle
            label="กำหนดรหัสผ่านเข้าทำ"
            description="กำหนดให้นักเรียนกรอกรหัสผ่านที่ครูตั้งไว้ก่อนเริ่มทำแบบฝึกหัดหรือข้อสอบ"
            descriptionOnHover
            checked={accessCodeEnabled}
            onCheckedChange={setAccessCodeEnabled}
            footer={accessCodeEnabled ? (
              <div className="space-y-1.5 pl-3">
                <Label htmlFor="edit-access-code">รหัสผ่านเข้าทำ</Label>
                <Input
                  id="edit-access-code"
                  value={accessCode}
                  onChange={event => setAccessCode(event.target.value)}
                  placeholder="กรอกรหัสผ่านที่นักเรียนต้องใช้"
                  aria-invalid={accessCodeInvalid}
                  className="max-w-sm"
                />
                {accessCodeInvalid && <p role="alert" className="text-xs text-destructive">กรุณากรอกรหัสผ่านเข้าทำ</p>}
              </div>
            ) : null}
          />

          {a.mode === 'online' && (
            <>
              <AssignmentSettingToggle
                label="เครื่องคิดเลขวิทยาศาสตร์"
                description={CALCULATOR_SETTING_DESCRIPTION}
                descriptionOnHover
                checked={calculatorEnabled}
                onCheckedChange={setCalculatorEnabled}
                disabled={hasSubmissions}
                disabledMessage={hasSubmissions ? 'ล็อกค่าแล้ว เพราะมีนักเรียนเริ่มทำงานนี้' : undefined}
              />
              <AssignmentSettingToggle
                label="กระดาษทด"
                description={SCRATCHPAD_SETTING_DESCRIPTION}
                descriptionOnHover
                checked={scratchpadEnabled}
                onCheckedChange={setScratchpadEnabled}
                disabled={hasSubmissions}
                disabledMessage={hasSubmissions ? 'ล็อกค่าแล้ว เพราะมีนักเรียนเริ่มทำงานนี้' : undefined}
              />
            </>
          )}

          {assignmentSections.length > 0 && (
            <AssignmentSettingToggle
              label="แสดงชื่อแฟ้มย่อยให้นักเรียนเห็น"
              description={`${assignmentSections.length} แฟ้มย่อย — ลำดับและเลขข้อไม่เปลี่ยนไม่ว่าจะเปิดหรือปิด`}
              checked={showSections}
              onCheckedChange={setShowSections}
            />
          )}

          <AssignmentSettingToggle
            label="สับลำดับข้อ"
            description={randomDrawOn
              ? 'ระบบจะสับลำดับข้อในชุดโจทย์ที่สุ่มให้นักเรียนแต่ละคน ทำให้ลำดับข้อแตกต่างกัน'
              : 'นักเรียนทุกคนได้รับโจทย์ชุดเดียวกัน แต่ระบบจะสับลำดับข้อให้แต่ละคนแตกต่างกัน'}
            descriptionOnHover
            checked={shuffleQuestions}
            onCheckedChange={setShuffleQuestions}
            disabled={hasSubmissions}
            disabledMessage={hasSubmissions ? 'ล็อกค่าแล้ว เพราะมีนักเรียนเริ่มทำงานนี้' : undefined}
          />
          <AssignmentSettingToggle
            label="สลับลำดับตัวเลือก"
            description="สลับลำดับตัวเลือกของโจทย์ปรนัยให้นักเรียนแต่ละคนได้รับลำดับที่แตกต่างกัน"
            descriptionOnHover
            checked={shuffleOptions}
            onCheckedChange={setShuffleOptions}
            disabled={hasSubmissions}
            disabledMessage={hasSubmissions ? 'ล็อกค่าแล้ว เพราะมีนักเรียนเริ่มทำงานนี้' : undefined}
          />

          {randomValueQuestionCount > 0 && (
            <AssignmentSettingToggle
              label="ให้นักเรียนได้ตัวเลขชุดเดียวกัน"
              description={SHARED_RANDOM_VALUES_SETTING_DESCRIPTION}
              descriptionOnHover
              checked={sharedRandomValues}
              onCheckedChange={setSharedRandomValues}
              disabled={hasSubmissions}
              disabledMessage={hasSubmissions ? 'ล็อกค่าแล้ว เพราะมีนักเรียนเริ่มทำงานนี้' : undefined}
            />
          )}

          {hasWorkImageQuestions && (
            <AssignmentSettingToggle
              label="ให้นักเรียนแนบรูปแสดงวิธีทำ"
              description={WORK_IMAGE_SETTING_DESCRIPTION}
              descriptionOnHover
              checked={requireWorkImage}
              onCheckedChange={setRequireWorkImage}
            />
          )}

          {a.mode === 'online' && (completionChoice !== 'complete' || maxAttempts !== '1') && !randomDrawOn && !streakOn && (
            <AssignmentSettingToggle
              label="แก้ไขเฉพาะข้อที่ไม่ถูกต้อง/ได้คะแนนไม่เต็ม"
              description="รอบต่อไปนักเรียนทำเฉพาะข้อที่ผิดหรือได้คะแนนไม่เต็ม ข้อที่ถูกแล้วยกคะแนนมาให้"
              checked={retryScope === 'wrong_only'}
              onCheckedChange={checked => setRetryScope(checked ? 'wrong_only' : 'all')}
              footer={retryScope === 'wrong_only' && showResults === 'immediate' ? (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
                  ตอนนี้ตั้งให้แสดงคำตอบที่ถูกทันทีหลังส่ง นักเรียนจึงเห็นคำตอบก่อนกลับมาแก้ข้อที่ผิด
                </p>
              ) : null}
            />
          )}
        </div>

        {a.mode === 'online' && a.type === 'exam' && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <AssignmentSettingToggle
              label="บังคับใช้ Safe Exam Browser"
              description="ล็อกเครื่องและตรวจ Config Key + Browser Exam Key ก่อนเข้าถึงการทำข้อสอบ"
              checked={secureBrowserMode === 'seb_required'}
              onCheckedChange={enabled => {
                setSecureBrowserMode(enabled ? 'seb_required' : 'browser')
                if (enabled) setProctoringEnabled(true)
                else setAndroidExamMode('blocked')
              }}
              disabled={hasSubmissions}
              disabledMessage={hasSubmissions ? 'ล็อกค่าแล้ว เพราะมีนักเรียนเริ่มทำข้อสอบนี้' : undefined}
            />
            <p className="text-xs leading-5 text-foreground">
              เผยแพร่ได้เมื่อรหัสออกและไฟล์ SEB ของข้อสอบรุ่นเดียวกันผ่านการตรวจแล้ว ·{' '}
              <Link href="/settings/exam-defaults" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                ตรวจความพร้อม SEB
              </Link>
              {a.secure_browser_mode !== 'seb_required' && secureBrowserMode === 'seb_required'
                ? ' · เมื่อบันทึก ระบบจะเก็บข้อสอบเป็นร่างจนกว่าไฟล์ SEB รุ่นนี้จะพร้อม'
                : ''}
            </p>
            {secureBrowserMode === 'seb_required' && (
              <div className="space-y-2 border-t border-border pt-3">
                <AssignmentSettingToggle
                  label="อนุญาต Android แบบครูตรวจเครื่อง"
                  description="นักเรียนต้องขออนุมัติหน้าห้องสอบ ระบบแจ้งเมื่อออกจากหน้า แต่เว็บป้องกันการแคปหน้าจอระดับระบบไม่ได้"
                  checked={androidExamMode === 'monitored'}
                  onCheckedChange={enabled => {
                    setAndroidExamMode(enabled ? 'monitored' : 'blocked')
                    if (enabled) setProctoringEnabled(true)
                  }}
                  disabled={hasSubmissions}
                />
                <SebQuitPasswordSettings assignmentId={a.id} initialState={sebQuitPasswordSetup} />
              </div>
            )}
          </div>
        )}

        {a.mode === 'online' && a.type === 'exam' && (
          <AssignmentSettingToggle
            label="แสดงลายน้ำผู้เข้าสอบ"
            description="แสดงชื่อ รหัส attempt และเวลาบนหน้าข้อสอบ เพื่อลดการส่งภาพต่อ แต่ไม่สามารถกัน screenshot ได้ทั้งหมด"
            checked={examWatermarkEnabled}
            onCheckedChange={setExamWatermarkEnabled}
          />
        )}

        {a.mode === 'online' && a.type === 'exam' && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <AssignmentSettingToggle
              label="เปิดห้องคุมสอบสด"
              description="ครูเห็นสถานะออนไลน์ เต็มจอ และเหตุการณ์ที่ควรตรวจสอบแบบเรียลไทม์ ส่วนการนับสลับแท็บในข้อสอบทำงานอัตโนมัติอยู่แล้ว"
              checked={proctoringEnabled}
              onCheckedChange={enabled => setProctoringEnabled(secureBrowserMode === 'seb_required' ? true : enabled)}
              disabled={secureBrowserMode === 'seb_required'}
            />
            {proctoringEnabled && (
              <div className="space-y-2 border-t border-border pt-3">
                <AssignmentSettingToggle
                  label="บังคับกลับเข้าโหมดเต็มจอ"
                  description="หากออกจากเต็มจอ หน้าข้อสอบจะถูกบังจนกว่าจะกลับเข้า"
                  checked={fullscreenRequired}
                  onCheckedChange={setFullscreenRequired}
                />
                <AssignmentSettingToggle
                  label="ปิดการคัดลอก วาง และเมนูคลิกขวา"
                  description="ลดการนำข้อความออกจากหน้า แต่ไม่สามารถกันภาพถ่ายหรือเครื่องมือระดับระบบได้ทั้งหมด"
                  checked={blockClipboard}
                  onCheckedChange={setBlockClipboard}
                />
                <p className="text-xs text-foreground">เวลาในข้อสอบยังเดินต่อเมื่อออกจากแท็บหรือเต็มจอ</p>
              </div>
            )}
          </div>
        )}

        <SolutionReleaseSetting
          checked={showSolutions}
          onChange={setShowSolutions}
          assignmentType={a.type}
          maxAttempts={maxAttempts}
          untilPassed={completionChoice !== 'complete'}
          compact
        />
      </Card>

      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">กำหนดวันทำ</h2>
        <div className="space-y-3">
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="edit-sat">เปิดรับตั้งแต่</Label>
            <Input id="edit-sat" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
          </div>
          <LateSubmissionScheduleFields
            idPrefix="edit-schedule"
            dueAt={dueAt}
            endAt={endAt}
            bands={lateBands}
            disabled={hasSubmissions}
            onDueAtChange={setDueAt}
            onEndAtChange={setEndAt}
            onBandsChange={setLateBands}
          />
        </div>
      </Card>

      <Card padding="md">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="edit-show-results">แสดงผลลัพธ์</FieldLabel>
          <Select
            value={showResults}
            onValueChange={value => {
              if (value && RESULT_VISIBILITY_OPTIONS.some(option => option.key === value)) {
                setShowResults(value as ShowResultsMode)
              }
            }}
          >
            <SelectTrigger id="edit-show-results" aria-label="เลือกเวลาแสดงผลลัพธ์" className="w-full sm:max-w-md">
              <SelectValue>
                {RESULT_VISIBILITY_OPTIONS.find(option => option.key === showResults)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
            {RESULT_VISIBILITY_OPTIONS.map(option => (
                  <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
            ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription className="text-xs leading-5">
            {RESULT_VISIBILITY_OPTIONS.find(option => option.key === showResults)?.description}
          </FieldDescription>
        </Field>
      </Card>

      {hasSubmissions && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/10 p-3 text-sm text-foreground">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>ค่าที่มีผลต่อชุดโจทย์และรูปแบบ attempt ถูกล็อกไว้แล้ว ส่วนกำหนดการที่ยังอนุญาต การแสดงผล และคะแนนเต็มที่แสดงผลยังบันทึกได้ตามปกติ</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="submit" variant={workTypeConfig(a.type).variant} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
          ยกเลิก
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={handlePickerOpenChange}>
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
                ยืนยัน
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingPickerDiscard}
        onOpenChange={setConfirmingPickerDiscard}
        title="ออกโดยไม่ยืนยันการเลือก?"
        description="คุณมีการเลือกหรือเอาโจทย์ออกที่ยังไม่ได้กด “ยืนยัน” หากออกตอนนี้ การเปลี่ยนแปลงครั้งนี้จะหายไป"
        confirmLabel="ออกโดยไม่บันทึก"
        cancelLabel="กลับไปเลือกต่อ"
        variant="destructive"
        onConfirm={discardPickerChanges}
      />
    </form>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { createAssignment } from '@/lib/actions/assignments'
import { createQuestionSet } from '@/lib/actions/question-sets'
import { assignmentCopyTitle, assignmentCreationTitle } from '@/lib/assignment-creation'
import {
  assignmentPresetDefaults, type AssignmentPresetBootstrap, type AssignmentPresetSettings,
} from '@/lib/assignment-setting-presets'
import {
  AssignmentSettingPresetsProvider, AssignmentSettingPresetsRecall,
  AssignmentSettingPresetsSave, type AssignmentPresetActions,
} from '@/components/assignments/assignment-setting-presets'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import { CompletionAttemptSettings } from '@/components/assignments/completion-attempt-settings'
import {
  CompletionRuleCard,
  completionRuleInputClassName,
} from '@/components/assignments/completion-rule-card'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Check, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Eye,
  X, Save, FileText,
} from 'lucide-react'
import {
  filterSectionsToQuestions, moveQuestionOrder, moveQuestionOrderToIndex, parseSections,
  type QuestionSetSection,
} from '@/lib/question-set-sections'
import type {
  AssignmentStatus,
  AssignmentType,
  Assignment,
  Classroom,
  CompletionRule,
  QuestionSet,
  RetryScope,
  ScoreStrategy,
  ShowResultsMode,
} from '@/lib/types'
import {
  STREAK_TARGET_MAX, STREAK_TARGET_MIN,
  STREAK_CAP_MAX, STREAK_CAP_MIN,
  decideCompletion, defaultQuestionCap, streakEligibleCount, streakExcludedCount, streakPoolAdvice,
} from '@/lib/streak-completion'
import type { BankQuestion } from '@/lib/question-bank'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { IconButton } from '@/components/ui/icon-button'
import { OrderNumberInput } from '@/components/assignments/order-number-input'
import { QuestionPreviewDialog } from '@/components/assignments/question-preview-dialog'
import { QuestionListPreviewDialog } from '@/components/assignments/question-list-preview-dialog'
import type { getQuestionPreviewDetails } from '@/lib/actions/question-previews'
import { toggleQuestionSetSelection } from '@/lib/question-set-selection'
import { QuestionSetImport } from '@/components/assignments/question-set-import'
import { ClassroomPicker } from '@/components/assignments/classroom-picker'
import { AssignmentReviewSummary } from '@/components/assignments/assignment-review-summary'
import {
  GroupTargetPicker, groupTargetsComplete, groupTargetsFor,
  type AssignmentGroupOption, type GroupTargets,
} from '@/components/assignments/group-target-picker'
import { SolutionReleaseSetting } from '@/components/assignments/solution-release-setting'
import { questionExcerpt } from '@/lib/question-display'
import { subQuestionUnit } from '@/lib/question-parts'
import {
  SebQuitPasswordFields,
  getSebQuitPasswordClientError,
} from '@/components/assignments/seb-quit-password-settings'
import { cn } from '@/lib/utils'
import { THAI_TIME_ZONE } from '@/lib/thai-time'

const QuestionPicker = dynamic(
  () => import('@/components/assignments/question-picker').then(mod => mod.QuestionPicker),
  { loading: () => <div className="h-96 animate-pulse rounded-2xl bg-muted" aria-label="กำลังโหลดคลังโจทย์" /> }
)

const STEPS = ['รายละเอียด โจทย์ และคะแนน', 'ตั้งค่า', 'กำหนดการสอบ']

// สรุปก่อนสร้าง used to read the two original values only, so a งาน set to
// แสดงคะแนนแต่ไม่แสดงเฉลย or ไม่แสดงผลลัพธ์ was summarised as
// "หลังพ้นกำหนดส่ง" — the wrong promise, on the last screen before creating.
const SHOW_RESULTS_SUMMARY: Record<ShowResultsMode, string> = {
  immediate: 'ทันทีหลังส่ง',
  score_only: 'คะแนน แต่ไม่แสดงคำตอบ',
  after_due: 'หลังพ้นกำหนดส่ง',
  never: 'ไม่แสดงผลลัพธ์',
}

export type AssignmentClassroomOption = Pick<Classroom, 'id' | 'name' | 'description'>
/** A question the picker can offer, carrying the point value it is worth by
 *  default (see `default_points` in lib/question-bank.ts). */
export type AssignmentQuestionOption = BankQuestion
export type AssignmentQuestionSetOption = Pick<QuestionSet, 'id' | 'title' | 'description' | 'question_ids' | 'sections'>

export type AssignmentCopyPreset = Pick<
  Assignment,
  | 'id'
  | 'title'
  | 'description'
  | 'question_ids'
  | 'question_points'
  | 'display_max_score'
  | 'sections'
  | 'show_sections'
  | 'start_at'
  | 'end_at'
  | 'duration_minutes'
  | 'type'
  | 'shuffle_questions'
  | 'shuffle_options'
  | 'shared_random_seed'
  | 'random_question_count'
  | 'show_results'
  | 'show_solutions'
  | 'max_attempts'
  | 'score_strategy'
  | 'retry_scope'
  | 'questions_per_page'
  | 'instant_check'
  | 'instant_check_answer_key'
  | 'completion_rule'
  | 'streak_target'
  | 'streak_question_cap'
  | 'streak_recycle_pool'
  | 'access_code'
  | 'passing_type'
  | 'passing_value'
  | 'require_work_image'
  | 'calculator_enabled'
  | 'scratchpad_enabled'
  | 'proctoring_enabled'
  | 'fullscreen_required'
  | 'block_clipboard'
  | 'exam_watermark_enabled'
  | 'secure_browser_mode'
  | 'android_exam_mode'
>

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: THAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

interface Props {
  classrooms: AssignmentClassroomOption[]
  /** กลุ่มย่อย of each classroom above, for "มอบหมายให้". */
  groupsByClassroom?: Record<string, AssignmentGroupOption[]>
  questions: AssignmentQuestionOption[]
  questionSets?: AssignmentQuestionSetOption[]
  preselectedClassroomId?: string
  preselectedSet?: AssignmentQuestionSetOption
  preselectedAssignmentType: AssignmentType
  copySource?: AssignmentCopyPreset
  initialGroupTargets?: GroupTargets
  presetBootstrap?: AssignmentPresetBootstrap
  presetActions?: AssignmentPresetActions
  /** Local QA can capture submissions without writing synthetic data. */
  actions?: {
    createQuestionSet: typeof createQuestionSet
    createAssignment: typeof createAssignment
    getQuestionPreviewDetails?: typeof getQuestionPreviewDetails
  }
}

export function CreateAssignmentForm({
  classrooms,
  groupsByClassroom = {},
  questions,
  questionSets = [],
  preselectedClassroomId,
  preselectedSet,
  preselectedAssignmentType,
  copySource,
  initialGroupTargets = {},
  presetBootstrap,
  presetActions,
  actions,
}: Props) {
  const router = useRouter()
  const assignmentType = preselectedAssignmentType
  const isCopy = copySource !== undefined
  // Resolve the saved default synchronously, before any draft state is created.
  // A copied assignment has priority; refreshes never reinitialize an edited draft.
  const initialSettings = !copySource && !presetBootstrap?.error
    ? presetBootstrap?.presets.find(preset => preset.id === presetBootstrap.defaultPresetId)?.settings
      ?? assignmentPresetDefaults(assignmentType)
    : assignmentPresetDefaults(assignmentType)
  const [step, setStep] = useState(0)
  const wizardRef = useRef<HTMLDivElement>(null)
  const previousStepRef = useRef(step)

  useEffect(() => {
    if (previousStepRef.current === step) return
    previousStepRef.current = step
    // The app shell scrolls its main panel; standalone pages scroll the window.
    wizardRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'instant' })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [step])
  const [isPending, startTransition] = useTransition()
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')

  // Step 1: รายละเอียด โจทย์ และคะแนน
  const [title, setTitle] = useState(
    copySource ? assignmentCopyTitle(copySource.title) : (preselectedSet?.title ?? ''),
  )
  const [description, setDescription] = useState(copySource?.description ?? preselectedSet?.description ?? '')
  const [classroomIds, setClassroomIds] = useState<string[]>(
    preselectedClassroomId ? [preselectedClassroomId] : (classrooms[0] ? [classrooms[0].id] : [])
  )
  // มอบหมายให้: absent/null per room = นักเรียนทุกคนในห้อง, the default.
  const [groupTargets, setGroupTargets] = useState<GroupTargets>(initialGroupTargets)
  // Off unless the teacher says otherwise: turning it on blocks ส่งคำตอบ until
  // every เติมคำตอบตัวเลข answer carries a photo, and a งาน that starts out
  // able to block students is not a safe default.
  const [requireWorkImage, setRequireWorkImage] = useState(copySource?.require_work_image ?? initialSettings.require_work_image)
  // When not starting from an existing set, offer to save the picked
  // questions back into the library as a new reusable set.
  const [saveAsSet, setSaveAsSet] = useState(false)
  const [questionSetTitle, setQuestionSetTitle] = useState('')

  // Step 1 (continued) — filter out any question_ids that no longer resolve to a real
  // question (e.g. deleted since the set was saved). Otherwise a dangling id
  // sails through into selectedIds, gets silently dropped later by
  // previewQuestions (step 2 can only render questions it can find), and the
  // teacher sees the count mysteriously shrink by however many are dangling.
  const [selectedIds, setSelectedIds] = useState<string[]>(
    (copySource?.question_ids ?? preselectedSet?.question_ids ?? []).filter(id => questions.some(q => q.id === id))
  )
  // แฟ้มย่อย carried over from the แฟ้มโจทย์ these questions came from. Trimmed
  // down to the questions actually assigned when the งาน is created.
  const [sections, setSections] = useState<QuestionSetSection[]>(
    parseSections(copySource?.sections ?? preselectedSet?.sections)
  )
  const [showSections, setShowSections] = useState(copySource?.show_sections ?? initialSettings.show_question_sections)
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')
  // How much of the คลัง above each student actually receives. Empty = all of
  // it, which is what every งาน did before this setting existed. It lives here
  // rather than in ตั้งค่า because "ให้เด็กทำกี่ข้อ" is the thought that comes
  // immediately after ticking the last โจทย์, not three steps later.
  const initialRandomQuestionCount = copySource
    ? copySource.random_question_count
    : initialSettings.random_question_count
  const [randomQuestionCount, setRandomQuestionCount] = useState(
    initialRandomQuestionCount != null ? String(initialRandomQuestionCount) : '',
  )

  // Step 1 (คะแนน) — a question starts at the point value its own structure
  // gives it (one per ข้อย่อย); teacher can edit individual questions and the
  // total recalculates automatically.
  const [questionPointDrafts, setQuestionPointDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(copySource?.question_points ?? {}).map(([id, points]) => [id, String(points)]),
    ),
  )
  // Which row's มุมมองนักเรียน is open, as an index into selectedIds so the
  // dialog's ข้อถัดไป walks the teacher's own order. null = closed.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [listPreview, setListPreview] = useState<{ ids: string[]; title: string } | null>(null)
  // Independent of the per-question points above — rescales what's
  // *reported* only (never the underlying structure), and can be changed
  // any time later from the edit page too, even after students finish.
  const [displayMaxScore, setDisplayMaxScore] = useState(
    (copySource ? copySource.display_max_score : initialSettings.display_max_score) != null
      ? String(copySource ? copySource.display_max_score : initialSettings.display_max_score) : '',
  )

  // Step 2 (ตั้งค่า)
  const [duration, setDuration] = useState(
    (copySource ? copySource.duration_minutes : initialSettings.duration_minutes) != null
      ? String(copySource ? copySource.duration_minutes : initialSettings.duration_minutes) : '',
  )
  const [shuffleQ, setShuffleQ] = useState(copySource?.shuffle_questions ?? initialSettings.shuffle_questions)
  const [shuffleA, setShuffleA] = useState(copySource?.shuffle_options ?? initialSettings.shuffle_options)
  // Off unless the teacher asks: every งาน before this existed gave each
  // student their own numbers, and that is still what a โจทย์สุ่มตัวเลข is for.
  const [sharedRandomValues, setSharedRandomValues] = useState(copySource ? copySource.shared_random_seed != null : initialSettings.shared_random_values)
  const [showResults, setShowResults] = useState<ShowResultsMode>(copySource?.show_results ?? initialSettings.show_results)
  // Off until the teacher ticks it: no งาน opened its เฉลยวิธีทำ to students
  // before this setting existed, and one that does is a choice, not a default.
  const [showSolutions, setShowSolutions] = useState(copySource?.show_solutions ?? initialSettings.show_solutions)
  const [maxAttempts, setMaxAttempts] = useState(
    copySource ? (copySource.max_attempts != null ? String(copySource.max_attempts) : '')
      : (initialSettings.max_attempts != null ? String(initialSettings.max_attempts) : ''),
  )
  const [scoreStrategy, setScoreStrategy] = useState<ScoreStrategy>(copySource?.score_strategy ?? initialSettings.score_strategy)
  // On by default: a แบบฝึกหัด a student can retake is nearly always meant as
  // a second chance at what they got wrong, not as the whole set again. A
  // teacher who wants the full set back only has to untick it — and ข้อสอบ,
  // which is one attempt, resets this to 'all' below where it means nothing.
  const [retryScope, setRetryScope] = useState<RetryScope>(copySource?.retry_scope ?? initialSettings.retry_scope)
  const [questionsPerPage, setQuestionsPerPage] = useState(String(copySource?.questions_per_page ?? initialSettings.questions_per_page))
  // On by default, and the reason a แบบฝึกหัด is not just a ข้อสอบ with more
  // attempts: the student finishes a ข้อ, presses ตรวจ, and finds out there and
  // then. A teacher who wants the whole set answered blind before any feedback
  // unticks it; the เฉลย itself is a separate decision below, because "บอกว่า
  // ผิด" and "บอกว่าคำตอบคืออะไร" are not the same amount of help.
  const [instantCheck, setInstantCheck] = useState(copySource?.instant_check ?? initialSettings.instant_check)
  const [instantCheckAnswerKey, setInstantCheckAnswerKey] = useState(copySource?.instant_check_answer_key ?? initialSettings.instant_check_answer_key)
  // Calculator is opt-in; scratchpad keeps its type-specific default.
  // Copies preserve the source's choices. Existing assignments are never backfilled.
  const [calculatorEnabled, setCalculatorEnabled] = useState(copySource?.calculator_enabled ?? initialSettings.calculator_enabled)
  const [scratchpadEnabled, setScratchpadEnabled] = useState(copySource?.scratchpad_enabled ?? initialSettings.scratchpad_enabled)
  const [accessCode, setAccessCode] = useState(copySource?.access_code ?? '')
  const [proctoringEnabled, setProctoringEnabled] = useState(copySource?.proctoring_enabled ?? initialSettings.proctoring_enabled)
  const [fullscreenRequired, setFullscreenRequired] = useState(copySource?.fullscreen_required ?? initialSettings.fullscreen_required)
  const [blockClipboard, setBlockClipboard] = useState(copySource?.block_clipboard ?? initialSettings.block_clipboard)
  const [examWatermarkEnabled, setExamWatermarkEnabled] = useState(copySource?.exam_watermark_enabled ?? initialSettings.exam_watermark_enabled)
  const [secureBrowserMode, setSecureBrowserMode] = useState<'browser' | 'seb_required'>(copySource?.secure_browser_mode ?? initialSettings.secure_browser_mode)
  const [androidExamMode, setAndroidExamMode] = useState<'blocked' | 'monitored'>(copySource?.android_exam_mode ?? initialSettings.android_exam_mode)
  const [sebQuitPassword, setSebQuitPassword] = useState('')
  const [sebQuitPasswordConfirmation, setSebQuitPasswordConfirmation] = useState('')
  // เงื่อนไขจบงาน. The three choices a teacher sees are a view over two stored
  // values — 'fixed' + no threshold, 'fixed' + a threshold, or 'streak' — so
  // that turning a threshold on and choosing to end on a run are visibly the
  // same decision rather than two switches that can disagree.
  const requestedInitialCompletionRule = copySource?.completion_rule ?? initialSettings.completion_rule
  const [completionRule, setCompletionRule] = useState<CompletionRule>(
    requestedInitialCompletionRule === 'streak' && initialRandomQuestionCount == null
      ? 'fixed'
      : requestedInitialCompletionRule,
  )
  const [streakTarget, setStreakTarget] = useState(
    String(copySource?.streak_target ?? initialSettings.streak_target),
  )
  const [streakCapEnabled, setStreakCapEnabled] = useState(
    copySource ? copySource.streak_question_cap != null : initialSettings.streak_question_cap != null,
  )
  const [streakCap, setStreakCap] = useState(
    String(copySource
      ? copySource.streak_question_cap ?? defaultQuestionCap(copySource.streak_target ?? initialSettings.streak_target)
      : initialSettings.streak_question_cap ?? defaultQuestionCap(initialSettings.streak_target)),
  )
  const [streakRecycle, setStreakRecycle] = useState(copySource?.streak_recycle_pool ?? initialSettings.streak_recycle_pool)
  const [passingEnabled, setPassingEnabled] = useState(
    copySource ? copySource.passing_type != null && copySource.passing_value != null
      : initialSettings.passing_type != null && initialSettings.passing_value != null,
  )
  const [passingType, setPassingType] = useState<'score' | 'percent'>(copySource?.passing_type ?? initialSettings.passing_type ?? 'percent')
  const [passingValue, setPassingValue] = useState(
    (copySource ? copySource.passing_value : initialSettings.passing_value) != null
      ? String(copySource ? copySource.passing_value : initialSettings.passing_value) : '',
  )

  // Capture requested settings, not the question-dependent effective payload.
  // Invalid numeric drafts stay invalid so the preset schema can explain them.
  const optionalNumber = (value: string) => value.trim() === '' ? null : Number(value)
  const presetSettings: AssignmentPresetSettings = {
    duration_minutes: optionalNumber(duration), shuffle_questions: shuffleQ,
    shuffle_options: shuffleA, shared_random_values: sharedRandomValues,
    show_results: showResults, show_solutions: showSolutions,
    max_attempts: optionalNumber(maxAttempts), score_strategy: scoreStrategy,
    retry_scope: retryScope, questions_per_page: Number(questionsPerPage),
    instant_check: instantCheck, instant_check_answer_key: instantCheckAnswerKey,
    calculator_enabled: calculatorEnabled, scratchpad_enabled: scratchpadEnabled,
    proctoring_enabled: proctoringEnabled, fullscreen_required: fullscreenRequired,
    block_clipboard: blockClipboard, exam_watermark_enabled: examWatermarkEnabled,
    secure_browser_mode: secureBrowserMode, android_exam_mode: androidExamMode,
    completion_rule: completionRule, streak_target: Number(streakTarget),
    streak_question_cap: streakCapEnabled ? optionalNumber(streakCap) : null,
    streak_recycle_pool: streakRecycle,
    passing_type: passingEnabled ? passingType : null,
    passing_value: passingEnabled ? optionalNumber(passingValue) : null,
    random_question_count: optionalNumber(randomQuestionCount),
    display_max_score: optionalNumber(displayMaxScore),
    show_question_sections: showSections, require_work_image: requireWorkImage,
  }

  function applyPreset(settings: AssignmentPresetSettings) {
    const numberDraft = (value: number | null) => value === null ? '' : String(value)
    const presetCompletionRule = settings.completion_rule === 'streak' && settings.random_question_count === null
      ? 'fixed'
      : settings.completion_rule
    setDuration(numberDraft(settings.duration_minutes))
    setShuffleQ(settings.shuffle_questions)
    setShuffleA(settings.shuffle_options)
    setSharedRandomValues(settings.shared_random_values)
    setShowResults(settings.show_results)
    setShowSolutions(settings.show_solutions)
    setMaxAttempts(numberDraft(settings.max_attempts))
    setScoreStrategy(settings.score_strategy)
    setRetryScope(settings.retry_scope)
    setQuestionsPerPage(String(settings.questions_per_page))
    setInstantCheck(settings.instant_check)
    setInstantCheckAnswerKey(settings.instant_check_answer_key)
    setCalculatorEnabled(settings.calculator_enabled)
    setScratchpadEnabled(settings.scratchpad_enabled)
    setProctoringEnabled(settings.proctoring_enabled)
    setFullscreenRequired(settings.fullscreen_required)
    setBlockClipboard(settings.block_clipboard)
    setExamWatermarkEnabled(settings.exam_watermark_enabled)
    setSecureBrowserMode(settings.secure_browser_mode)
    setAndroidExamMode(settings.android_exam_mode)
    setCompletionRule(presetCompletionRule)
    setStreakTarget(String(settings.streak_target))
    setStreakCapEnabled(settings.streak_question_cap !== null)
    setStreakCap(String(settings.streak_question_cap ?? defaultQuestionCap(settings.streak_target)))
    setStreakRecycle(settings.streak_recycle_pool)
    setPassingEnabled(presetCompletionRule !== 'streak' && settings.passing_type !== null && settings.passing_value !== null)
    setPassingType(settings.passing_type ?? 'percent')
    setPassingValue(numberDraft(settings.passing_value))
    setRandomQuestionCount(numberDraft(settings.random_question_count))
    setDisplayMaxScore(numberDraft(settings.display_max_score))
    setShowSections(settings.show_question_sections)
    setRequireWorkImage(settings.require_work_image)
    // Passwords are never part of a preset. A previously typed SEB exit password
    // remains this draft's value; a new job always starts with fresh blank fields.
  }

  // Step 3 (กำหนดการสอบ)
  const [startAt, setStartAt] = useState(toLocalInputValue(copySource?.start_at ?? null))
  const [endAt, setEndAt] = useState(toLocalInputValue(copySource?.end_at ?? null))

  // Every โจทย์ this teacher can actually assign. Kept as a set because both
  // the แฟ้ม shortcut and importSet ask "is this id real?" once per ข้อ in a
  // แฟ้ม, against a คลัง that can hold thousands.
  const bankIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])

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

  // Same effect as unticking the ข้อ back in เลือกโจทย์, so a duplicate spotted
  // here doesn't cost a trip backwards. `sections` is left alone for the same
  // reason as in moveQuestion: it keeps this question's แฟ้มย่อย, so re-ticking
  // it later puts it back under the same one. The last remaining ข้อ can't go —
  // the server refuses a งาน with no โจทย์, and one built from a แฟ้ม would
  // quietly get the whole แฟ้ม back instead.
  function removeQuestion(id: string) {
    setSelectedIds(prev => prev.filter(i => i !== id))
  }

  function importSet(set: AssignmentQuestionSetOption) {
    const validIds = [...new Set(set.question_ids)].filter(id => bankIds.has(id))
    const missingCount = new Set(set.question_ids).size - validIds.length
    const removing = validIds.length > 0 && validIds.every(id => selectedIds.includes(id))
    setSelectedIds(prev => toggleQuestionSetSelection(prev, set.question_ids, bankIds))
    if (removing) {
      // As with unticking one question, retain section/point drafts for re-selection.
      toast.success(`เอา ${validIds.length} ข้อจากแฟ้ม "${set.title}" ออกจากรายการที่เลือกแล้ว`)
      return
    }
    // What the click actually changed. Re-importing a แฟ้ม the teacher already
    // pulled in used to claim it added all 22 ข้อ again.
    const addedCount = validIds.filter(id => !selectedIds.includes(id)).length
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
      toast.success(`เพิ่ม ${addedCount} ข้อจากแฟ้ม "${set.title}" (ข้าม ${missingCount} ข้อที่ถูกลบไปแล้ว)`)
    } else {
      toast.success(`เพิ่ม ${addedCount} ข้อจากแฟ้ม "${set.title}"`)
    }
  }

  function toggleClassroom(id: string) {
    setClassroomIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  // "มอบหมายให้" in the summary: the whole room unless some room is limited
  // to กลุ่มย่อย, then which groups (named when only one room is ticked).
  const limitedRooms = classroomIds.filter(id => (groupTargets[id] ?? null) !== null)
  const audienceSummary = limitedRooms.length === 0
    ? 'นักเรียนทุกคนในห้อง'
    : classroomIds.length === 1
      ? `เฉพาะ ${(groupsByClassroom[classroomIds[0]] ?? [])
          .filter(g => groupTargets[classroomIds[0]]?.includes(g.id))
          .map(g => g.name)
          .join(', ')}`
      : `เฉพาะบางกลุ่มใน ${limitedRooms.length} ห้อง`
  // What survives of the แฟ้มย่อย after the teacher's own picking.
  const assignedSections = filterSectionsToQuestions(sections, selectedIds)

  // How the ข้อต่อหน้า setting will actually break up this งาน. Counted
  // against the สุ่ม draw when one is set, since that is how many questions a
  // student really receives.
  const perPageValue = Math.min(50, Math.max(1, Number(questionsPerPage) || 1))
  const questionsPerAttempt = Number(randomQuestionCount) > 0
    ? Math.min(Number(randomQuestionCount), selectedIds.length)
    : selectedIds.length
  const perPageHint = questionsPerAttempt > 0
    ? `${questionsPerAttempt} ข้อ → ${Math.ceil(questionsPerAttempt / perPageValue)} หน้า · 1 = ทีละข้อเหมือนเดิม`
    : '1 = แสดงทีละข้อเหมือนเดิม'

  // ── สุ่มชุดโจทย์รายคน ────────────────────────────────────────────────────
  // Below two โจทย์ there is nothing to draw from.
  const canDrawRandomSubset = selectedIds.length >= 2
  const randomDrawOn = Number(randomQuestionCount) > 0
  // Highest draw that is still a draw: taking all of them is the other option.
  const maxRandomDraw = Math.max(1, selectedIds.length - 1)

  // A preset may request 5 questions before any pool has been chosen. Preserve
  // that intention instead of the old effect silently clamping it to 1.
  const randomDrawInvalid = randomQuestionCount.trim() !== '' && (
    !Number.isInteger(Number(randomQuestionCount)) || Number(randomQuestionCount) < 1
    || Number(randomQuestionCount) >= selectedIds.length
  )
  const streakAvailable = randomDrawOn && !randomDrawInvalid

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

  // Two students drawing different โจทย์ out of a คลัง whose ข้อ are worth
  // different amounts end up graded out of different totals. คะแนนเต็มที่
  // แสดงผล is the existing fix, so the warning offers it rather than only
  // naming the problem.
  // ── เงื่อนไขจบงาน ────────────────────────────────────────────────────────
  // The same resolver createAssignment uses, asked with the same inputs, so a
  // streak the form shows as ready is a streak the server will accept — and a
  // refusal is a sentence on screen instead of an error after ยืนยัน.
  const poolQuestionTypes = previewQuestions.map(q => q.question_type)
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
  const streakAdvice = streakBlocked
    ? null
    : streakPoolAdvice(poolQuestionTypes, streakDecision.target as number)
  const streakOn = completionRule === 'streak'

  // What the three cards read as. Kept derived so the pair can never end up in
  // a state no card represents (a streak งาน with a percentage threshold is
  // refused by the database, not just by the form).
  const completionChoice: 'complete' | 'threshold' | 'streak' =
    streakOn ? 'streak' : (passingEnabled ? 'threshold' : 'complete')
  const canRepeat = completionChoice !== 'complete' || maxAttempts !== '1'

  function chooseCompletion(choice: 'complete' | 'threshold' | 'streak') {
    if (choice === 'streak' && !streakAvailable) return
    if (choice === 'streak') {
      setCompletionRule('streak')
      setPassingEnabled(false)
      return
    }
    setCompletionRule('fixed')
    setPassingEnabled(choice === 'threshold')
  }

  function chooseAllQuestions() {
    setRandomQuestionCount('')
    if (completionRule === 'streak') {
      setCompletionRule('fixed')
      setPassingEnabled(false)
    }
  }

  const pointValues = previewQuestions.map(q => Number.parseFloat(pointsDraft(q.id)) || 0)
  const drawnPointsVary = randomDrawOn && new Set(pointValues).size > 1
  const displayMaxSet = displayMaxScore.trim() !== '' && Number(displayMaxScore) > 0

  function canNext() {
    if (step === 0) {
      return title.trim().length > 0 && classroomIds.length > 0 && classrooms.length > 0
        && groupTargetsComplete(groupTargets, preselectedClassroomId ? [preselectedClassroomId] : classroomIds)
        && selectedIds.length > 0 && (!saveAsSet || questionSetTitle.trim().length > 0)
        && !(streakOn && (!streakAvailable || streakBlocked))
        && !randomDrawInvalid
    }
    if (step === 1) {
      if (assignmentType === 'exam' && secureBrowserMode === 'seb_required') {
        return getSebQuitPasswordClientError(sebQuitPassword, sebQuitPasswordConfirmation) === null
      }
    }
    return true
  }

  // Whether asking about รูปวิธีทำ makes sense at all: only เติมคำตอบตัวเลข
  // questions have working to photograph, so a งาน made entirely of ปรนัย or
  // อัตนัย never sees the switch — an option that cannot change anything is
  // just one more thing to read past.
  const hasWorkImageQuestions = selectedIds.some(
    id => questions.find(q => q.id === id)?.question_type === 'written'
  )
  // Same idea for "ตัวเลขชุดเดียวกัน": only a ข้อ that actually draws numbers
  // can differ between students, so a งาน without one never sees the switch.
  const randomValueQuestionCount = selectedIds.filter(
    id => questions.find(q => q.id === id)?.has_random_values
  ).length
  const sharedRandomOn = randomValueQuestionCount > 0 && sharedRandomValues

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
    if (randomDrawInvalid) {
      toast.error('จำนวนโจทย์ที่สุ่มต้องน้อยกว่าคลัง กรุณาเพิ่มโจทย์หรือปรับจำนวนก่อนสร้างงาน')
      setStep(0)
      return
    }
    if (completionChoice === 'threshold' && (passingValue.trim() === '' || !Number.isFinite(Number(passingValue)) || Number(passingValue) < 0 || (passingType === 'percent' && Number(passingValue) > 100))) {
      toast.error('กรุณากรอกเกณฑ์ผ่านให้ถูกต้อง')
      setStep(0)
      return
    }
    if (!preselectedSet && saveAsSet && !questionSetTitle.trim()) {
      toast.error('กรุณากรอกชื่อแฟ้มโจทย์')
      setStep(0)
      return
    }
    if (!groupTargetsComplete(groupTargets, classroomIds)) {
      toast.error('กรุณาเลือกกลุ่มนักเรียนที่ต้องการมอบหมายให้ครบทุกห้อง')
      setStep(2)
      return
    }
    startTransition(async () => {
      let setId = preselectedSet?.id

      if (!preselectedSet && saveAsSet) {
        const setRes = await (actions?.createQuestionSet ?? createQuestionSet)({
          title: questionSetTitle.trim(),
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
      const selectedRandomCount = canDrawRandomSubset
        && randomQuestionCount.trim() !== ''
        && Number.isInteger(parsedRandomCount)
        && parsedRandomCount > 0
        && parsedRandomCount < selectedIds.length
          ? parsedRandomCount
          : null

      const res = await (actions?.createAssignment ?? createAssignment)({
        copy_source_assignment_id: copySource?.id,
        classroom_ids: classroomIds,
        group_targets: groupTargetsFor(groupTargets, classroomIds),
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
        mode: 'online' as const,
        type: assignmentType,
        shuffle_questions: shuffleQ,
        shuffle_options: shuffleA,
        // Stored as off when nothing in the งาน draws numbers, whatever the
        // switch was left on before the last such ข้อ was removed.
        shared_random_values: sharedRandomOn,
        random_question_count: selectedRandomCount,
        show_results: showResults,
        show_solutions: showSolutions,
        max_attempts: completionChoice === 'complete' && maxAttempts ? Number(maxAttempts) : null,
        score_strategy: completionChoice === 'complete' ? scoreStrategy : 'best',
        // The wrong-only switch is hidden while a draw is on, so store the
        // behavior the teacher can actually see rather than whatever the
        // switch was left on before they turned the draw on.
        retry_scope: selectedRandomCount ? 'all' : retryScope,
        questions_per_page: Number(questionsPerPage) || 1,
        instant_check: instantCheck,
        instant_check_answer_key: instantCheckAnswerKey,
        access_code: accessCode.trim() || null,
        completion_rule: completionRule,
        streak_target: completionRule === 'streak' ? Number(streakTarget) : null,
        streak_question_cap: completionRule === 'streak' ? streakCapValue : null,
        streak_recycle_pool: streakRecycle,
        // A streak งาน has no fixed total to take a percentage of, and the
        // database refuses the pair outright — the card hides these controls
        // for that reason, so nothing is lost by clearing them here too.
        passing_type: streakOn ? null : (passingEnabled && passingValue ? passingType : null),
        passing_value: streakOn ? null : (passingEnabled && passingValue ? Number(passingValue) : null),
        // A งาน with nothing to photograph is stored as not requiring it,
        // whatever the switch was left on before the last โจทย์ was removed.
        require_work_image: hasWorkImageQuestions && requireWorkImage,
        calculator_enabled: calculatorEnabled,
        scratchpad_enabled: scratchpadEnabled,
        proctoring_enabled: proctoringEnabled,
        fullscreen_required: fullscreenRequired,
        block_clipboard: blockClipboard,
        exam_watermark_enabled: examWatermarkEnabled,
        secure_browser_mode: secureBrowserMode,
        android_exam_mode: androidExamMode,
        ...(secureBrowserMode === 'seb_required' ? {
          seb_quit_password: {
            password: sebQuitPassword,
            confirmation: sebQuitPasswordConfirmation,
          },
        } : {}),
        status,
      })
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <AssignmentSettingPresetsProvider
      type={assignmentType}
      bootstrap={presetBootstrap}
      actions={presetActions}
      settings={presetSettings}
      onApply={applyPreset}
      isCopy={isCopy}
      disabled={isPending}
    >
    <div
      ref={wizardRef}
      data-assignment-wizard
      className="space-y-4 [&_[data-assignment-description]]:hidden [&_[data-slot=field-description]]:hidden"
    >
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {isCopy ? 'ทำสำเนา' : assignmentCreationTitle(assignmentType)}
        </h1>
        <p data-assignment-description className="mt-1 text-sm text-muted-foreground">
          {isCopy
            ? 'ตรวจสอบข้อมูล การตั้งค่า และโจทย์จากงานเดิมก่อนสร้างสำเนา'
            : 'รวบรวมโจทย์ทำเป็นข้อสอบหรือแบบฝึกหัด แล้วมอบหมายให้นักเรียน'}
        </p>
      </div>

      {step === 0 && <AssignmentSettingPresetsRecall />}

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
              <p className={`text-xs mt-1 max-w-32 text-center sm:max-w-none sm:whitespace-nowrap ${i === step ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
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
        <div className="space-y-3">
          <Card padding="md" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">ข้อมูลพื้นฐาน</h2>

            {copySource && (
              <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2.5 text-sm text-primary">
                เติมข้อมูลและโจทย์จาก &ldquo;{copySource.title}&rdquo; ให้แล้ว — แก้ไขได้ก่อนทำสำเนา
              </div>
            )}

            {preselectedSet && (
              <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary rounded-xl px-3 py-2.5">
                ใช้แฟ้มโจทย์ &ldquo;{preselectedSet.title}&rdquo; ({selectedIds.length} ข้อ) — ปรับโจทย์ที่เลือกได้ด้านล่าง
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="title">ชื่องานที่มอบหมาย <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="เช่น แบบฝึกหัดบทที่ 3 หรือ สอบกลางภาค"
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

            {!preselectedClassroomId && (
              <div className="space-y-1.5">
                <Label>ห้องเรียน <span className="text-destructive">*</span> {classroomIds.length > 1 && <span className="text-muted-foreground font-normal">({classroomIds.length} ห้อง)</span>}</Label>
                {classrooms.length === 0 ? (
                  <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm text-foreground">
                    ยังไม่มีห้องเรียน กรุณา{' '}
                    <a href="/classrooms" className="underline font-medium">สร้างห้องเรียน</a> ก่อน
                  </div>
                ) : (
                  <ClassroomPicker
                    classrooms={classrooms}
                    selectedIds={classroomIds}
                    onToggle={toggleClassroom}
                  />
                )}
              </div>
            )}

            {classroomIds.length > 0 && (
              <div className="space-y-1.5">
                <Label>มอบหมายให้</Label>
                <GroupTargetPicker
                  classrooms={(preselectedClassroomId ? [preselectedClassroomId] : classroomIds).flatMap(id => {
                    const c = classrooms.find(room => room.id === id)
                    return c ? [{ id: c.id, name: c.name }] : []
                  })}
                  groupsByClassroom={groupsByClassroom}
                  value={groupTargets}
                  onChange={setGroupTargets}
                />
              </div>
            )}

          </Card>

        </div>
      )}

      {/* ── Step 1 continued: โจทย์ คะแนน และเวลา ─────────────────────── */}
      {step === 0 && (
        <div className="space-y-3">
          <Card padding="md" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">โจทย์ คะแนน และเวลา</h2>
              <span className="shrink-0 text-sm font-semibold text-primary">
                {previewQuestions.length} ข้อ · รวม {pointsSum} คะแนน
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">เลือกโจทย์</h3>
              {selectedIds.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setListPreview({ ids: previewIds, title: 'ตัวอย่างโจทย์ที่เลือก' })}>
                  <Eye data-icon="inline-start" />
                  ดูตัวอย่างโจทย์ที่เลือก
                </Button>
              )}
            </div>

            <QuestionSetImport
              sets={questionSets}
              bankIds={bankIds}
              selectedIds={selectedIds}
              onToggle={importSet}
              onPreview={set => setListPreview({ ids: set.question_ids.filter(id => bankIds.has(id)), title: `โจทย์ในแฟ้ม ${set.title}` })}
            />

            <Collapsible>
              <CollapsibleTrigger
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'group h-auto w-full justify-start gap-2 rounded-xl px-3 py-2.5 text-left',
                )}
              >
                <span className="text-foreground">เลือกโจทย์รายข้อ</span>
                <span className="text-xs font-normal text-muted-foreground">{questions.length} ข้อในคลัง</span>
                <ChevronDown className="ml-auto text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
                <div className="pt-4">
                  <QuestionPicker
                    questions={questions}
                    selectedIds={selectedIds}
                    onToggle={toggleQ}
                    search={search}
                    onSearchChange={setSearch}
                    diffFilter={diffFilter}
                    onDiffFilterChange={setDiffFilter}
                    showHeader={false}
                    showSelectedFooter={false}
                    surface="plain"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
            <Separator />
            <h3 className="text-sm font-semibold text-foreground">คะแนนแต่ละข้อ</h3>
            <p data-assignment-description className="text-xs text-muted-foreground">
              ค่าเริ่มต้นคิดตามจำนวนข้อย่อยในโจทย์ — ข้อย่อย 1 ข้อ = 1 คะแนน
              แก้ไขคะแนนข้อไหนก็ได้ ระบบจะรวมคะแนนทั้งหมดให้อัตโนมัติ
              สลับลำดับข้อได้ที่นี่ — ย้ายทีละขั้นด้วยลูกศร หรือพิมพ์เลขข้อที่ต้องการลงในช่องซ้ายมือแล้วกด Enter
              กดรูปตาเพื่อดูตัวอย่างข้อนั้นแบบที่นักเรียนเห็น
              และถ้าเจอข้อซ้ำหรือข้อที่ไม่เอาแล้ว กดกากบาทท้ายแถวเอาออกได้เลย ไม่ต้องเลื่อนกลับไปเลือกโจทย์
            </p>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {previewQuestions.map((q, i) => (
                <div key={q.id} className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-border sm:flex-nowrap">
                  <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
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
                    aria-label={`คะแนนข้อ ${i + 1}`}
                    onChange={e => setQuestionPointDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                    className="w-16 text-center shrink-0 sm:w-20"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">คะแนน</span>
                  <IconButton
                    label="เอาข้อนี้ออก"
                    size="2xs"
                    className="shrink-0 hover:text-destructive"
                    disabled={previewQuestions.length <= 1}
                    onClick={() => removeQuestion(q.id)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="display-max-score">คะแนนเต็มที่แสดงผล</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="display-max-score"
                    type="number"
                    min={0}
                    step="any"
                    value={displayMaxScore}
                    aria-label="คะแนนเต็มที่แสดงผล"
                    onChange={e => setDisplayMaxScore(e.target.value)}
                    placeholder={`ไม่ปรับ (เท่ากับ ${pointsSum})`}
                    className="max-w-[160px]"
                  />
                  <span className="text-sm text-muted-foreground">คะแนน</span>
                </div>
              </div>

              {streakOn && (
                <p data-assignment-description className="text-xs text-muted-foreground rounded-lg bg-muted px-3 py-2">
                  เงื่อนไขเพิ่มเติมตั้งไว้เป็น “ทำถูกติดต่อกัน {streakTarget} ข้อ” — หน้าทำโจทย์จึงแสดงทีละ 1 ข้อ
                  และเปิดการตรวจทีละข้อให้เสมอ ปรับสองอย่างนี้ที่นี่ไม่ได้
                </p>
              )}

              {!streakOn && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="per-page">จำนวนข้อต่อหนึ่งหน้า</Label>
                  <Input
                    id="per-page"
                    type="number"
                    min={1}
                    max={50}
                    value={questionsPerPage}
                    onChange={e => setQuestionsPerPage(e.target.value)}
                    className="max-w-[200px]"
                  />
                  <p data-assignment-description className="text-xs text-muted-foreground">{perPageHint}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dur">เวลาทำ (นาที)</Label>
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
            </div>

            {!preselectedSet && (
              <>
                <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                  <p className="min-w-0 text-sm font-medium text-foreground">บันทึกโจทย์ที่เลือกไว้ในแฟ้มเพื่อใช้ซ้ำ</p>
                  <input
                    type="checkbox"
                    checked={saveAsSet}
                    onChange={event => setSaveAsSet(event.target.checked)}
                    className="size-4 shrink-0 accent-primary"
                  />
                </label>
                {saveAsSet && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="question-set-title">ชื่อแฟ้มโจทย์ <span className="text-destructive">*</span></Label>
                    <Input
                      id="question-set-title"
                      value={questionSetTitle}
                      onChange={event => setQuestionSetTitle(event.target.value)}
                      placeholder="เช่น แฟ้มโจทย์เรื่องแรงและการเคลื่อนที่"
                      required
                    />
                  </div>
                )}
              </>
            )}
          </Card>

          {(canDrawRandomSubset || randomQuestionCount.trim() !== '') && (
            <Card padding="md" className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">ชุดโจทย์ที่นักเรียนได้รับ</h2>
                <p data-assignment-description className="text-xs text-muted-foreground">
                  คลังของงานนี้ {selectedIds.length} ข้อ — เลือกว่าจะจ่ายให้นักเรียนทั้งหมด หรือสุ่มมาบางข้อ
                </p>
              </div>

              {randomDrawInvalid && <p role="alert" className="text-sm text-destructive">
                ชุดการตั้งค่านี้ขอสุ่ม {randomQuestionCount} ข้อ แต่คลังมี {selectedIds.length} ข้อ
                — เพิ่มโจทย์ให้มากกว่าจำนวนที่สุ่ม ปรับจำนวน หรือเลือกให้ทำทุกข้อก่อนสร้างงาน ค่าที่บันทึกไว้ยังไม่เปลี่ยน
              </p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={chooseAllQuestions}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    !randomDrawOn ? 'border-border bg-primary/10 shadow-sm' : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <p className="font-medium text-sm text-foreground">ให้ทำทุกข้อ</p>
                  <p data-assignment-description className={cn('mt-0.5 text-xs', !randomDrawOn ? 'text-foreground' : 'text-muted-foreground')}>
                    ทุกคนได้โจทย์ชุดเดียวกัน
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!randomDrawOn) setRandomQuestionCount(String(Math.min(5, maxRandomDraw)))
                  }}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    randomDrawOn ? 'border-border bg-primary/10 shadow-sm' : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <p className="font-medium text-sm text-foreground">สุ่มจากโจทย์ที่เลือกข้างต้น</p>
                  <p data-assignment-description className={cn('mt-0.5 text-xs', randomDrawOn ? 'text-foreground' : 'text-muted-foreground')}>
                    แต่ละคน แต่ละรอบ ได้คนละชุด
                  </p>
                </button>
              </div>

              {randomDrawOn && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="random-question-count" className="text-sm text-muted-foreground">
                      ให้นักเรียนทำ
                    </Label>
                    <Input
                      id="random-question-count"
                      type="number"
                      min={1}
                      max={maxRandomDraw}
                      value={randomQuestionCount}
                      onChange={event => {
                        const nextValue = event.target.value
                        setRandomQuestionCount(nextValue)
                        if (nextValue.trim() === '' && completionRule === 'streak') {
                          setCompletionRule('fixed')
                          setPassingEnabled(false)
                        }
                      }}
                      className="max-w-[110px]"
                    />
                    <span className="text-sm text-muted-foreground">
                      ข้อ จากคลัง {selectedIds.length} ข้อ
                    </span>
                  </div>
                  <p data-assignment-description className="text-xs text-muted-foreground">
                    ชุดที่สุ่มได้จะถูกตรึงไว้ตลอดรอบนั้น — ปิดหน้าจอแล้วกลับมาทำต่อได้ชุดเดิม ส่วนรอบใหม่สุ่มชุดใหม่
                  </p>
                  {drawnPointsVary && !displayMaxSet && (
                    <div className="flex items-start justify-between gap-3 rounded-lg bg-warning/10 px-3 py-2">
                      <p className="text-xs text-foreground">
                        คะแนนแต่ละข้อในคลังไม่เท่ากัน คนที่จับได้ข้อคะแนนสูงจะได้เปรียบ —
                        ตั้ง “คะแนนเต็มที่แสดงผล” ให้ทุกคนเทียบกันได้
                      </p>
                      <button
                        type="button"
                        onClick={() => setDisplayMaxScore(String(questionsPerAttempt))}
                        className="text-xs font-medium text-foreground underline shrink-0"
                      >
                        ตั้งเป็น {questionsPerAttempt}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card radius="md" padding="sm" className="space-y-2.5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">เงื่อนไขเพิ่มเติม</h2>
              <p data-assignment-description className="text-xs text-muted-foreground">
                นักเรียนทำถึงตรงไหนถือว่าเสร็จ และครูวัดว่าผ่านจากอะไร
              </p>
            </div>

            <div data-completion-rules role="group" aria-label="เงื่อนไขเพิ่มเติม" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CompletionRuleCard
                selected={completionChoice === 'complete'}
                label="อนุญาตให้ทำ"
                onSelect={() => chooseCompletion('complete')}
              >
                <div className="flex flex-wrap items-center gap-1 text-sm font-medium text-foreground">
                  <span>อนุญาตให้ทำ</span>
                  <Input
                    id="attempts"
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
                    aria-label="จำนวนครั้งที่อนุญาตให้ทำ"
                    className={completionRuleInputClassName}
                  />
                  <span>ครั้ง</span>
                </div>
              </CompletionRuleCard>

              <CompletionRuleCard
                selected={completionChoice === 'threshold'}
                label="ผ่านเกณฑ์"
                onSelect={() => chooseCompletion('threshold')}
              >
                <div className="flex flex-wrap items-center gap-1 text-sm font-medium text-foreground">
                  <span>ผ่านเกณฑ์</span>
                  <Input
                    type="number"
                    min={0}
                    max={passingType === 'percent' ? 100 : undefined}
                    value={passingValue}
                    onFocus={() => chooseCompletion('threshold')}
                    onChange={event => setPassingValue(event.target.value)}
                    placeholder={passingType === 'percent' ? '70' : '7'}
                    aria-label="ค่าเกณฑ์ผ่าน"
                    className={completionRuleInputClassName}
                  />
                  <span>{passingType === 'percent' ? '%' : 'คะแนน'}</span>
                </div>
              </CompletionRuleCard>

              <CompletionRuleCard
                selected={completionChoice === 'streak'}
                disabled={!streakAvailable}
                label="ทำถูกติดต่อกัน"
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
                    disabled={!streakAvailable}
                    aria-label="จำนวนข้อที่ต้องทำถูกติดต่อกัน"
                    className={completionRuleInputClassName}
                  />
                  <span>ข้อ</span>
                </div>
              </CompletionRuleCard>
            </div>

            {!streakAvailable && (
              <p className="text-xs text-muted-foreground">
                “ทำถูกติดต่อกัน” ใช้ได้เมื่อเลือกสุ่มโจทย์
              </p>
            )}

            {completionChoice === 'complete' && (
              <CompletionAttemptSettings id="attempts" maxAttempts={maxAttempts}
                scoreStrategy={scoreStrategy} onScoreStrategyChange={setScoreStrategy} />
            )}

            {completionChoice !== 'complete' && (
              <p data-assignment-description className="text-xs text-muted-foreground">ทำรอบใหม่ได้จนกว่าจะผ่าน เมื่อผ่านแล้วจะเริ่มรอบใหม่ไม่ได้ · เก็บคะแนนจากรอบที่ดีที่สุด</p>
            )}

            {completionChoice === 'threshold' && (
              <div className="flex items-center gap-2 flex-wrap" aria-label="หน่วยเกณฑ์ผ่าน">
                <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                  {(['percent', 'score'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPassingType(t)}
                      className={`px-3 py-2 text-xs font-medium transition-all ${
                        passingType === t ? 'bg-primary/10 text-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {t === 'percent' ? '%' : 'คะแนน'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {completionChoice === 'streak' && (
              <div className="space-y-3 p-4 rounded-xl border border-border">
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
                    <div>
                      <p className="text-sm font-medium text-foreground">หยุดให้เองเมื่อทำครบจำนวนที่กำหนด</p>
                      <p data-assignment-description className="text-xs text-muted-foreground">
                        ถึงเพดานแล้วจบเป็น “ยังไม่ผ่าน” — กันไม่ให้เด็กที่ยังไม่แม่นทำวนอยู่ทั้งคืน
                      </p>
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
                    <p data-assignment-description className="text-xs text-muted-foreground">
                      โจทย์สุ่มตัวเลขจะได้ตัวเลขชุดใหม่ทุกครั้งที่วนกลับมา ข้อคงที่จะซ้ำของเดิม ·
                      ปิดไว้ = ทำครบคลังแล้วจบเลย
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
                  <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {streakBlocked}
                  </p>
                )}
                {!streakBlocked && streakExcluded > 0 && (
                  <p className="text-xs text-foreground bg-warning/10 rounded-lg px-3 py-2">
                    ข้อเขียนและข้อส่งไฟล์ {streakExcluded} ข้อจะไม่ถูกสุ่มมาในโหมดนี้ เพราะระบบตัดสินถูก/ผิดให้ทันทีไม่ได้
                    — เหลือโจทย์ที่ใช้ได้ {streakEligible} ข้อ
                  </p>
                )}
                {streakAdvice && (
                  <p className="text-xs text-foreground bg-warning/10 rounded-lg px-3 py-2">{streakAdvice}</p>
                )}

                {/* Lives here rather than with the ตรวจทีละข้อ switch in
                    ตั้งค่า, which this mode hides because it is forced on. It
                    is the one part of that switch still worth choosing, and
                    for a ข้อสอบ it is the difference between an answer key
                    that stays in the room and one that walks out. */}
                <div className="border-t border-border pt-3 space-y-1.5">
                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-ring cursor-pointer transition-all">
                    <div>
                      <p className="text-sm font-medium text-foreground">บอกคำตอบที่ถูกตอนกดตรวจ</p>
                      <p data-assignment-description className="text-xs text-muted-foreground">
                        {instantCheckAnswerKey
                          ? 'นักเรียนเห็นคำตอบที่ถูกทันที เหมาะกับการฝึกให้เข้าใจ'
                          : 'บอกแค่ถูก/ผิด ไม่บอกคำตอบ นักเรียนต้องคิดใหม่เอง'}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={instantCheckAnswerKey}
                      onChange={event => setInstantCheckAnswerKey(event.target.checked)}
                      className="accent-primary w-4 h-4 shrink-0"
                    />
                  </label>
                  {assignmentType === 'exam' && instantCheckAnswerKey && (
                    <p className="text-xs text-foreground bg-warning/10 rounded-lg px-3 py-2">
                      งานนี้เป็นข้อสอบ — เปิดไว้แปลว่านักเรียนที่จบก่อนถือคำตอบที่ถูกออกไปจากห้องได้ แนะนำให้ปิด
                    </p>
                  )}
                </div>

                <div className="border-t border-border pt-3 space-y-1">
                  <p className="text-xs font-medium text-foreground">โหมดนี้ตั้งค่าต่อไปนี้ให้เอง</p>
                  <p data-assignment-description className="text-xs text-muted-foreground">
                    เปิดการตรวจทีละข้อ · แสดงทีละ 1 ข้อ · ไม่ใช้เกณฑ์คะแนน/เปอร์เซ็นต์ ·
                    บันทึกเป็นผ่าน/ยังไม่ผ่าน โดยผ่าน = คะแนนเต็มที่ตั้งไว้ · เก็บคะแนนจากรอบที่ดีที่สุด ·
                    รอบใหม่เริ่มใหม่ทั้งชุด
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Step 2: ตั้งค่า ──────────────────────────────────────────── */}
      {step === 1 && (
        <Card padding="md" className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {assignmentType === 'exam' ? 'ตั้งค่าข้อสอบ' : 'ตั้งค่าแบบฝึกหัด'}
          </h2>

          <div className="space-y-2">
            {[
              // The แบบฝึกหัด/ข้อสอบ difference itself, so it sits above the
              // rest rather than among the shuffles. Never offered to a ข้อสอบ:
              // one ส่งคำตอบ at the end is what a ข้อสอบ is.
              ...(assignmentType === 'exercise' && !streakOn ? [{
                label: 'ให้นักเรียนกดตรวจทีละข้อ',
                desc: 'ทำข้อไหนเสร็จก็กดส่งเฉพาะข้อนั้น รู้ผลทันทีว่าถูกหรือผิด แล้วแก้ตรงนั้นได้เลย — คะแนนคิดจากคำตอบสุดท้ายตอนส่งงาน',
                value: instantCheck,
                set: setInstantCheck,
                footer: (instantCheck ? (
                  <div className="space-y-1.5 pl-3">
                    <label className="flex min-h-10 items-center justify-between rounded-xl border border-border px-3 py-2 cursor-pointer transition-colors hover:border-ring">
                      <div>
                        <p className="text-sm font-medium text-foreground">บอกคำตอบที่ถูกตอนกดตรวจ</p>
                        <p data-assignment-description className="text-xs text-muted-foreground">
                          {instantCheckAnswerKey
                            ? 'นักเรียนเห็นคำตอบที่ถูกทันที เหมาะกับการฝึกให้เข้าใจ — ส่วนเฉลยวิธีทำที่แนบไว้ ดูได้หลังจบงานตามติ๊ก "ให้นักเรียนดูเฉลยวิธีทำ"'
                            : 'บอกแค่ถูก/ผิด ไม่บอกคำตอบ นักเรียนต้องคิดใหม่เอง'}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={instantCheckAnswerKey}
                        onChange={e => setInstantCheckAnswerKey(e.target.checked)}
                        className="accent-primary w-4 h-4 shrink-0"
                      />
                    </label>
                    {instantCheckAnswerKey && (
                      <p className="text-xs text-foreground bg-warning/10 rounded-lg px-3 py-2">
                        นักเรียนเห็นคำตอบที่ถูกระหว่างทำ แล้วแก้คำตอบให้ถูกได้ คะแนนแบบฝึกหัดจึงสะท้อน &ldquo;ทำจนเข้าใจ&rdquo; ไม่ใช่ &ldquo;ถูกตั้งแต่แรก&rdquo; — ระบบบันทึกจำนวนครั้งที่กดตรวจไว้ให้ครูดูในหน้าผลรายคน
                      </p>
                    )}
                  </div>
                ) : null) as React.ReactNode,
              }] : []),
              {
                label: 'ให้นักเรียนใช้เครื่องคิดเลขวิทยาศาสตร์',
                desc: 'เปิดปุ่มเครื่องคิดเลขในหน้าทำโจทย์ นักเรียนเลือก DEG/RAD ตามช่องคำตอบที่กำลังใช้ได้',
                value: calculatorEnabled,
                set: setCalculatorEnabled,
                footer: null as React.ReactNode,
              }, {
                label: 'เปิดกระดาษทด',
                desc: 'ให้นักเรียนเขียนทดบนอุปกรณ์ได้ สิ่งที่ยังไม่แนบจะอยู่เฉพาะเครื่องและไม่กินพื้นที่เก็บไฟล์ของระบบ',
                value: scratchpadEnabled,
                set: setScratchpadEnabled,
                footer: null as React.ReactNode,
              },
              ...(assignedSections.length > 0 ? [{
                label: 'แสดงชื่อแฟ้มย่อยให้นักเรียนเห็น',
                desc: shuffleQ
                  ? `${assignedSections.length} แฟ้มย่อย — สับลำดับข้ออยู่ ชื่อแฟ้มย่อยจะแสดงกำกับรายข้อแทนหัวเรื่อง`
                  : `${assignedSections.length} แฟ้มย่อยจากแฟ้มโจทย์ เช่น "${assignedSections[0].title || 'ไม่ได้ตั้งชื่อ'}"`,
                value: showSections,
                set: setShowSections,
              }] : []),
              {
                label: 'สับลำดับข้อ',
                desc: 'นักเรียนแต่ละคนได้ลำดับข้อต่างกัน',
                value: shuffleQ,
                set: setShuffleQ,
              },
              {
                label: 'สับลำดับตัวเลือก (MCQ)',
                desc: 'ตัวเลือก A–D สลับสำหรับแต่ละคน',
                value: shuffleA,
                set: setShuffleA,
              },
              ...(randomValueQuestionCount > 0 ? [{
                label: 'ให้นักเรียนทุกคนได้ตัวเลขชุดเดียวกัน',
                desc: `มีโจทย์สุ่มตัวเลข ${randomValueQuestionCount} ข้อ — ปกติแต่ละคนได้ตัวเลขไม่ซ้ำกัน เปิดไว้ระบบจะสุ่มข้อละชุดเดียวแล้วให้ทุกคนทำตัวเลขชุดนั้น`,
                value: sharedRandomValues,
                set: setSharedRandomValues,
                footer: (sharedRandomValues ? (
                  <div className="space-y-1.5">
                    <p data-assignment-description className="text-xs text-muted-foreground px-1">
                      {canRepeat && 'ทำรอบใหม่ก็ยังได้ตัวเลขชุดเดิม · '}
                      สร้างงานแล้วกด &ldquo;ดูตัวอย่าง&rdquo; เพื่อดูตัวเลขที่นักเรียนจะได้
                    </p>
                    {assignmentType === 'exam' && (
                      <p className="text-xs text-foreground bg-warning/10 rounded-lg px-3 py-2">
                        ตัวเลขเหมือนกันทุกคน คำตอบที่ถูกจึงเหมือนกันทุกคนด้วย — นักเรียนบอกคำตอบกันได้ง่ายกว่าแบบต่างคนต่างสุ่ม
                      </p>
                    )}
                  </div>
                ) : null) as React.ReactNode,
              }] : []),
              ...(hasWorkImageQuestions ? [{
                label: 'ให้นักเรียนแนบรูปแสดงวิธีทำ',
                desc: `${assignmentType === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}นี้มีข้อเติมคำตอบตัวเลข — เปิดไว้จะต้องแนบรูปวิธีทำทุกข้อจึงจะส่งคำตอบได้ (ข้อที่มีข้อย่อย แนบข้อย่อยละ 1 รูป)`,
                value: requireWorkImage,
                set: setRequireWorkImage,
                footer: null as React.ReactNode,
              }] : []),
              // Reads as an on/off choice like the ones above it, so it is one
              // of them rather than a differently-shaped card further down the
              // step. Only offered where it can do anything: one attempt has
              // no "next time".
              // Hidden while a สุ่ม draw is on: the point of a draw is that the
              // next round is a different paper, which is the opposite of
              // coming back to the same ข้อ that were missed.
              ...(canRepeat && !randomDrawOn && !streakOn ? [{
                label: 'แก้ไขเฉพาะข้อที่ไม่ถูกต้อง/ได้คะแนนไม่เต็ม',
                desc: `รอบต่อไปนักเรียนได้ทำเฉพาะข้อที่ผิดหรือได้คะแนนไม่เต็ม ข้อที่ถูกแล้วยกคะแนนมาให้ คะแนนเต็มจึงเท่าเดิม ${sharedRandomOn ? 'ตัวเลขในโจทย์เป็นชุดเดิม (ตั้งให้ทุกคนได้ชุดเดียวกันไว้)' : 'ตัวเลขในโจทย์สุ่มใหม่ทุกรอบ'}`,
                value: retryScope === 'wrong_only',
                set: (on: boolean) => setRetryScope(on ? 'wrong_only' : 'all'),
                footer: (
                  <>
                    {retryScope === 'wrong_only' && showResults === 'immediate' && (
                      <p className="text-xs text-foreground bg-warning/10 rounded-lg px-3 py-2">
                        ตอนนี้ตั้งให้แสดงคำตอบที่ถูกทันทีหลังส่ง นักเรียนจึงเห็นคำตอบก่อนกลับมาแก้ข้อที่ผิด
                      </p>
                    )}
                    <p data-assignment-description className="text-xs text-muted-foreground px-1">
                      ข้ออัตนัยที่ครูยังไม่ได้ตรวจจะยกมาตามเดิม ไม่ถูกนับว่าผิดและนักเรียนแก้ไม่ได้
                    </p>
                  </>
                ) as React.ReactNode,
              }] : []),
            ].map(opt => (
              <div key={opt.label} className="space-y-1.5">
                <label className="flex min-h-10 items-center justify-between rounded-xl border border-border px-3 py-2 cursor-pointer transition-colors hover:border-ring">
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p data-assignment-description className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={opt.value}
                    onChange={e => opt.set(e.target.checked)}
                    className="accent-primary w-4 h-4 shrink-0"
                  />
                </label>
                {opt.footer}
              </div>
            ))}
            {randomDrawOn && canRepeat && (
              <p data-assignment-description className="text-xs text-muted-foreground px-1">
                ตั้งให้สุ่ม {questionsPerAttempt} ข้อจากคลังไว้ที่ขั้นเลือกโจทย์ รอบต่อไปนักเรียนจึงได้ชุดใหม่ทั้งชุด
                ไม่ใช่กลับมาแก้ข้อเดิม
              </p>
            )}
          </div>

          {assignmentType === 'exam' && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <label className="flex min-h-10 items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">บังคับใช้ Safe Exam Browser</p>
                  <p data-assignment-description className="text-xs text-muted-foreground mt-0.5">
                    ล็อกเครื่องและตรวจ Config Key + Browser Exam Key ก่อนเริ่ม อ่าน บันทึก อัปโหลด และส่งข้อสอบ
                  </p>
                </div>
                <input
                  id="create-seb-required"
                  type="checkbox"
                  checked={secureBrowserMode === 'seb_required'}
                  onChange={event => {
                    const enabled = event.target.checked
                    setSecureBrowserMode(enabled ? 'seb_required' : 'browser')
                    if (!enabled) {
                      setAndroidExamMode('blocked')
                      setSebQuitPassword('')
                      setSebQuitPasswordConfirmation('')
                    }
                    if (enabled) setProctoringEnabled(true)
                  }}
                  className="accent-primary w-4 h-4 shrink-0"
                />
              </label>
              <p className="text-xs leading-5 text-foreground">
                หลังสร้าง ข้อสอบจะอยู่เป็นร่างก่อน ระบบจะยอมเผยแพร่เมื่อไฟล์ SEB รุ่นของข้อสอบและ exact build ผ่านการตรวจครบ นักเรียนต้องตรวจเครื่องก่อนสอบ{' '}
                <Link href="/settings/exam-defaults" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                  ตรวจความพร้อม SEB
                </Link>
              </p>
              {secureBrowserMode === 'seb_required' && (
                <div className="ml-3 space-y-2 border-t border-border pt-3">
                  <label className="flex cursor-pointer items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">อนุญาต Android แบบครูอนุมัติรายคน</p>
                      <p data-assignment-description className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        นักเรียนรอในหน้าเข้าสอบ ครูตรวจว่าเป็นเครื่อง Android จริงแล้วกดอนุมัติจากห้องคุมสอบ
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={androidExamMode === 'monitored'}
                      onChange={event => setAndroidExamMode(event.target.checked ? 'monitored' : 'blocked')}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                  </label>
                  {androidExamMode === 'monitored' && (
                    <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-foreground">
                      Android monitored ตรวจการสลับแอป/ออกจากหน้าและการเชื่อมต่อ แต่เว็บห้ามหรือตรวจ screenshot ของระบบไม่ได้ จึงมีความมั่นใจต่ำกว่า SEB
                    </p>
                  )}
                  <SebQuitPasswordFields
                    idPrefix="create-seb-quit"
                    password={sebQuitPassword}
                    confirmation={sebQuitPasswordConfirmation}
                    onPasswordChange={setSebQuitPassword}
                    onConfirmationChange={setSebQuitPasswordConfirmation}
                    disabled={isPending}
                    compact
                  />
                </div>
              )}
            </div>
          )}

          {/* สุ่มชุดโจทย์รายคน used to live here, sharing a card with the
              watermark for no reason other than both being exam-only. It is
              now its own card in เลือกโจทย์, next to the คลัง it draws from,
              and available to แบบฝึกหัด as well. */}
          {assignmentType === 'exam' && (
            <label className="flex min-h-10 items-center justify-between gap-4 rounded-xl border border-border px-3 py-2 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-foreground">แสดงลายน้ำผู้เข้าสอบ</p>
                <p data-assignment-description className="text-xs text-muted-foreground mt-0.5">แสดงชื่อ รหัส attempt และเวลาบนหน้าข้อสอบ เพื่อลดการส่งภาพต่อ แต่ไม่สามารถกัน screenshot ได้ทั้งหมด</p>
              </div>
              <input
                type="checkbox"
                checked={examWatermarkEnabled}
                onChange={event => setExamWatermarkEnabled(event.target.checked)}
                className="accent-primary w-4 h-4 shrink-0"
              />
            </label>
          )}

          {assignmentType === 'exam' && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <label className="flex min-h-10 items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">เปิดห้องคุมสอบสด</p>
                  <p data-assignment-description className="text-xs text-muted-foreground mt-0.5">
                    ครูเห็นสถานะออนไลน์ การออกจากแท็บ/เต็มจอ และเหตุการณ์ที่ควรตรวจสอบแบบเรียลไทม์
                  </p>
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
                <div className="space-y-2 border-t border-border pt-3 pl-3">
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-foreground">บังคับกลับเข้าโหมดเต็มจอ</p>
                      <p data-assignment-description className="text-xs text-muted-foreground">หากออกจากเต็มจอ หน้าข้อสอบจะถูกบังจนกว่าจะกลับเข้า</p>
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
                      <p data-assignment-description className="text-xs text-muted-foreground">ลดการนำข้อความออกจากหน้า แต่ไม่สามารถกันภาพถ่ายหรือเครื่องมือระดับระบบได้ทั้งหมด</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={blockClipboard}
                      onChange={event => setBlockClipboard(event.target.checked)}
                      className="accent-primary w-4 h-4 shrink-0"
                    />
                  </label>
                  <p className="text-xs text-foreground">
                    เวลาในข้อสอบยังเดินต่อเมื่อออกจากแท็บหรือเต็มจอ เพื่อไม่ให้ใช้การออกจากหน้าเป็นวิธีหยุดเวลา
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Solution permission stays independent from the score/answer-key
              release choices in กำหนดการสอบ. */}
          <SolutionReleaseSetting
            checked={showSolutions}
            onChange={setShowSolutions}
            assignmentType={assignmentType}
            maxAttempts={maxAttempts}
            untilPassed={completionChoice !== 'complete'}
            compact
          />

        </Card>
      )}

      {/* ── Step 3: กำหนดการสอบ ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-3">
          <Card padding="md">
            <Collapsible defaultOpen={Boolean(startAt || endAt)}>
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 text-left">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">กำหนดวันทำ</span>
                  <span data-assignment-description className="text-sm font-normal text-muted-foreground">
                    {startAt && endAt
                      ? 'กำหนดเวลาเปิดและปิดรับแล้ว'
                      : startAt
                        ? 'กำหนดเวลาเปิดรับแล้ว'
                        : endAt
                          ? 'กำหนดเวลาปิดรับแล้ว'
                          : 'ไม่กำหนดวันและเวลา'}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
                <div className="grid gap-3 pt-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sat">เปิดรับตั้งแต่</Label>
                    <Input id="sat" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="eat">ปิดรับเมื่อ</Label>
                    <Input id="eat" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          <Card padding="md">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">รหัสผ่านเข้าทำ (ถ้ามี)</Label>
              <Input
                id="code"
                value={accessCode}
                onChange={e => setAccessCode(e.target.value)}
                placeholder="ไม่บังคับ — เว้นว่างถ้าไม่ต้องใช้รหัส"
                className="max-w-[200px]"
              />
            </div>
          </Card>

          {preselectedClassroomId && (
            <Card padding="md" className="flex flex-col gap-3">
              <ClassroomPicker
                classrooms={classrooms}
                selectedIds={classroomIds}
                onToggle={toggleClassroom}
                primaryClassroomId={preselectedClassroomId}
              />
              {classroomIds.some(id => id !== preselectedClassroomId) && (
                <div className="flex flex-col gap-1.5">
                  <Label>มอบหมายให้ในห้องเรียนอื่น</Label>
                  <GroupTargetPicker
                    classrooms={classroomIds.filter(id => id !== preselectedClassroomId).flatMap(id => {
                      const c = classrooms.find(room => room.id === id)
                      return c ? [{ id: c.id, name: c.name }] : []
                    })}
                    groupsByClassroom={groupsByClassroom}
                    value={groupTargets}
                    onChange={setGroupTargets}
                    idPrefix="additional-target"
                  />
                </div>
              )}
            </Card>
          )}

          <Card padding="md" className="flex flex-col gap-2.5">
            <h2 className="text-sm font-semibold text-foreground">แสดงผลลัพธ์</h2>
            <ToggleGroup
              value={[showResults]}
              onValueChange={values => {
                const next = values.at(-1)
                if (next === 'immediate' || next === 'score_only' || next === 'after_due' || next === 'never') {
                  setShowResults(next)
                }
              }}
              aria-label="เลือกการแสดงผลลัพธ์"
              variant="outline"
              orientation="vertical"
              spacing={2}
              className="w-full items-stretch"
            >
              {([
                { key: 'immediate', label: 'ทันทีหลังส่ง', desc: 'เห็นคะแนนและคำตอบที่ถูกทันที' },
                { key: 'score_only', label: 'แสดงคะแนน แต่ไม่แสดงคำตอบ', desc: 'เห็นคะแนนรวม แต่ซ่อนคำตอบรายข้อ' },
                { key: 'after_due', label: 'หลังพ้นกำหนดส่ง', desc: 'ซ่อนคำตอบที่ถูกจนกว่าจะหมดเขต' },
                { key: 'never', label: 'ไม่แสดงผลลัพธ์', desc: 'เห็นเพียงว่าส่งสำเร็จ' },
              ] as const).map(o => (
                <ToggleGroupItem
                  key={o.key}
                  value={o.key}
                  className="min-h-10 w-full min-w-0 justify-start whitespace-normal rounded-lg border border-border px-3 py-2 aria-pressed:bg-primary/10 aria-pressed:text-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                >
                  <span className="flex w-full items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:flex-row sm:items-center sm:gap-4">
                      <span className="text-sm font-medium text-foreground sm:w-64 sm:shrink-0">{o.label}</span>
                      <span data-assignment-description className="text-xs text-muted-foreground">{o.desc}</span>
                    </span>
                    {showResults === o.key && <Check className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Card>

          <AssignmentReviewSummary
            mode={isCopy ? 'copy' : 'create'}
            rows={[
              { label: 'ชื่อ', value: title },
              {
                label: 'ห้องเรียน',
                value: classroomIds.length <= 1
                  ? (classrooms.find(c => c.id === classroomIds[0])?.name ?? '—')
                  : `${classrooms.find(c => c.id === classroomIds[0])?.name ?? ''} และอีก ${classroomIds.length - 1} ห้อง`,
              },
              { label: 'มอบหมายให้', value: audienceSummary },
              { label: 'ประเภท', value: assignmentType === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด' },
              {
                label: 'โจทย์',
                value: randomDrawOn
                  ? `${questionsPerAttempt} ข้อ/คน (สุ่มจาก ${selectedIds.length})`
                  : `${selectedIds.length} ข้อ`,
              },
              {
                label: 'คะแนนเต็ม',
                value: displayMaxScore.trim() && Number(displayMaxScore) > 0
                  ? `${displayMaxScore} คะแนน (จริง ${pointsSum})`
                  : `${pointsSum} คะแนน`,
              },
              ...(duration ? [{ label: 'เวลา', value: `${duration} นาที` }] : []),
              {
                label: 'เงื่อนไขเพิ่มเติม',
                value: streakOn
                  ? `ทำถูกติดต่อกัน ${streakTarget} ข้อ`
                  : (passingEnabled && passingValue
                      ? `ผ่านเกณฑ์ ${passingType === 'percent' ? `${passingValue}%` : `${passingValue} คะแนน`}`
                      : `อนุญาตให้ทำ ${maxAttempts || 'ไม่จำกัด'} ครั้ง`),
              },
              ...(streakOn && streakCapValue ? [{ label: 'เพดานข้อ', value: `${streakCapValue} ข้อ` }] : []),
              ...(streakOn ? [{ label: 'ทำครบคลังแล้ว', value: streakRecycle ? 'วนกลับมาใหม่' : 'จบเลย' }] : []),
              { label: 'จำนวนครั้ง', value: completionChoice !== 'complete' ? 'ทำจนผ่าน · ผ่านแล้วไม่เริ่มรอบใหม่' : maxAttempts ? `${maxAttempts} ครั้ง` : 'ไม่จำกัด' },
              ...(canRepeat ? [{ label: 'วิธีเก็บคะแนน', value: SCORE_STRATEGY_LABELS[completionChoice === 'complete' ? scoreStrategy : 'best'] }] : []),
              ...(canRepeat && !randomDrawOn && !streakOn && retryScope === 'wrong_only'
                ? [{ label: 'การทำรอบต่อไป', value: 'แก้เฉพาะข้อที่ไม่ถูกต้อง' }]
                : []),
              ...(randomDrawOn && canRepeat
                ? [{ label: 'การทำรอบต่อไป', value: 'สุ่มชุดใหม่ทั้งชุด' }]
                : []),
              ...(perPageValue > 1
                ? [{ label: 'ข้อต่อหน้า', value: `${perPageValue} ข้อ` }]
                : []),
              ...(accessCode.trim() ? [{ label: 'รหัสผ่าน', value: accessCode.trim() }] : []),
              ...(assignmentType === 'exam' && proctoringEnabled
                ? [{ label: 'คุมสอบสด', value: fullscreenRequired ? 'เปิด · บังคับเต็มจอ' : 'เปิด' }]
                : []),
              ...(assignmentType === 'exam' && secureBrowserMode === 'seb_required'
                ? [{ label: 'Safe Exam Browser', value: 'บังคับใช้' }]
                : []),
              ...(assignmentType === 'exam' && secureBrowserMode === 'seb_required'
                ? [{ label: 'รหัสออก SEB', value: 'ครูกำหนดแล้ว · รอเตรียมไฟล์เฉพาะข้อสอบ' }]
                : []),
              ...(assignmentType === 'exam' && androidExamMode === 'monitored'
                ? [{ label: 'Android', value: 'ครูอนุมัติรายคน · monitored' }]
                : []),
              ...(hasWorkImageQuestions
                ? [{ label: 'รูปวิธีทำ', value: requireWorkImage ? 'บังคับแนบทุกข้อตัวเลข' : 'ไม่บังคับ' }]
                : []),
              ...(randomValueQuestionCount > 0
                ? [{ label: 'ตัวเลขในโจทย์สุ่ม', value: sharedRandomOn ? 'ทุกคนได้ชุดเดียวกัน' : 'แต่ละคนได้ต่างกัน' }]
                : []),
              { label: 'เครื่องคิดเลข', value: calculatorEnabled ? 'เปิด' : 'ปิด' },
              { label: 'กระดาษทด', value: scratchpadEnabled ? 'เปิด' : 'ปิด' },
              { label: 'แสดงผล', value: SHOW_RESULTS_SUMMARY[showResults] },
              { label: 'เฉลยวิธีทำ', value: showSolutions ? 'ให้ดูเมื่อทำเสร็จ' : 'ไม่ให้ดู' },
            ]}
          />
          <AssignmentSettingPresetsSave />
        </div>
      )}

      <QuestionListPreviewDialog
        ids={listPreview?.ids ?? []}
        title={listPreview?.title}
        open={listPreview !== null}
        onOpenChange={open => { if (!open) setListPreview(null) }}
        loadQuestions={actions?.getQuestionPreviewDetails}
      />
      <QuestionPreviewDialog
        ids={previewIds}
        open={previewIndex !== null}
        startIndex={previewIndex ?? 0}
        onOpenChange={open => { if (!open) setPreviewIndex(null) }}
      />

      {/* Navigation */}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => step > 0 ? setStep(s => s - 1) : router.back()}
          className="w-full gap-2 sm:w-auto"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext()}
            className="w-full gap-2 sm:w-auto"
          >
            ถัดไป <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              <Save data-icon="inline-start" />
              {isPending
                ? (isCopy ? 'กำลังทำสำเนา...' : 'กำลังบันทึก...')
                : (isCopy ? 'ทำสำเนาเป็นแบบร่าง' : 'บันทึกแบบร่าง')}
            </Button>
            <Button
              type="button"
              onClick={openPublishDialog}
              disabled={isPending}
              className="w-full gap-2 sm:w-auto"
            >
              <FileText className="w-4 h-4" />
              {isPending
                ? (isCopy ? 'กำลังทำสำเนา...' : 'กำลังสร้าง...')
                : (isCopy ? 'ทำสำเนา' : assignmentType === 'exam' ? 'สร้างชุดข้อสอบ' : 'สร้างแบบฝึกหัด')}
            </Button>
          </div>
        )}
      </div>

      {/* Publish timing dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay backdrop-blur-sm px-4">
          <Card padding="xl" elevation="xl" className="max-w-sm w-full">
            <h3 className="font-bold text-lg text-foreground">
              {isCopy ? 'เผยแพร่สำเนานี้เมื่อไหร่?' : `เผยแพร่${assignmentType === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}นี้เมื่อไหร่?`}
            </h3>
            <p data-assignment-description className="text-sm text-muted-foreground mt-2">
              เลือกได้ว่าจะให้นักเรียนเห็นและเริ่มทำได้ทันที ตั้งเวลาให้เปิดล่วงหน้า หรือเก็บไว้เป็นร่างก่อนแล้วค่อยเผยแพร่ทีหลัง
            </p>

            {!scheduleMode ? (
              <div className="flex flex-col gap-2 mt-5">
                <Button type="button" onClick={handlePublishNow} disabled={isPending} className="w-full">
                  {isPending ? (isCopy ? 'กำลังทำสำเนา...' : 'กำลังสร้าง...') : (isCopy ? 'ทำสำเนาและเผยแพร่ทันที' : 'เผยแพร่ทันที')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setScheduleMode(true)} disabled={isPending} className="w-full">
                  ตั้งเวลาเผยแพร่ล่วงหน้า
                </Button>
                <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isPending} className="w-full">
                  {isPending ? (isCopy ? 'กำลังทำสำเนา...' : 'กำลังบันทึก...') : (isCopy ? 'ทำสำเนาเป็นแบบร่าง' : 'ยังไม่เผยแพร่ (เก็บไว้เป็นร่าง)')}
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
                  <p data-assignment-description className="text-xs text-muted-foreground">นักเรียนจะเริ่มเห็นและเข้าทำได้ตั้งแต่เวลานี้เป็นต้นไป</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" onClick={handleScheduleConfirm} disabled={isPending} className="w-full">
                    {isPending ? (isCopy ? 'กำลังทำสำเนา...' : 'กำลังสร้าง...') : (isCopy ? 'ทำสำเนาและตั้งเวลา' : 'ยืนยันตั้งเวลาเผยแพร่')}
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
    </AssignmentSettingPresetsProvider>
  )
}

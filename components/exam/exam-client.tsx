'use client'

import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { checkAnswer, drawNextStreakQuestion, saveWorkImage, submitSubmission } from '@/lib/actions/submissions'
import { StreakEndScreen, StreakMeter, type StreakView } from '@/components/exam/streak-progress'
import type { StreakEnding } from '@/lib/streak-run'
// Type-only: `gradeAnswer` pulls in mathjs (~640 KB), which only a teacher's
// previewMode grading ever runs. Importing it statically shipped that whole
// evaluator to every student's phone and pushed the exam page past what a
// mobile browser would allocate, so it is loaded on demand in handleSubmit.
import type { GradedAnswer } from '@/lib/assignment-attempt'
// Type-only for the same reason: buildAnswerFeedback reaches the evaluator too,
// and only a teacher's previewMode ever runs it in the browser.
import type { AnswerFeedback } from '@/lib/answer-feedback'
import { isInstantCheckable } from '@/lib/grading'
import { useAnswerAutosave } from '@/hooks/use-answer-autosave'
import { useTabSwitchGuard } from '@/hooks/use-tab-switch-guard'
import { useFullscreenGuard } from '@/hooks/use-fullscreen-guard'
import { useExamTimer } from '@/hooks/use-exam-timer'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useExamProctor } from '@/hooks/use-exam-proctor'
import { WorkImageUpload } from './work-image-upload'
import { FileSubmissionUpload } from './file-submission-upload'
import { MatchingDragInput, type MatchingOption } from './matching-drag-input'
import { MatchingLineInput } from './matching-line-input'
import { placementFromTexts, textsFromPlacement } from '@/lib/matching-answer'
import { OrderingDragList } from './ordering-drag-list'
import { orderingDisplayOrder, orderingIsAnswered } from '@/lib/ordering-answer'
import { choiceListHint } from '@/lib/choice-list-hint'
import { choicesFitOneRow } from '@/lib/choice-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Flag, Eye, EyeOff, Maximize2, Minimize2, CheckCircle2, XCircle, Clock, AlertTriangle,
  Wifi, WifiOff, ShieldAlert, Maximize, MonitorSmartphone, CircleCheck, RotateCcw, Lightbulb,
  Pencil, Calculator as CalculatorIcon, NotebookPen, Loader2, Paperclip, Trash2,
} from 'lucide-react'
import { RichText } from '@/components/ui/rich-text'
import { containsMath, renderMathInHtml } from '@/lib/math/latex'
import { partLabels } from '@/lib/part-labels'
import { groupQuestionsBySection, sectionByQuestionId, type QuestionSetSection } from '@/lib/question-set-sections'
import { getBlankType, splitFillBlankHtml, extractBlankNumbers } from '@/lib/fill-blank'
import { splitAnswerBlankHtml, countAnswerBlanks, splitNumberedAnswerBlanks } from '@/lib/answer-blank'
import type { AnswerPart, MatchingAnswerMode, MathInputMode, TrueFalseConfig, TrueFalseStatement, TrueFalseExplanationMode, FillBlankConfig, OrderingConfig, OrderingItem, RandomQuestionConfig, FileUploadConfig, SubmittedFile, CompositeConfig, ClassifyConfig } from '@/lib/types'
import { CLASSIFY_UNSET, parseClassifyGrid } from '@/lib/classify'
import type {
  SafeAnswerPart,
  SafeCompositeConfig,
  SafeMatchingConfig,
  SafeClassifyConfig,
  SafeExamAnswer,
  SafeFillBlankConfig,
  SafeOrderingConfig,
  SafeRandomQuestionConfig,
  SafeTrueFalseConfig,
  SafeTrueFalseStatement,
} from '@/lib/exam-safe'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { ExamWatermark } from './exam-watermark'
import { MathAnswerField } from './math-answer-field'
import { mathInputPartKey, readMathInputMode, type MathInputModes } from '@/lib/math/input-mode'
import { hasCompleteWorkEvidence, workArtifactPartKey, type StudentWorkArtifactView } from '@/lib/math-work'

// ─── Types ────────────────────────────────────────────────────────────────────

const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']
const ScientificCalculator = lazy(() => import('./scientific-calculator'))
const Scratchpad = lazy(() => import('./scratchpad'))

interface AnswerRow extends Omit<SafeExamAnswer, 'questions'> {
  correct_answer?: string
  // Only populated for a teacher's preview (see previewMode) — real
  // submission_answers rows carry this column too, but the real exam-taking
  // route never needs it client-side since grading happens server-side.
  max_score?: number
  // Preview-only: whether this teacher may open this โจทย์ in the คลัง. A
  // question a teammate shared without เปิดให้แก้ร่วมกัน is readable here but
  // not editable, and the edit route would answer 404 — so the button is not
  // drawn rather than drawn and broken. Never set on the student route.
  canEditQuestion?: boolean
  questions: {
    title: string
    question_text: string
    question_type: string
    answer_unit: string | null
    // is_correct is intentionally stripped server-side before this reaches
    // the client — never trust/display it here pre-submission.
    // MCQ options for 'mcq'; for 'matching' this instead carries the left-hand
    // prompts, with the shuffled right-hand column in `matching_options`
    // (split apart server-side so the pairing isn't shipped to the client).
    mcq_options: Array<{ text?: string; image_url?: string; index?: number; left_text?: string; left_image?: string }> | null
    matching_options?: Array<{ right_text: string; right_image?: string }> | null
    variables: Array<{ name: string; unit?: string; type?: string }>
    answer_parts: SafeAnswerPart[] | AnswerPart[] | null
    extra_data: SafeExamAnswer['questions']['extra_data'] | TrueFalseConfig | FillBlankConfig | OrderingConfig | RandomQuestionConfig | CompositeConfig
    image_urls: string[] | null
    // Preview-only, see AnswerRow.max_score above.
    answer_tolerance?: number
    // Preview-only as well: a real attempt's ตรวจคำตอบ gets the teacher's
    // วิธีทำ from the server, which is the only side that may decide whether
    // the student is allowed to see it yet.
    solution_text?: string | null
    solution_image_urls?: string[] | null
  }
}

export interface ExamConfig {
  proctoringEnabled: boolean
  isFullscreenEnforced: boolean
  blockClipboard: boolean
  watermarkText: string | null
  // Whether this งาน asks students to attach evidence of their working. One
  // decision for the whole assignment, made by the teacher when they create it
  // — every เติมคำตอบตัวเลข question in it either needs a photo or none does.
  isWorkImageEnforced: boolean
  // แบบฝึกหัด only: each ข้อ carries its own ตรวจคำตอบ button, so a student
  // finds out whether they got it right — and reads the เฉลย, when the teacher
  // left that on — without waiting for the single ส่งคำตอบ at the end. This is
  // the difference between a แบบฝึกหัด and a ข้อสอบ; the server re-checks the
  // งาน's type and setting on every check, this only draws the button.
  instantCheck?: boolean
  // Whether that check shows the เฉลย, or only says ถูก/ผิด and leaves the
  // student to think again. On a real attempt this is advisory — the server
  // decides what it puts in the response — and only previewMode, which grades
  // its own copy, reads it to make the same decision.
  instantCheckAnswerKey?: boolean
  /** Server-derived assignment rule; the calculator chunk is fetched only after a click. */
  calculatorEnabled: boolean
  /** Server-derived assignment rule; the drawing editor chunk is fetched only after a click. */
  scratchpadEnabled: boolean
}

interface CalculatorTarget {
  answerId: string
  partKey: string
  label: string
}

interface ScratchpadTarget {
  answerId: string
  localPartKey: string
  artifactPartKey: string
  label: string
}

interface Props {
  submissionId: string
  /** Authenticated user id used only to namespace local IndexedDB data. */
  storageOwnerId: string
  answers: AnswerRow[]
  initialWorkArtifacts?: StudentWorkArtifactView[]
  durationMinutes: number | null
  startedAt: string
  config: ExamConfig
  /** แฟ้มย่อย snapshotted onto the assignment, already filtered by the server to
   *  what this assignment contains. Empty/omitted = plain numbered list. */
  sections?: QuestionSetSection[]
  /** How many questions share one screen. 1 (the default, and every
   *  assignment saved before the setting existed) is the original
   *  one-question-per-screen layout. */
  questionsPerPage?: number
  /** Present only for a "ถูกติดต่อกัน" งาน. Its rows arrive one at a time, so
   *  `answers` holds what has been handed out so far rather than the whole
   *  paper, and the count — not a question number — is what the student is
   *  working toward. Absent for every other งาน, which is what keeps this
   *  mode out of their way entirely. */
  streak?: StreakView
  // Teacher-facing "see it as a student would" mode: renders the exact same
  // UI/interactions but never calls the save/submit server actions (there is
  // no real submission row behind `submissionId` to write to), and exits via
  // `previewReturnHref` instead of the real post-submit redirect.
  previewMode?: boolean
  previewReturnHref?: string
  /** Preview-only: shown under the banner when editing a โจทย์ from here can
   *  no longer reach everyone — i.e. someone has already started this งาน and
   *  is holding a frozen copy of it. */
  previewEditWarning?: string
}

// ─── ExamClient ───────────────────────────────────────────────────────────────

function initLocalAnswers(answers: AnswerRow[]): Record<string, string> {
  return Object.fromEntries(answers.map(a => [a.id, a.student_answer ?? '']))
}

function initWorkImages(answers: AnswerRow[]): Record<string, (string | null)[]> {
  return Object.fromEntries(answers.map(a => [a.id, a.work_images ?? []]))
}

function initMathInputModes(answers: AnswerRow[]): Record<string, MathInputModes> {
  return Object.fromEntries(answers.map(a => [a.id, a.math_input_modes ?? {}]))
}

function workArtifactMap(artifacts: StudentWorkArtifactView[]): Record<string, StudentWorkArtifactView> {
  return Object.fromEntries(artifacts.map(artifact => [
    `${artifact.submissionAnswerId}:${artifact.partKey}`,
    artifact,
  ]))
}

function workPartKeys(answer: AnswerRow, partIndex: number): { localPartKey: string; artifactPartKey: string } {
  const parts = (answer.questions.answer_parts ?? []) as Array<{ id?: string }>
  if (parts.length <= 1) {
    return {
      localPartKey: mathInputPartKey(parts[0]?.id, 0, 1),
      artifactPartKey: workArtifactPartKey(0, 1),
    }
  }
  const safeIndex = Math.max(0, Math.min(partIndex, parts.length - 1))
  return {
    localPartKey: mathInputPartKey(parts[safeIndex]?.id, safeIndex, parts.length),
    artifactPartKey: workArtifactPartKey(safeIndex, parts.length),
  }
}

/**
 * How many pieces of working evidence this question needs before submission.
 *
 * Nothing about the โจทย์ decides this any more — only the งาน does. A
 * เติมคำตอบตัวเลข question asks for one item per ข้อย่อย (one if it has none);
 * every other type asks for none, because there is no numeric working to show.
 */
function requiredWorkImageCount(a: AnswerRow, config: ExamConfig): number {
  if (!config.isWorkImageEnforced) return 0
  if (a.questions.question_type !== 'written') return 0
  const parts = a.questions.answer_parts
  return parts && parts.length > 0 ? parts.length : 1
}

export function ExamClient({ submissionId, storageOwnerId, answers, initialWorkArtifacts = [], durationMinutes, startedAt, config, sections = [], questionsPerPage = 1, streak, previewMode = false, previewReturnHref, previewEditWarning }: Props) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const {
    localAnswers, localAnswersRef, localMathInputModes, localMathInputModesRef,
    setAnswer, setMathInputMode, flushQueuedAnswers, retryPending, clearSavedAnswers,
    saving, pendingCount,
  } = useAnswerAutosave({
    submissionId,
    initialAnswers: () => initLocalAnswers(answers),
    initialMathInputModes: () => initMathInputModes(answers),
    previewMode,
  })
  const [workImages, setWorkImages] = useState<Record<string, (string | null)[]>>(
    () => initWorkImages(answers)
  )
  const [workArtifacts, setWorkArtifacts] = useState<Record<string, StudentWorkArtifactView>>(
    () => workArtifactMap(initialWorkArtifacts)
  )
  const [submitting, setSubmitting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  /** -1 for every งาน that is not a streak run, which disables the sync below. */
  const streakLatestIndex = streak != null ? answers.length - 1 : -1
  // Runs follow the order this student actually sees (shuffling reorders
  // submission_answers), so a shuffled exam simply breaks into short runs
  // instead of printing headings over the wrong questions.
  const sectionOwner = sectionByQuestionId(sections)
  const sectionRuns = groupQuestionsBySection(answers.map(a => a.question_id), sections)
  // Preview-only: the client-side (never persisted) grading result shown
  // after a teacher clicks submit in previewMode, in place of the real
  // /submissions/[id] results page.
  const [previewResult, setPreviewResult] = useState<{ graded: GradedAnswer[]; totalScore: number; totalMax: number } | null>(null)
  // ── ตรวจทีละข้อ (แบบฝึกหัด) ───────────────────────────────────────────────
  // The result of the last ตรวจคำตอบ on each ข้อ, keyed by submission_answer id.
  // Deliberately not persisted anywhere client-side: it is cleared the moment
  // the answer under it changes (see handleAnswerChange), so a panel on screen
  // always describes the answer currently in the box. Nothing here decides a
  // score — the final ส่งคำตอบ re-grades every ข้อ from what was last saved.
  const [checked, setChecked] = useState<Record<string, AnswerFeedback & { checkCount: number }>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const instantCheckOn = config.instantCheck === true

  // ── UX state ────────────────────────────────────────────────────────────────
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [eliminated, setEliminated] = useState<Record<string, Set<number>>>({})
  const [focusMode, setFocusMode] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submitCountdown, setSubmitCountdown] = useState(0)
  const [activeMathField, setActiveMathField] = useState<string | null>(null)
  const [calculatorTarget, setCalculatorTarget] = useState<CalculatorTarget | null>(null)
  const [calculatorLoaded, setCalculatorLoaded] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [standaloneCalculatorMode, setStandaloneCalculatorMode] = useState<MathInputMode>('deg')
  const [scratchpadLoaded, setScratchpadLoaded] = useState(false)
  const [showScratchpad, setShowScratchpad] = useState(false)
  const [scratchpadTarget, setScratchpadTarget] = useState<ScratchpadTarget | null>(null)
  const [loadAttachedNonce, setLoadAttachedNonce] = useState(0)

  const navigateTo = useCallback((index: number) => {
    setCurrentIndex(index)
    setActiveMathField(null)
    setCalculatorTarget(null)
    setScratchpadTarget(null)
    setLoadAttachedNonce(0)
  }, [])

  // In a streak run the ข้อ in hand is always the newest row, and a drawn ข้อ
  // arrives by refreshing the route. Without this the refresh would land the
  // student back on the first ข้อ they already answered, with a ตรวจแล้ว panel
  // and a ข้อต่อไป button that draws nothing.
  useEffect(() => {
    if (streakLatestIndex >= 0) setCurrentIndex(streakLatestIndex)
  }, [streakLatestIndex])

  // ── Anti-cheat ──────────────────────────────────────────────────────────────
  const { tabSwitchCount, showTabWarning } = useTabSwitchGuard()
  const { showFullscreenWarning, requestFullscreen } = useFullscreenGuard(config.isFullscreenEnforced)
  const { status: proctorStatus, activeConnectionCount: proctorActiveConnectionCount } = useExamProctor({
    enabled: config.proctoringEnabled && !previewMode,
    submissionId,
    blockClipboard: config.blockClipboard,
  })

  // ── Auto-sync whatever went unsaved while offline ───────────────────────────
  const isOnline = useOnlineStatus({
    onOnline: async () => {
      if (pendingCount === 0) return
      toast.info(`กำลังซิงก์คำตอบ ${pendingCount} ข้อ...`)
      const synced = await retryPending()
      if (synced.ok) toast.success('ซิงก์คำตอบสำเร็จ ✓')
      else toast.warning(synced.error ?? 'ยังมีบางคำตอบที่รอซิงก์ ระบบจะลองอีกครั้งเมื่อเชื่อมต่อใหม่')
    },
    onOffline: () => {
      toast.warning('อินเทอร์เน็ตหลุด — บันทึกในเครื่องแล้ว จะซิงก์อัตโนมัติเมื่อเน็ตกลับมา')
    },
  })

  // ── Countdown timer ─────────────────────────────────────────────────────────
  const secondsLeft = useExamTimer(durationMinutes, startedAt, () => handleSubmit())

  // ── Teacher preview: warm the grading module ────────────────────────────────
  // previewMode grades in the browser through gradeAnswer and lays the ตรวจ
  // panel out through buildAnswerFeedback; both reach mathjs. Students never
  // run either — the real routes grade on the server — so neither is imported
  // at the top of this file. Fetching them here, on the preview route only and
  // while the teacher is still reading the first question, keeps the ตรวจ and
  // submit clicks as instant and offline-tolerant as a static import would.
  useEffect(() => {
    if (!previewMode) return
    void import('@/lib/assignment-attempt')
    void import('@/lib/answer-feedback')
  }, [previewMode])

  // ── 5. Submit countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (submitCountdown <= 0) return
    const t = setTimeout(() => setSubmitCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [submitCountdown])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  // Editing an answer invalidates whatever ตรวจ said about it — the panel would
  // otherwise sit under a box that no longer holds the answer it described,
  // which is worse than no panel. This is also what makes ทำใหม่ work without
  // locking the inputs: change anything and the ข้อ is simply open again.
  const handleAnswerChange = useCallback((answerId: string, value: string) => {
    setChecked(prev => {
      if (!(answerId in prev)) return prev
      const next = { ...prev }
      delete next[answerId]
      return next
    })
    setAnswer(answerId, value)
  }, [setAnswer])

  // ── "ถูกติดต่อกัน" run ─────────────────────────────────────────────────────
  // Seeded from the server and then moved by what checkAnswer reports, so the
  // meter follows the count the server actually stored rather than a guess
  // made from the verdict on screen.
  const router = useRouter()
  const [streakState, setStreakState] = useState<StreakView | undefined>(streak)
  const [streakEnd, setStreakEnd] = useState<Exclude<StreakEnding, null> | null>(null)
  const [drawingNext, setDrawingNext] = useState(false)
  const streakOn = streakState != null

  const clearCheck = useCallback((answerId: string) => {
    setChecked(prev => {
      if (!(answerId in prev)) return prev
      const next = { ...prev }
      delete next[answerId]
      return next
    })
  }, [])

  /**
   * ตรวจคำตอบข้อนี้ — the one thing a แบบฝึกหัด does that a ข้อสอบ does not.
   *
   * Flushes first for the same reason handleSubmit does: the answer is graded
   * from the row in the database, so checking inside the autosave debounce
   * would mark the previous keystroke's answer. On a real attempt the verdict
   * and the เฉลย are decided entirely server-side (see checkAnswer) — the
   * browser never held the answer key to begin with. previewMode has no
   * submission row to check against, so it grades its own frozen copy in the
   * browser using the very same two functions, loaded on demand so students
   * never pay for the evaluator behind them.
   */
  const handleCheck = useCallback(async (answerId: string) => {
    if (checkingId) return
    setCheckingId(answerId)
    try {
      if (previewMode) {
        const answer = answers.find(a => a.id === answerId)
        if (!answer) return
        const [{ gradeAnswer }, { buildAnswerFeedback }] = await Promise.all([
          import('@/lib/assignment-attempt'),
          import('@/lib/answer-feedback'),
        ])
        const gradable = {
          id: answer.id,
          correct_answer: answer.correct_answer ?? '',
          student_answer: localAnswersRef.current[answer.id] ?? null,
          math_input_modes: localMathInputModesRef.current[answer.id] ?? {},
          max_score: answer.max_score ?? 0,
          questions: {
            question_type: answer.questions.question_type,
            answer_tolerance: answer.questions.answer_tolerance ?? 0.1,
            answer_parts: answer.questions.answer_parts as AnswerPart[] | null,
            extra_data: answer.questions.extra_data,
          },
        }
        const graded = gradeAnswer(gradable)
        const feedback = buildAnswerFeedback({
          correct_answer: gradable.correct_answer,
          student_answer: gradable.student_answer,
          math_input_modes: gradable.math_input_modes,
          question: {
            question_type: answer.questions.question_type,
            answer_unit: answer.questions.answer_unit,
            answer_parts: answer.questions.answer_parts as AnswerPart[] | null,
            answer_tolerance: answer.questions.answer_tolerance ?? 0.1,
            extra_data: answer.questions.extra_data,
            mcq_options: answer.questions.mcq_options,
            solution_text: answer.questions.solution_text ?? null,
            solution_image_urls: answer.questions.solution_image_urls ?? null,
          },
          isCorrect: graded.is_correct,
          score: graded.score,
          maxScore: gradable.max_score,
          revealAnswerKey: config.instantCheckAnswerKey !== false,
        })
        setChecked(prev => ({
          ...prev,
          [answerId]: { ...feedback, checkCount: (prev[answerId]?.checkCount ?? 0) + 1 },
        }))
        return
      }

      // A refusal has a reason the student can act on; a thrown request does
      // not. Do not retry checkAnswer here: it increments check_count, and a
      // request can commit while only its response is lost.
      const synced = await flushQueuedAnswers()
      if (!synced.ok) {
        toast.error(synced.error ?? 'ยังบันทึกคำตอบล่าสุดไม่ครบ กรุณาตรวจอินเทอร์เน็ตแล้วลองตรวจอีกครั้ง')
        return
      }
      const result = await checkAnswer(answerId)
      if (!result || 'error' in result) {
        toast.error(result?.error ?? 'ตรวจคำตอบไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setChecked(prev => ({ ...prev, [answerId]: { ...result.feedback, checkCount: result.checkCount } }))
      // The count the server just wrote. Reading it back here is what keeps the
      // meter honest about a ข้อ whose verdict was pending and therefore did
      // not move it.
      if ('streak' in result && result.streak) {
        const next = result.streak
        setStreakState(prev => prev && {
          ...prev,
          current: next.current,
          best: next.best,
          reached: next.reached,
        })
      }
    } catch {
      toast.error('ตรวจคำตอบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setCheckingId(null)
    }
  }, [answers, checkingId, config.instantCheckAnswerKey, flushQueuedAnswers, localAnswersRef, localMathInputModesRef, previewMode])

  /**
   * Ask the server for the next ข้อ, or find out the attempt is over.
   *
   * The new row is fetched by refreshing the route rather than being returned
   * here: the ข้อ a student sees has to come through getExamTakingData and
   * toSafeExamAnswer, which is what strips the answer key. Handing it back
   * from an action would be a second, unstripped path to the same data.
   */
  const handleDrawNext = useCallback(async (keepPracticing = false) => {
    if (drawingNext || previewMode) return
    setDrawingNext(true)
    try {
      const synced = await flushQueuedAnswers()
      if (!synced.ok) {
        toast.error(synced.error ?? 'ยังบันทึกคำตอบล่าสุดไม่ครบ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง')
        return
      }
      const result = await drawNextStreakQuestion(submissionId, { keepPracticing })
      if (!result || 'error' in result) {
        toast.error(result?.error ?? 'ดึงโจทย์ข้อต่อไปไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      if (result.streak) {
        const next = result.streak
        setStreakState(prev => prev && {
          ...prev,
          current: next.current,
          best: next.best,
          reached: next.reached,
          askedCount: result.askedCount ?? prev.askedCount,
        })
      }
      if ('ending' in result && result.ending) {
        setStreakEnd(result.ending)
        return
      }
      setStreakEnd(null)
      router.refresh()
    } catch {
      toast.error('ดึงโจทย์ข้อต่อไปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setDrawingNext(false)
    }
  }, [drawingNext, flushQueuedAnswers, previewMode, router, submissionId])

  const handlePartAnswerChange = useCallback((
    answerId: string, partIndex: number, value: string, totalParts: number, currentRaw: string,
  ) => {
    let arr: string[] = []
    try { arr = JSON.parse(currentRaw || '[]') } catch { arr = [] }
    while (arr.length < totalParts) arr.push('')
    arr[partIndex] = value
    handleAnswerChange(answerId, JSON.stringify(arr))
  }, [handleAnswerChange])

  const handleMathInputModeChange = useCallback((
    answerId: string,
    partKey: string,
    mode: MathInputMode,
  ) => {
    clearCheck(answerId)
    setMathInputMode(answerId, partKey, mode)
  }, [clearCheck, setMathInputMode])

  const handleMathFieldActivate = useCallback((
    fieldId: string,
    answerId: string,
    partKey: string,
    label: string,
  ) => {
    const questionNumber = answers.findIndex(answer => answer.id === answerId) + 1
    setActiveMathField(fieldId)
    setCalculatorTarget({
      answerId,
      partKey,
      label: questionNumber > 0 ? `ข้อ ${questionNumber} · ${label}` : label,
    })
  }, [answers])

  const calculatorMode = calculatorTarget
    ? readMathInputMode(localMathInputModes[calculatorTarget.answerId], calculatorTarget.partKey)
    : standaloneCalculatorMode

  const handleCalculatorModeChange = useCallback((mode: MathInputMode) => {
    if (calculatorTarget) {
      handleMathInputModeChange(calculatorTarget.answerId, calculatorTarget.partKey, mode)
    } else {
      setStandaloneCalculatorMode(mode)
    }
  }, [calculatorTarget, handleMathInputModeChange])

  const toggleCalculator = useCallback(() => {
    setCalculatorLoaded(true)
    setShowCalculator(open => !open)
    setShowScratchpad(false)
    setActiveMathField(null)
  }, [])

  const toggleScratchpad = useCallback(() => {
    setScratchpadLoaded(true)
    setShowScratchpad(open => {
      if (!open) {
        setLoadAttachedNonce(0)
        const answer = calculatorTarget
          ? answers.find(item => item.id === calculatorTarget.answerId)
          : answers[currentIndex]
        if (answer) {
          const parts = (answer.questions.answer_parts ?? []) as Array<{ id?: string }>
          const partIndex = calculatorTarget
            ? Math.max(0, parts.findIndex((part, index) => (
                mathInputPartKey(part.id, index, parts.length) === calculatorTarget.partKey
              )))
            : 0
          const keys = workPartKeys(answer, partIndex)
          setScratchpadTarget({
            answerId: answer.id,
            ...keys,
            label: calculatorTarget?.label ?? `ข้อ ${answers.findIndex(item => item.id === answer.id) + 1}`,
          })
        }
      }
      return !open
    })
    setShowCalculator(false)
    setActiveMathField(null)
  }, [answers, calculatorTarget, currentIndex])

  const openScratchpadForPart = useCallback((
    answerId: string,
    partIndex: number,
    label: string,
    loadAttached = false,
  ) => {
    const answer = answers.find(item => item.id === answerId)
    if (!answer) return
    setScratchpadTarget({ answerId, ...workPartKeys(answer, partIndex), label })
    if (loadAttached) setLoadAttachedNonce(nonce => nonce + 1)
    else setLoadAttachedNonce(0)
    setScratchpadLoaded(true)
    setShowScratchpad(true)
    setShowCalculator(false)
    setActiveMathField(null)
  }, [answers])

  const refreshWorkArtifacts = useCallback(async (answerId: string) => {
    if (previewMode) return
    try {
      const { getStudentWorkArtifacts } = await import('@/lib/actions/math-work')
      const result = await getStudentWorkArtifacts(answerId)
      if (!result || 'error' in result) {
        toast.error(result?.error ?? 'เปิดวิธีทำไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setWorkArtifacts(previous => {
        const next = Object.fromEntries(Object.entries(previous).filter(([, artifact]) => (
          artifact.submissionAnswerId !== answerId
        )))
        for (const artifact of result.artifacts) {
          next[`${answerId}:${artifact.partKey}`] = {
            ...artifact,
            submissionAnswerId: answerId,
            sourceType: artifact.sourceType === 'photo' ? 'photo' : 'scratchpad',
          }
        }
        return next
      })
    } catch {
      toast.error('เปิดวิธีทำไม่สำเร็จ กรุณาลองใหม่')
    }
  }, [previewMode])

  const handleArtifactSaved = useCallback((artifact: StudentWorkArtifactView) => {
    setWorkArtifacts(previous => {
      const key = `${artifact.submissionAnswerId}:${artifact.partKey}`
      const oldUrl = previous[key]?.previewUrl
      if (oldUrl?.startsWith('blob:') && oldUrl !== artifact.previewUrl) URL.revokeObjectURL(oldUrl)
      return { ...previous, [key]: artifact }
    })
  }, [])

  const handleArtifactDelete = useCallback(async (artifact: StudentWorkArtifactView) => {
    try {
      if (previewMode) {
        if (artifact.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(artifact.previewUrl)
      } else {
        const { deleteStudentWorkArtifact } = await import('@/lib/actions/math-work')
        const result = await deleteStudentWorkArtifact(artifact.id)
        if (!result || 'error' in result) {
          toast.error(result?.error ?? 'ลบวิธีทำไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
      }
      setWorkArtifacts(previous => {
        const next = { ...previous }
        delete next[`${artifact.submissionAnswerId}:${artifact.partKey}`]
        return next
      })
      toast.success('นำวิธีทำที่แนบออกแล้ว')
      return true
    } catch {
      toast.error('ลบวิธีทำไม่สำเร็จ กรุณาลองใหม่')
      return false
    }
  }, [previewMode])

  const insertCalculatorResult = useCallback((result: string) => {
    if (!calculatorTarget) return
    const answer = answers.find(item => item.id === calculatorTarget.answerId)
    if (!answer) return
    const parts = (answer.questions.answer_parts ?? []) as Array<{ id?: string }>
    if (calculatorTarget.partKey === 'main' || parts.length <= 1) {
      handleAnswerChange(answer.id, result)
    } else {
      const partIndex = parts.findIndex((part, index) => (
        mathInputPartKey(part.id, index, parts.length) === calculatorTarget.partKey
      ))
      if (partIndex < 0) return
      handlePartAnswerChange(
        answer.id,
        partIndex,
        result,
        parts.length,
        localAnswersRef.current[answer.id] ?? '',
      )
    }
    toast.success('ใส่ผลลัพธ์ในคำตอบแล้ว')
  }, [answers, calculatorTarget, handleAnswerChange, handlePartAnswerChange, localAnswersRef])

  const handleWorkImageChange = useCallback(async (answerId: string, partIndex: number, url: string | null) => {
    setWorkImages(prev => {
      const arr = [...(prev[answerId] ?? [])]
      while (arr.length <= partIndex) arr.push(null)
      arr[partIndex] = url
      return { ...prev, [answerId]: arr }
    })
    if (previewMode) return
    try {
      const result = await saveWorkImage(answerId, partIndex, url)
      if (result.error) throw new Error(result.error)
    } catch {
      toast.error('บันทึกรูปวิธีทำไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }, [previewMode])

  const handleFileSubmissionChange = useCallback((answerId: string, files: SubmittedFile[]) => {
    handleAnswerChange(answerId, JSON.stringify(files))
  }, [handleAnswerChange])

  function toggleFlag(answerId: string) {
    setFlagged(prev => {
      const next = new Set(prev)
      next.has(answerId) ? next.delete(answerId) : next.add(answerId)
      return next
    })
  }

  function toggleEliminate(answerId: string, optIndex: number) {
    setEliminated(prev => {
      const set = new Set(prev[answerId] ?? [])
      set.has(optIndex) ? set.delete(optIndex) : set.add(optIndex)
      return { ...prev, [answerId]: set }
    })
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    // Do not grade against stale DB values when the student confirms within
    // the debounce window or while an earlier save is still in flight.
    const synced = await flushQueuedAnswers()
    if (!previewMode && !synced.ok) {
      toast.error(synced.error ?? 'ยังบันทึกคำตอบล่าสุดไม่ครบ กรุณาตรวจอินเทอร์เน็ตแล้วลองส่งอีกครั้ง')
      setSubmitting(false)
      return
    }
    if (previewMode) {
      // Grade locally with the exact same rules a real submission would get
      // (see gradeAnswer) — nothing is written anywhere, so this costs
      // nothing and leaves no trace.
      const { gradeAnswer } = await import('@/lib/assignment-attempt')
      const graded = answers.map(a => gradeAnswer({
        id: a.id,
        correct_answer: a.correct_answer ?? '',
        student_answer: localAnswersRef.current[a.id] ?? null,
        math_input_modes: localMathInputModesRef.current[a.id] ?? {},
        max_score: a.max_score ?? 0,
        questions: {
          question_type: a.questions.question_type,
          answer_tolerance: a.questions.answer_tolerance ?? 0.1,
          answer_parts: a.questions.answer_parts as AnswerPart[] | null,
          extra_data: a.questions.extra_data,
        },
      }))
      const totalScore = graded.reduce((sum, g) => sum + g.score, 0)
      const totalMax = answers.reduce((sum, a) => sum + (a.max_score ?? 0), 0)
      clearSavedAnswers()
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
      setPreviewResult({ graded, totalScore, totalMax })
      setSubmitting(false)
      return
    }
    const result = await submitSubmission(submissionId)
    if (result?.error) {
      toast.error(result.error)
      setSubmitting(false)
      return
    }
    clearSavedAnswers()
    // Working paper is intentionally local-only. Once the attempt is safely
    // submitted, discard every local scene for it instead of retaining stale
    // drawings that the student can no longer use.
    await import('@/lib/scratchpad-storage')
      .then(({ deleteScratchpadsForSubmission }) => (
        deleteScratchpadsForSubmission(storageOwnerId, submissionId)
      ))
      .catch(() => undefined)
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    // The result route redirects in-progress submissions back to the exam.
    // A client-side transition can reuse a stale prefetched result and briefly
    // see the just-submitted attempt as in_progress, which starts a new retry.
    // Reload the document so the summary always reads the committed server state,
    // and replace history so Back cannot reopen the completed attempt.
    window.location.replace(`/submissions/${submissionId}`)
  }

  function findMissingWorkImage(): number | null {
    const artifactSlots = new Set(Object.keys(workArtifacts))
    for (let i = 0; i < answers.length; i++) {
      const required = requiredWorkImageCount(answers[i], config)
      if (required === 0) continue
      const answer = answers[i]
      const imgs = workImages[answer.id] ?? []
      if (!hasCompleteWorkEvidence({
        submissionAnswerId: answer.id,
        partCount: required,
        workImages: imgs,
        artifactSlots,
      })) return i
    }
    return null
  }

  function openSubmitDialog() {
    const missingIndex = findMissingWorkImage()
    if (missingIndex !== null) {
      toast.error(`กรุณาแนบวิธีทำให้ครบก่อนส่งคำตอบ (ข้อ ${missingIndex + 1})`)
      navigateTo(missingIndex)
      return
    }
    setShowCalculator(false)
    setShowScratchpad(false)
    setShowSubmitConfirm(true)
    setSubmitCountdown(3)
  }

  function enterFullscreen() {
    requestFullscreen().catch(() => toast.error('ไม่สามารถเข้าสู่โหมดเต็มจอได้'))
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  function hasAnswered(answerId: string): boolean {
    const raw = localAnswers[answerId] ?? ''
    if (raw.startsWith('[')) {
      // Arrays encode either plain strings (ordering / multi-part numeric —
      // "answered" means at least one non-blank entry) or file-submission
      // objects ({url,name,type} — any entry at all counts as answered).
      try {
        const parsed = JSON.parse(raw) as unknown[]
        return parsed.some(v => typeof v === 'string' ? v.trim() !== '' : v != null)
      } catch { return false }
    }
    return raw.trim() !== ''
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const ss = (s % 60).toString().padStart(2, '0')
    return `${m}:${ss}`
  }

  const answeredCount = answers.filter(a => hasAnswered(a.id)).length
  const flaggedCount  = flagged.size
  const unanswered    = answers.length - answeredCount
  const progress      = Math.round((answeredCount / answers.length) * 100)
  const timerUrgent   = secondsLeft !== null && secondsLeft < 300
  const timerDanger   = secondsLeft !== null && secondsLeft < 60

  // The teacher chooses how many questions share a screen. `currentIndex`
  // stays a question index rather than becoming a page number: the นำทาง grid
  // and the "jump to the ข้อ still missing a รูปวิธีทำ" path both address one
  // question, and deriving the page from it lands either on whichever page
  // holds that question — with no third piece of state to keep in step.
  const perPage = Math.max(1, questionsPerPage)
  const pageStart = Math.floor(currentIndex / perPage) * perPage
  const pageAnswers = answers.slice(pageStart, pageStart + perPage)
  const isLastPage = pageStart + perPage >= answers.length
  const scratchpadAnswer = scratchpadTarget
    ? answers.find(answer => answer.id === scratchpadTarget.answerId)
    : answers[currentIndex]
  const scratchpadPartKey = scratchpadTarget?.localPartKey ?? 'main'
  const scratchpadScope = useMemo(() => scratchpadAnswer ? ({
    ownerId: storageOwnerId,
    submissionId,
    answerId: scratchpadAnswer.id,
    partKey: scratchpadPartKey,
  }) : null, [scratchpadAnswer, scratchpadPartKey, storageOwnerId, submissionId])
  const scratchpadTargetLabel = scratchpadTarget?.label
    ?? (scratchpadAnswer ? `ข้อ ${answers.findIndex(answer => answer.id === scratchpadAnswer.id) + 1}` : 'ข้อปัจจุบัน')
  const scratchpadArtifactPartKey = scratchpadTarget?.artifactPartKey ?? 'answer'
  const scratchpadArtifact = scratchpadAnswer
    ? workArtifacts[`${scratchpadAnswer.id}:${scratchpadArtifactPartKey}`] ?? null
    : null

  // With several questions on a screen, moving the focus is not visible on its
  // own — tapping ข้อ 4 in the นำทาง grid while it is already on the page would
  // look like nothing happened. Bring the focused question into view instead.
  // A single-question page has nowhere to scroll to, so it is left alone.
  useEffect(() => {
    if (perPage === 1) return
    document.getElementById(`exam-q-${currentIndex}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [currentIndex, perPage])

  // ── Preview banner (shared between normal + focus mode) ───────────────────────

  /**
   * In the page's flow rather than fixed to the top of the window: pinned, it
   * sat on top of the app's own header — over the logo and the button that
   * hides the sidebar — and neither could be tapped. It also meant the page
   * below had to reserve the banner's height by hand, in two variants, since
   * the second line only appears once someone has started.
   *
   * `rounded` is off inside โหมดโฟกัส, which is an overlay flush with the
   * window edges and has nothing to round against.
   */
  const previewBanner = (rounded: boolean) => previewMode && (
    <div className={`shrink-0 bg-warning text-amber-950 px-4 py-1.5 flex flex-col items-center gap-0.5 ${rounded ? 'rounded-xl' : ''}`}>
      <div className="flex items-center justify-center gap-3 text-xs font-semibold text-center">
        <span>🔍 โหมดตัวอย่าง — มุมมองนักเรียน (คำตอบจะไม่ถูกบันทึกจริง)</span>
        <a href={previewReturnHref ?? '/assignments'} className="underline hover:no-underline shrink-0">
          ออกจากตัวอย่าง
        </a>
      </div>
      {previewEditWarning && (
        <p className="text-[11px] font-medium text-center leading-4">{previewEditWarning}</p>
      )}
    </div>
  )

  // ── Exam body (shared between normal + focus mode) ────────────────────────────

  const examBody = (
    <div className="flex gap-4 h-full min-h-0">

      {/* LEFT: Question */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto">

        {pageAnswers.map((current, pageOffset) => {
          const questionIndex = pageStart + pageOffset
          const isFlagged = flagged.has(current.id)
          // "written" questions may embed one or more numbered answer inputs
          // directly in the main question text via [คำตอบ N], instead of the
          // generic standalone "คำตอบ" box(es).
          const currentQuestionText = interpolateValues(
            current.questions.question_text,
            current.random_values,
            current.questions.variables,
          )
          const mainInlineBlank = current.questions.question_type === 'written'
            && countAnswerBlanks(currentQuestionText) > 0

          return (
            <div key={current.id} id={`exam-q-${questionIndex}`} className="flex flex-col gap-3 scroll-mt-2">
            {/* Question card */}
            <Card padding="lg" className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {/* "ข้อ 3 / 5" would be a lie in a streak run: answers.length
                    is only what has been handed out so far, and the งาน's
                    length is not known to anybody yet. */}
                <Badge variant="outline" className="font-mono text-xs">
                  {streakOn ? `ข้อที่ ${questionIndex + 1}` : `ข้อ ${questionIndex + 1} / ${answers.length}`}
                </Badge>
                {sectionOwner.get(current.question_id)?.title && (
                  <Badge variant="outline" className="text-xs">{sectionOwner.get(current.question_id)!.title}</Badge>
                )}
                {current.questions.question_type === 'mcq' && (
                  <Badge variant="outline" className="text-xs">ปรนัย</Badge>
                )}
                {isFlagged && (
                  <Badge className="text-xs bg-flag/15 text-flag dark:text-flag border-flag/30">
                    🚩 ปักธงไว้
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {/* Teacher-only, and the reason the preview is worth opening
                      at all: a typo in a โจทย์ is easiest to see in the layout
                      the student gets. Opens in a new tab so the preview — and
                      whatever has been typed into it — is still there to come
                      back to. */}
                  {previewMode && current.canEditQuestion && (
                    <a
                      href={`/questions/${current.question_id}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground transition-all hover:border-primary hover:text-primary"
                    >
                      <Pencil size={11} />
                      แก้ไขโจทย์
                    </a>
                  )}
                  {/* A flag marks a ข้อ to come back to. In a streak run the
                      verdict is already counted and there is no coming back,
                      so the button would only ever mislead. */}
                  {!streakOn && (
                  <button
                    onClick={() => toggleFlag(current.id)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                      isFlagged
                        ? 'bg-flag/15 border-flag/30 text-flag dark:text-flag'
                        : 'border-border text-muted-foreground hover:border-flag hover:text-flag'
                    }`}
                  >
                    <Flag size={11} className={isFlagged ? 'fill-flag' : ''} />
                    {isFlagged ? 'ยกเลิกธง' : 'ปักธง'}
                  </button>
                  )}
                </div>
              </div>

              {current.questions.question_type !== 'fill_blank' && !mainInlineBlank && (
                <QuestionText text={currentQuestionText} />
              )}

              {(current.questions.image_urls ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(current.questions.image_urls ?? []).map(url => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="รูปประกอบ" className="max-h-52 rounded-xl border object-contain" />
                  ))}
                </div>
              )}

              {current.questions.question_type === 'file_upload' && (
                ((current.questions.extra_data as FileUploadConfig | null)?.attachment_urls ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {((current.questions.extra_data as FileUploadConfig).attachment_urls ?? []).map(url => (
                      /\.pdf(\?|$)/i.test(url) ? (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border bg-muted/40 hover:bg-muted transition-colors">
                          📄 <span className="truncate max-w-[140px]">{decodeURIComponent(url.split('/').pop() ?? 'PDF')}</span>
                        </a>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt="ไฟล์อ้างอิงโจทย์" className="max-h-52 rounded-xl border object-contain" />
                      )
                    ))}
                  </div>
                )
              )}

              {/* No "ค่าที่กำหนด" readout while sitting the exam. Every {name} in the
                  question text is already replaced with the value this student drew,
                  so the panel restated the same numbers underneath the question.
                  Note this leaves a variable that the question text never mentions
                  with nowhere to appear — write such a value into the text itself.
                  The submission review still lists them, where a teacher marking an
                  attempt has to see what that student was given. */}
            </Card>

            {/* Answer inputs */}
            <Card padding="lg">
              {current.questions.question_type === 'matching' && current.questions.mcq_options ? (
                <MatchingAnswerInput
                  prompts={current.questions.mcq_options}
                  options={current.questions.matching_options ?? []}
                  mode={(current.questions.extra_data as SafeMatchingConfig | null)?.answer_mode}
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={val => handleAnswerChange(current.id, val)}
                />
              ) : current.questions.question_type === 'mcq' && current.questions.mcq_options ? (
                <MCQInput
                  answerId={current.id}
                  options={current.questions.mcq_options as Array<{ text: string; image_url?: string; index: number }>}
                  selected={localAnswers[current.id] ?? ''}
                  eliminatedSet={eliminated[current.id] ?? new Set()}
                  onSelect={val => handleAnswerChange(current.id, val)}
                  onToggleEliminate={i => toggleEliminate(current.id, i)}
                />
              ) : current.questions.question_type === 'true_false' ? (
                <TrueFalseAnswerInput
                  answerId={current.id}
                  config={current.questions.extra_data as TrueFalseConfig | SafeTrueFalseConfig}
                  questionText={currentQuestionText}
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={val => handleAnswerChange(current.id, val)}
                />
              ) : current.questions.question_type === 'fill_blank' ? (
                <FillBlankAnswerInput
                  questionText={current.questions.question_text}
                  config={current.questions.extra_data as FillBlankConfig | SafeFillBlankConfig}
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={val => handleAnswerChange(current.id, val)}
                />
              ) : current.questions.question_type === 'ordering' ? (
                <OrderingAnswerInput
                  answerId={current.id}
                  config={current.questions.extra_data as OrderingConfig | SafeOrderingConfig}
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={val => handleAnswerChange(current.id, val)}
                />
              ) : current.questions.question_type === 'file_upload' ? (
                <FileUploadAnswerInput
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={files => handleFileSubmissionChange(current.id, files)}
                  localOnly={previewMode}
                />
              ) : current.questions.question_type === 'classify' ? (
                <ClassifyAnswerInput
                  config={current.questions.extra_data as ClassifyConfig | SafeClassifyConfig}
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={val => handleAnswerChange(current.id, val)}
                />
              ) : current.questions.question_type === 'composite' ? (
                <CompositeAnswerInput
                  config={current.questions.extra_data as CompositeConfig | SafeCompositeConfig}
                  rawValue={localAnswers[current.id] ?? ''}
                  onChange={val => handleAnswerChange(current.id, val)}
                />
              ) : (
                <MultiPartAnswerInput
                  answerId={current.id}
                  parts={current.questions.answer_parts}
                  questionText={currentQuestionText}
                  labels={partLabels((current.questions.extra_data as RandomQuestionConfig | SafeRandomQuestionConfig | null)?.part_label_style)}
                  fallbackUnit={current.questions.answer_unit}
                  rawValue={localAnswers[current.id] ?? ''}
                  onSingleChange={val => handleAnswerChange(current.id, val)}
                  onPartChange={(pi, val, total) =>
                    handlePartAnswerChange(current.id, pi, val, total, localAnswers[current.id] ?? '')}
                  mathInputModes={localMathInputModes[current.id] ?? {}}
                  activeMathField={activeMathField}
                  onActivateMathField={handleMathFieldActivate}
                  onDeactivateMathField={() => setActiveMathField(null)}
                  onMathInputModeChange={(partKey, mode) =>
                    handleMathInputModeChange(current.id, partKey, mode)}
                  requiresWorkImage={requiredWorkImageCount(current, config) > 0}
                  workImages={workImages[current.id] ?? []}
                  onWorkImageChange={(pi, url) => handleWorkImageChange(current.id, pi, url)}
                  scratchpadEnabled={config.scratchpadEnabled}
                  workArtifacts={workArtifacts}
                  onOpenScratchpad={openScratchpadForPart}
                  onArtifactDelete={handleArtifactDelete}
                  onArtifactRefresh={refreshWorkArtifacts}
                  localOnly={previewMode}
                />
              )}
            </Card>

            {/* ตรวจคำตอบข้อนี้ — แบบฝึกหัดเท่านั้น */}
            {instantCheckOn && isInstantCheckable(current.questions.question_type) && (
              <InstantCheckPanel
                feedback={checked[current.id] ?? null}
                busy={checkingId === current.id}
                disabled={checkingId !== null && checkingId !== current.id}
                answered={hasAnswered(current.id)}
                onCheck={() => handleCheck(current.id)}
                onRetry={() => clearCheck(current.id)}
                allowRetry={!streakOn}
                checkHint={streakOn
                  ? 'ตรวจได้ครั้งเดียว ผลนับเข้าจำนวนข้อที่ถูกติดต่อกันทันที'
                  : undefined}
              />
            )}

            </div>
          )
        })}

        {streakOn && streakState && !streakEnd && (
          <Card padding="md" className="mb-3">
            <StreakMeter
              streak={streakState}
              lastVerdict={(() => {
                // The verdict of the ข้อ on screen, so a miss colours the
                // meter at the moment it resets rather than silently.
                const current = answers[answers.length - 1]
                const fb = current ? checked[current.id] : null
                if (!fb) return null
                return fb.verdict === 'correct' ? 'correct' : fb.verdict === 'pending' ? 'pending' : 'wrong'
              })()}
            />
          </Card>
        )}

        {/* A streak run replaces paging entirely: there is no previous ข้อ to
            go back to (the verdict is already counted), no page after this
            one until the server hands it over, and no bulk ส่งคำตอบ — the
            attempt ends when the run does. */}
        {streakOn && streakState && (
          streakEnd ? (
            <div className="pb-2">
              <StreakEndScreen
                ending={streakEnd}
                streak={streakState}
                submitting={submitting}
                onFinish={() => handleSubmit()}
                onKeepPracticing={
                  streakEnd === 'reached' ? () => handleDrawNext(true) : undefined
                }
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 pb-2">
              <Button
                variant="outline"
                onClick={() => handleSubmit()}
                disabled={submitting || drawingNext}
              >
                ออกไว้ก่อน
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleDrawNext(streakState.reached)}
                disabled={
                  drawingNext
                  || checkingId !== null
                  // The verdict for the ข้อ on screen. Checking a *previous*
                  // ข้อ must not unlock the next draw.
                  || !(answers[answers.length - 1] && checked[answers[answers.length - 1].id])
                }
              >
                {drawingNext ? 'กำลังดึงโจทย์...' : 'ข้อต่อไป →'}
              </Button>
            </div>
          )
        )}

        {/* Prev / Next — a page at a time, which is one question at a time
            on the default setting */}
        {!streakOn && (
        <div className="flex items-center gap-3 pb-2">
          <Button
            variant="outline" className="flex-1"
            onClick={() => navigateTo(Math.max(0, pageStart - perPage))}
            disabled={pageStart === 0}
          >
            ← ก่อนหน้า
          </Button>
          {!isLastPage ? (
            <Button className="flex-1" onClick={() => navigateTo(pageStart + perPage)}>
              ถัดไป →
            </Button>
          ) : (
            <Button
              className="flex-1 bg-success hover:bg-success/90 text-success-foreground border-0"
              onClick={openSubmitDialog}
            >
              ส่งคำตอบ ✓
            </Button>
          )}
        </div>
        )}
      </div>

      {/* RIGHT: Nav panel */}
      <div className={`shrink-0 flex flex-col gap-3 ${focusMode ? 'w-60' : 'hidden md:flex w-56'}`}>

        {/* Timer */}
        {secondsLeft !== null && (
          <div className={`rounded-2xl border p-4 text-center transition-colors ${
            timerDanger
              ? 'border-destructive bg-destructive/10 animate-pulse'
              : timerUrgent
              ? 'border-flag bg-flag/8'
              : 'bg-card'
          }`}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">เวลาที่เหลือ</p>
            <p className={`text-3xl font-black font-mono ${
              timerDanger ? 'text-destructive' :
              timerUrgent ? 'text-flag dark:text-flag' : 'text-foreground'
            }`}>
              {formatTime(secondsLeft)}
            </p>
            {timerUrgent && (
              <p className="text-[10px] text-flag mt-1 flex items-center justify-center gap-1">
                <AlertTriangle size={9} /> เหลือน้อยแล้ว
              </p>
            )}
          </div>
        )}

        {/* Progress — replaced by the streak meter under the ข้อ in a streak
            run, where "3/12" would be a share of a total the งาน has not
            settled on. */}
        {!streakOn && (
        <Card padding="md" className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>คืบหน้า</span>
            <span className="font-semibold text-foreground">{answeredCount}/{answers.length}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-2 text-[10px] text-muted-foreground pt-0.5">
            {flaggedCount > 0 && (
              <span className="flex items-center gap-0.5 text-flag">
                <Flag size={9} className="fill-flag" /> {flaggedCount}
              </span>
            )}
            {saving && <span className="ml-auto animate-pulse">กำลังบันทึก...</span>}
            {!isOnline && (
              <span className="flex items-center gap-0.5 text-warning ml-auto">
                <WifiOff size={9} /> ออฟไลน์
              </span>
            )}
          </div>
        </Card>
        )}

        {/* Nav grid — a streak run has nowhere to jump to: every earlier ข้อ
            is closed and the next one is not drawn until this one is judged. */}
        {!streakOn && (
        <Card padding="md" className="flex-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">นำทางข้อ</p>
          {(() => {
            let numbered = 0
            return sectionRuns.map((run, runIndex) => {
              const startIndex = numbered
              numbered += run.question_ids.length
              return (
                <div key={runIndex} className={runIndex > 0 ? 'mt-3' : undefined}>
                  {run.title && (
                    <p className="text-[10px] font-semibold text-muted-foreground truncate mb-1.5">{run.title}</p>
                  )}
                  <div className="grid grid-cols-5 gap-1.5">
                    {run.question_ids.map((_, offset) => {
                      const i = startIndex + offset
                      const a = answers[i]
                      const isCur = i >= pageStart && i < pageStart + perPage
                      const isAns = hasAnswered(a.id)
                      const isFlg = flagged.has(a.id)
                      // On a แบบฝึกหัด a ข้อ that has been checked says so here
                      // too — the point of checking one ข้อ at a time is being
                      // able to see, at a glance, what is left to fix.
                      const verdict = checked[a.id]?.verdict
                      let cls = 'bg-muted text-muted-foreground'
                      if (isCur)      cls = 'bg-primary text-white shadow-md shadow-primary/40 scale-110 z-10'
                      else if (isFlg) cls = 'bg-flag text-white'
                      else if (verdict === 'correct') cls = 'bg-success text-success-foreground'
                      else if (verdict === 'wrong' || verdict === 'partial') cls = 'bg-destructive/15 text-destructive border border-destructive/30'
                      else if (isAns) cls = 'bg-success/10 text-success border border-success/20 dark:bg-success/15'
                      return (
                        <button
                          key={i}
                          onClick={() => navigateTo(i)}
                          className={`w-8 h-8 rounded-lg text-[11px] font-bold transition-all hover:scale-105 ${cls}`}
                        >
                          {i + 1}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
          <div className="mt-3 border-t pt-3 space-y-1.5">
            {[
              { cls: 'bg-primary', label: 'ข้อปัจจุบัน' },
              { cls: 'bg-success/10 border border-success/20 dark:bg-success/15', label: 'ตอบแล้ว' },
              ...(instantCheckOn ? [
                { cls: 'bg-success', label: 'ตรวจแล้ว ถูก' },
                { cls: 'bg-destructive/15 border border-destructive/30', label: 'ตรวจแล้ว ยังไม่ถูก' },
              ] : []),
              { cls: 'bg-flag', label: 'ปักธง' },
              { cls: 'bg-muted', label: 'ยังไม่ตอบ' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-sm shrink-0 ${l.cls}`} />
                <span className="text-[10px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </Card>
        )}

        {/* Anti-cheat counter */}
        {tabSwitchCount > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 flex items-center gap-2">
            <ShieldAlert size={14} className="text-destructive shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-destructive">สลับแท็บ {tabSwitchCount} ครั้ง</p>
              <p className="text-[9px] text-muted-foreground">ระบบบันทึกไว้แล้ว</p>
            </div>
          </div>
        )}

        {/* A streak run has no bulk ส่งคำตอบ: the attempt ends when the run
            does, and its controls live under the ข้อ itself. */}
        {!streakOn && (
          <Button
            onClick={openSubmitDialog}
            disabled={submitting}
            className="w-full bg-success hover:bg-success/90 text-success-foreground border-0"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งคำตอบ ✓'}
          </Button>
        )}
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {config.watermarkText && <ExamWatermark text={config.watermarkText} />}

      {/* ── Fullscreen warning overlay ─────────────────────────────────────── */}
      {config.isFullscreenEnforced && showFullscreenWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay backdrop-blur-sm px-4">
          <Card padding="2xl" elevation="xl" className="text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-5">
              <ShieldAlert size={40} className="text-destructive" />
            </div>
            <h2 className="text-2xl font-black text-foreground mb-2">ออกจากโหมดเต็มจอ</h2>
            <p className="text-muted-foreground text-sm mb-6">
              ระบบตรวจจับว่าคุณออกจากโหมดเต็มจอ<br />
              กรุณากลับสู่โหมดเต็มจอเพื่อทำข้อสอบต่อ
            </p>
            <Button
              onClick={enterFullscreen}
              variant="destructive"
              size="lg"
              className="mx-auto"
            >
              <Maximize size={18} />
              กลับสู่โหมดเต็มจอ
            </Button>
            <p className="text-muted-foreground text-xs mt-4">
              {config.proctoringEnabled ? 'เหตุการณ์นี้จะแสดงในห้องคุมสอบของครู' : 'กรุณากลับเข้าเต็มจอเพื่อทำต่อ'}
            </p>
          </Card>
        </div>
      )}

      {/* ── Tab switch warning toast ───────────────────────────────────────── */}
      {proctorActiveConnectionCount > 1 && (
        <div className="fixed left-1/2 top-4 z-[90] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground shadow-2xl">
          <MonitorSmartphone className="size-4 shrink-0" aria-hidden="true" />
          ตรวจพบหน้าสอบนี้เปิดพร้อมกัน {proctorActiveConnectionCount} จุด — กรุณาปิดหน้าที่ซ้ำ ครูได้รับแจ้งแล้ว
        </div>
      )}

      {showTabWarning && (
        <div className={`fixed left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground shadow-2xl ${
          proctorActiveConnectionCount > 1 ? 'top-20' : 'top-4'
        }`}>
          <ShieldAlert size={16} />
          ตรวจพบการสลับแท็บ — ครั้งที่ {tabSwitchCount}
        </div>
      )}

      {/* ── Preview results (previewMode only, after submit) ─────────────────── */}
      {previewResult && (
        <PreviewResultSummary
          answers={answers}
          graded={previewResult.graded}
          totalScore={previewResult.totalScore}
          totalMax={previewResult.totalMax}
          returnHref={previewReturnHref ?? '/assignments'}
        />
      )}

      {/* ── Normal mode ────────────────────────────────────────────────────── */}
      {!focusMode && !previewResult && (
        <div className="flex flex-col gap-3">
          {previewBanner(true)}
          {/* Toolbar */}
          <ExamToolbar
            saving={saving}
            isOnline={isOnline}
            pendingSync={pendingCount}
            tabSwitchCount={tabSwitchCount}
            config={config}
            proctorStatus={proctorStatus}
            proctorActiveConnectionCount={proctorActiveConnectionCount}
            calculatorOpen={showCalculator}
            onToggleCalculator={toggleCalculator}
            scratchpadOpen={showScratchpad}
            onToggleScratchpad={toggleScratchpad}
            onFocusMode={() => setFocusMode(true)}
          />
          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex-1">{examBody}</div>
        </div>
      )}

      {/* ── Focus mode: full-screen overlay ────────────────────────────────── */}
      {focusMode && !previewResult && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
          {previewBanner(false)}
          {/* Focus header */}
          <div className="shrink-0 border-b bg-card">
            <div className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">
                  โหมดโฟกัส
                </span>
                <span className="h-3 w-px bg-border shrink-0" />
                <p className="text-sm font-medium truncate">
                  {perPage === 1
                    ? (pageAnswers[0]?.questions.title || 'ชุดข้อสอบ')
                    : `ข้อ ${pageStart + 1}–${pageStart + pageAnswers.length} จาก ${answers.length}`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {config.scratchpadEnabled && (
                  <Button
                    type="button"
                    variant={showScratchpad ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={toggleScratchpad}
                    aria-pressed={showScratchpad}
                  >
                    <NotebookPen /> กระดาษทด
                  </Button>
                )}
                {config.calculatorEnabled && (
                  <Button
                    type="button"
                    variant={showCalculator ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={toggleCalculator}
                    aria-pressed={showCalculator}
                  >
                    <CalculatorIcon /> เครื่องคิดเลข
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setFocusMode(false)}>
                  <Minimize2 /> ออก
                </Button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-6 max-w-6xl mx-auto w-full">
            {examBody}
          </div>
        </div>
      )}

      {calculatorLoaded && !previewResult && (
        <Suspense fallback={showCalculator ? (
          <Card elevation="xl" className="fixed bottom-3 right-3 z-[80] px-4 py-3 text-sm text-muted-foreground">
            กำลังเปิดเครื่องคิดเลข...
          </Card>
        ) : null}>
          <ScientificCalculator
            open={showCalculator}
            mode={calculatorMode}
            targetLabel={calculatorTarget?.label ?? null}
            onModeChange={handleCalculatorModeChange}
            onInsertResult={insertCalculatorResult}
            onClose={() => setShowCalculator(false)}
          />
        </Suspense>
      )}

      {scratchpadLoaded && scratchpadScope && !previewResult && (
        <Suspense fallback={showScratchpad ? (
          <Card elevation="xl" className="fixed inset-x-2 bottom-2 z-[75] px-4 py-3 text-sm text-muted-foreground md:inset-x-auto md:right-4">
            กำลังเปิดกระดาษทด...
          </Card>
        ) : null}>
          <Scratchpad
            key={JSON.stringify(scratchpadScope)}
            open={showScratchpad}
            scope={scratchpadScope}
            targetLabel={scratchpadTargetLabel}
            persistenceEnabled={!previewMode}
            artifactPartKey={scratchpadArtifactPartKey}
            artifact={scratchpadArtifact}
            loadAttachedNonce={loadAttachedNonce}
            previewMode={previewMode}
            onAttachmentSaved={handleArtifactSaved}
            onClose={() => setShowScratchpad(false)}
          />
        </Suspense>
      )}

      {/* ── Submit confirmation dialog ──────────────────────────────────────── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay backdrop-blur-sm">
          <Card padding="xl" elevation="xl" className="max-w-sm w-full mx-4">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={28} className="text-success" />
              </div>
              <h3 className="font-bold text-lg">ยืนยันการส่งข้อสอบ</h3>

              <div className="mt-4 space-y-2 text-sm text-left bg-muted/40 rounded-xl p-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ตอบแล้ว</span>
                  <span className="font-semibold text-success">{answeredCount} / {answers.length} ข้อ</span>
                </div>
                {unanswered > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ยังไม่ตอบ</span>
                    <span className="font-semibold text-warning">{unanswered} ข้อ</span>
                  </div>
                )}
                {flaggedCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ปักธงไว้</span>
                    <span className="font-semibold text-flag">{flaggedCount} ข้อ</span>
                  </div>
                )}
                {tabSwitchCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ShieldAlert size={12} /> สลับแท็บ
                    </span>
                    <span className="font-semibold text-destructive">{tabSwitchCount} ครั้ง</span>
                  </div>
                )}
              </div>

              {(unanswered > 0 || flaggedCount > 0) && (
                <p className="text-xs text-warning mt-3 flex items-center justify-center gap-1">
                  <AlertTriangle size={12} />
                  มีข้อที่ยังไม่ตอบหรือปักธงไว้ — ตรวจสอบอีกครั้งก่อนส่ง
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline" className="flex-1"
                onClick={() => setShowSubmitConfirm(false)}
              >
                กลับไปตรวจ
              </Button>
              <Button
                className="flex-1 bg-success hover:bg-success/90 text-success-foreground border-0 transition-all"
                onClick={() => { setShowSubmitConfirm(false); handleSubmit() }}
                disabled={submitting || submitCountdown > 0}
              >
                {submitCountdown > 0
                  ? `รอ ${submitCountdown} วินาที...`
                  : submitting
                  ? 'กำลังส่ง...'
                  : 'ยืนยันส่งเลย'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

// ─── ตรวจทีละข้อ (แบบฝึกหัด) ───────────────────────────────────────────────────

/**
 * The ปุ่มตรวจ under one ข้อ, and the verdict once it has been pressed.
 *
 * Everything it shows is decided elsewhere: `feedback` arrives finished from
 * the server (or, in a teacher's preview, from the same builder run locally),
 * so this only picks colours and lays the rows out. In particular it cannot
 * tell whether the เฉลย was withheld — a row simply has no `correct` to draw.
 *
 * The ข้อ is never locked after checking. ทำใหม่ clears the panel, and so does
 * touching the answer itself, which keeps what is on screen honest without
 * threading a `disabled` prop through nine different answer inputs.
 */
function InstantCheckPanel({
  feedback, busy, disabled, answered, onCheck, onRetry, allowRetry = true, checkHint,
}: {
  feedback: (AnswerFeedback & { checkCount: number }) | null
  busy: boolean
  disabled: boolean
  answered: boolean
  onCheck: () => void
  onRetry: () => void
  /** False in a "ถูกติดต่อกัน" งาน: the verdict counted, and the server refuses
   *  a second check on the same ข้อ. Offering ทำใหม่ there would be a button
   *  whose only outcome is an error. */
  allowRetry?: boolean
  /** Replaces the "แก้แล้วตรวจใหม่ได้ไม่จำกัด" line, which is untrue in a streak. */
  checkHint?: string
}) {
  if (!feedback) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={onCheck}
          disabled={busy || disabled || !answered}
          className="bg-success hover:bg-success/90 text-success-foreground border-0"
        >
          <CircleCheck size={16} />
          {busy ? 'กำลังตรวจ...' : 'ตรวจคำตอบข้อนี้'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {answered
            ? (checkHint ?? 'รู้ผลทันที แก้แล้วตรวจใหม่ได้ไม่จำกัด คะแนนคิดจากคำตอบสุดท้ายตอนส่งงาน')
            : 'ตอบข้อนี้ก่อนจึงจะตรวจได้'}
        </p>
      </div>
    )
  }

  const tone = feedback.verdict === 'correct'
    ? { border: 'border-success/30', bg: 'bg-success/10', text: 'text-success', label: 'ถูกต้อง' }
    : feedback.verdict === 'partial'
      ? { border: 'border-warning/30', bg: 'bg-warning/10', text: 'text-warning', label: 'ถูกบางส่วน' }
      : feedback.verdict === 'pending'
        ? { border: 'border-warning/30', bg: 'bg-warning/10', text: 'text-warning', label: 'รอครูตรวจ' }
        : { border: 'border-destructive/30', bg: 'bg-destructive/10', text: 'text-destructive', label: 'ยังไม่ถูก' }

  return (
    <Card padding="lg" className={`space-y-3 border ${tone.border} ${tone.bg}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`flex items-center gap-1.5 font-bold text-sm ${tone.text}`}>
          {feedback.verdict === 'correct'
            ? <CheckCircle2 size={18} />
            : feedback.verdict === 'pending'
              ? <Clock size={18} />
              : <XCircle size={18} />}
          {tone.label}
        </span>
        {feedback.verdict !== 'pending' && (
          <Badge variant="outline" className="text-xs">
            {feedback.score}/{feedback.maxScore} คะแนน
          </Badge>
        )}
        {feedback.checkCount > 1 && (
          <span className="text-[11px] text-muted-foreground">ตรวจไปแล้ว {feedback.checkCount} ครั้ง</span>
        )}
        {allowRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="ml-auto">
            <RotateCcw size={14} />
            ทำใหม่
          </Button>
        )}
      </div>

      {feedback.note && (
        <p className="text-xs text-warning">{feedback.note}</p>
      )}

      {feedback.choices && (
        <div className="space-y-1.5">
          {feedback.choices.map(choice => (
            <div
              key={choice.label}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border-2 ${
                choice.correct
                  ? 'border-success bg-success/10'
                  : choice.picked
                    ? 'border-destructive bg-destructive/10'
                    : 'border-border bg-background'
              }`}
            >
              <span className={`text-sm font-bold shrink-0 w-5 ${
                choice.correct ? 'text-success' : choice.picked ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {choice.label}
              </span>
              {choice.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={choice.imageUrl} alt="" loading="lazy" decoding="async" className="max-h-20 w-auto object-contain rounded border shrink-0" />
              )}
              <span className="text-sm flex-1 min-w-0">{choice.text}</span>
              {choice.correct && (
                <span className="text-xs font-semibold text-success shrink-0 flex items-center gap-1">
                  <CheckCircle2 size={13} /> เฉลย
                </span>
              )}
              {choice.picked && !choice.correct && (
                <span className="text-xs font-semibold text-destructive shrink-0">คำตอบคุณ</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!feedback.choices && feedback.rows.length > 0 && (
        <div className="space-y-2 text-sm">
          {feedback.rows.map((row, i) => (
            <div key={i} className="pl-3 border-l-2 border-border space-y-0.5">
              {row.label && <p className="text-xs font-semibold text-muted-foreground">{row.label}</p>}
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">คำตอบคุณ:</span>
                <span className={`font-medium ${
                  row.status === 'pending' ? 'text-warning'
                    : row.status === 'correct' ? 'text-success' : 'text-destructive'
                }`}>
                  {row.student} {row.unit && <UnitDisplay html={row.unit} />}
                </span>
              </div>
              {row.correct !== undefined && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                  <span className="font-medium">
                    {row.correct} {row.unit && <UnitDisplay html={row.unit} />}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(feedback.solutionText || (feedback.solutionImageUrls ?? []).length > 0) && (
        <Card radius="md" padding="sm" className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Lightbulb size={13} /> วิธีทำ
          </p>
          {feedback.solutionText && (
            <RichText text={feedback.solutionText} className="text-sm leading-relaxed block" />
          )}
          {(feedback.solutionImageUrls ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(feedback.solutionImageUrls ?? []).map(url => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="เฉลยวิธีทำ" loading="lazy" decoding="async" className="max-h-44 rounded-lg border object-contain" />
              ))}
            </div>
          )}
        </Card>
      )}

      {!feedback.revealed && feedback.verdict !== 'correct' && (
        <p className="text-xs text-muted-foreground">
          งานนี้ครูตั้งให้ไม่แสดงเฉลย ลองคิดใหม่แล้วกดตรวจอีกครั้งได้
        </p>
      )}
    </Card>
  )
}

// ─── Preview results (teacher preview only) ────────────────────────────────────

function PreviewResultSummary({
  answers, graded, totalScore, totalMax, returnHref,
}: {
  answers: AnswerRow[]
  graded: GradedAnswer[]
  totalScore: number
  totalMax: number
  returnHref: string
}) {
  const gradedById = new Map(graded.map(g => [g.id, g]))
  const correctCount = graded.filter(g => g.is_correct === true).length
  const wrongCount = graded.filter(g => g.is_correct === false).length
  const pendingCount = graded.filter(g => g.is_correct === null).length
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-4">
      <Card padding="2xl" className="text-center">
        <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-black mb-4 ${
          pct >= 75 ? 'bg-success/10 text-success'
          : pct >= 50 ? 'bg-warning/10 text-warning'
          : 'bg-destructive/10 text-destructive'
        }`}>
          {pct}%
        </div>
        <p className="text-4xl font-black">{totalScore}/{totalMax}</p>
        <p className="text-muted-foreground mt-1 text-sm">คะแนนที่จะได้ (ตัวอย่าง — ไม่บันทึกจริง)</p>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 text-success">
            <CheckCircle2 size={13} /> ถูก {correctCount} ข้อ
          </span>
          <span className="flex items-center gap-1 text-destructive">
            <XCircle size={13} /> ผิด {wrongCount} ข้อ
          </span>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <Clock size={13} /> ต้องตรวจเอง {pendingCount} ข้อ
            </span>
          )}
        </div>
        <a
          href={returnHref}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 transition-colors"
        >
          กลับไปหน้าชุดข้อสอบ
        </a>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">ตรวจเฉลยทีละข้อ</h2>
        {answers.map((a, i) => {
          const g = gradedById.get(a.id)
          const isCorrect = g?.is_correct ?? null
          return (
            <div
              key={a.id}
              className={`bg-card border-l-4 rounded-xl p-4 flex items-start gap-3 ${
                isCorrect === null ? 'border-l-amber-400'
                : isCorrect ? 'border-l-green-500'
                : 'border-l-red-400'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                isCorrect === null ? 'bg-warning/10 text-warning'
                : isCorrect ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
              }`}>
                {isCorrect === null ? '⏳' : isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">ข้อ {i + 1}{a.questions.title ? ` — ${a.questions.title}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isCorrect === null ? 'ต้องให้ครูตรวจเอง' : `${g?.score ?? 0}/${a.max_score ?? 0} คะแนน`}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function ExamToolbar({
  saving, isOnline, pendingSync, tabSwitchCount,
  proctorStatus,
  proctorActiveConnectionCount,
  config, calculatorOpen, onToggleCalculator, scratchpadOpen, onToggleScratchpad, onFocusMode,
}: {
  saving: boolean
  isOnline: boolean
  pendingSync: number
  tabSwitchCount: number
  proctorStatus: 'disabled' | 'connecting' | 'connected' | 'offline'
  proctorActiveConnectionCount: number
  config: ExamConfig
  calculatorOpen: boolean
  onToggleCalculator: () => void
  scratchpadOpen: boolean
  onToggleScratchpad: () => void
  onFocusMode: () => void
}) {
  return (
    <Card className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
      {/* Status indicators */}
      <div className="flex items-center gap-2 text-xs">
        {saving ? (
          <span className="text-muted-foreground animate-pulse">บันทึก...</span>
        ) : pendingSync > 0 ? (
          <span className="text-warning flex items-center gap-1">
            <WifiOff size={11} /> รอซิงก์ {pendingSync}
          </span>
        ) : isOnline ? (
          <span className="text-success flex items-center gap-1">
            <Wifi size={11} /> บันทึกอัตโนมัติ
          </span>
        ) : (
          <span className="text-warning flex items-center gap-1">
            <WifiOff size={11} /> ออฟไลน์
          </span>
        )}
        {tabSwitchCount > 0 && (
          <span className="text-destructive flex items-center gap-1">
            <ShieldAlert size={11} /> สลับแท็บ {tabSwitchCount}×
          </span>
        )}
        {config.proctoringEnabled && (
          <span className={`flex items-center gap-1 ${
            proctorStatus === 'connected' ? 'text-success' : 'text-warning'
          }`}>
            <ShieldAlert size={11} />
            {proctorStatus === 'connected'
              ? 'เชื่อมห้องคุมสอบแล้ว'
              : proctorStatus === 'offline'
                ? 'ห้องคุมสอบรอเชื่อมต่อ'
                : 'กำลังเชื่อมห้องคุมสอบ'}
          </span>
        )}
        {proctorActiveConnectionCount > 1 && (
          <span className="flex items-center gap-1 text-destructive">
            <MonitorSmartphone size={11} /> เปิดพร้อมกัน {proctorActiveConnectionCount} จุด
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {config.scratchpadEnabled && (
          <Button
            type="button"
            variant={scratchpadOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleScratchpad}
            aria-label="กระดาษทด"
            aria-pressed={scratchpadOpen}
          >
            <NotebookPen />
            <span className="hidden sm:inline">กระดาษทด</span>
          </Button>
        )}
        {config.calculatorEnabled && (
          <Button
            type="button"
            variant={calculatorOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleCalculator}
            aria-label="เครื่องคิดเลข"
            aria-pressed={calculatorOpen}
          >
            <CalculatorIcon />
            <span className="hidden sm:inline">เครื่องคิดเลข</span>
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onFocusMode} aria-label="โฟกัส">
          <Maximize2 />
          <span className="hidden sm:inline">โฟกัส</span>
        </Button>
      </div>
    </Card>
  )
}

// ─── MCQ Input ────────────────────────────────────────────────────────────────

// The answer is stored as MCQ:<position in the question's own option list>,
// not as the option's text — two options can read the same, or be pictures
// with no text at all. See the MCQ: branch in lib/assignment-attempt.ts.
function mcqValue(option: { index?: number }, fallbackIndex: number) {
  return `MCQ:${option.index ?? fallbackIndex}`
}

function MCQInput({
  answerId, options, selected, eliminatedSet, onSelect, onToggleEliminate,
}: {
  answerId: string
  options: Array<{ text: string; image_url?: string; index?: number }>
  selected: string
  eliminatedSet: Set<number>
  onSelect: (val: string) => void
  onToggleEliminate: (i: number) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">เลือกคำตอบ</p>
      {options.map((opt, i) => {
        const value = mcqValue(opt, i)
        const isSelected  = selected === value
        const isEliminated = eliminatedSet.has(i)
        return (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-xl border-2 transition-all ${
              isEliminated
                ? 'opacity-35 border-dashed border-border'
                : isSelected
                ? 'border-primary bg-primary/8 dark:bg-primary/10'
                : 'border-border hover:border-primary/20 dark:hover:border-primary'
            }`}
          >
            <label className="flex items-center gap-3 p-3 cursor-pointer flex-1 min-w-0">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
              }`}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-card" />}
              </div>
              <span className="font-bold text-sm text-muted-foreground shrink-0 w-5">{CHOICE_LABELS[i]}</span>
              <div className={`flex-1 min-w-0 flex items-center gap-2 ${isEliminated ? 'line-through text-muted-foreground' : ''}`}>
                {opt.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={opt.image_url} alt="" loading="lazy" decoding="async" className="max-h-28 w-auto object-contain rounded border shrink-0" />
                )}
                {/* A picture-only option carries the choice letter as its text
                    (the answer's identity is opt.text, so it can't be blank) —
                    printing it here would just repeat the label beside it. */}
                {opt.text !== CHOICE_LABELS[i] && <span className="text-sm min-w-0">{opt.text}</span>}
              </div>
              <input
                type="radio"
                className="sr-only"
                name={`answer-${answerId}`}
                value={value}
                checked={isSelected}
                onChange={() => !isEliminated && onSelect(value)}
              />
            </label>
            <button
              onClick={() => onToggleEliminate(i)}
              className={`p-2 mr-2 rounded-lg transition-all shrink-0 ${
                isEliminated ? 'text-destructive bg-destructive/10' : 'text-muted-foreground hover:text-destructive/80 hover:bg-muted'
              }`}
              title={isEliminated ? 'เรียกคืนตัวเลือก' : 'ตัดทิ้ง'}
            >
              {isEliminated ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
        )
      })}
      {eliminatedSet.size > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
          <EyeOff size={10} /> ตัดทิ้ง {eliminatedSet.size} ตัวเลือก · กด 👁 เพื่อเรียกคืน
        </p>
      )}
    </div>
  )
}

// ─── Multi-part numeric ───────────────────────────────────────────────────────

function WorkProofSlot({
  answerId,
  partIndex,
  partCount,
  label,
  required,
  scratchpadEnabled,
  workImage,
  artifact,
  localOnly,
  onPhotoChange,
  onOpenScratchpad,
  onArtifactDelete,
  onArtifactRefresh,
}: {
  answerId: string
  partIndex: number
  partCount: number
  label: string
  required: boolean
  scratchpadEnabled: boolean
  workImage: string | null
  artifact: StudentWorkArtifactView | null
  localOnly?: boolean
  onPhotoChange: (url: string | null) => void
  onOpenScratchpad: (answerId: string, partIndex: number, label: string, loadAttached?: boolean) => void
  onArtifactDelete: (artifact: StudentWorkArtifactView) => Promise<boolean | void>
  onArtifactRefresh: (answerId: string) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const refreshedUrlRef = useRef<string | null>(null)
  const scratchpadLabel = partCount > 1 ? `ข้อย่อย ${label}` : 'คำตอบ'

  useEffect(() => {
    refreshedUrlRef.current = null
  }, [artifact?.previewUrl])

  if (!required && !scratchpadEnabled && !artifact && !workImage) return null

  const removeArtifact = async () => {
    if (!artifact || deleting) return
    if (!window.confirm('นำวิธีทำที่แนบออกจากข้อนี้ใช่ไหม?')) return
    setDeleting(true)
    try {
      await onArtifactDelete(artifact)
    } finally {
      setDeleting(false)
    }
  }

  const refreshPreview = () => {
    if (refreshedUrlRef.current === artifact?.previewUrl) return
    refreshedUrlRef.current = artifact?.previewUrl ?? '__missing__'
    void onArtifactRefresh(answerId)
  }

  return (
    <div className="mt-2 rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="size-3.5 text-primary" aria-hidden="true" />
        <p className="text-xs font-semibold">วิธีทำ{partCount > 1 ? ` · ${label}` : ''}</p>
        {required && (
          <Badge variant="outline" className="ml-auto text-[10px] text-warning">ต้องแนบ</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {artifact && (
          <div className="space-y-1.5">
            {artifact.previewUrl ? (
              <a href={artifact.previewUrl} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artifact.previewUrl}
                  alt={`วิธีทำจากกระดาษทด ${label}`}
                  className="h-28 w-28 rounded-lg border bg-card object-cover transition-opacity hover:opacity-90"
                  onError={refreshPreview}
                />
              </a>
            ) : (
              <Button type="button" variant="outline" size="sm" className="h-28 w-28" onClick={refreshPreview}>
                โหลดภาพวิธีทำ
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground">จากกระดาษทด · แก้ไขได้ก่อนส่ง</p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onOpenScratchpad(answerId, partIndex, scratchpadLabel, true)}
              >
                <Pencil /> แก้ไข
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => void removeArtifact()}
                disabled={deleting}
                aria-label="นำวิธีทำที่แนบออก"
              >
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {scratchpadEnabled && !artifact && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenScratchpad(answerId, partIndex, scratchpadLabel)}
            >
              <NotebookPen /> เขียนบนกระดาษทด
            </Button>
          )}
          <WorkImageUpload
            value={workImage}
            onChange={onPhotoChange}
            required={required && !artifact}
            localOnly={localOnly}
          />
        </div>
      </div>

      {required && !artifact && !workImage && localOnly && (
        <p className="mt-2 text-[10px] text-warning">ต้องแนบวิธีทำก่อนจำลองการส่ง</p>
      )}
    </div>
  )
}

function MultiPartAnswerInput({
  answerId, parts, questionText, labels, fallbackUnit, rawValue, onSingleChange, onPartChange,
  mathInputModes, activeMathField, onActivateMathField, onDeactivateMathField, onMathInputModeChange,
  requiresWorkImage, workImages, onWorkImageChange, scratchpadEnabled, workArtifacts,
  onOpenScratchpad, onArtifactDelete, onArtifactRefresh, localOnly,
}: {
  answerId: string
  parts: SafeAnswerPart[] | AnswerPart[] | null
  questionText?: string
  labels: string[]
  fallbackUnit: string | null
  rawValue: string
  onSingleChange: (val: string) => void
  onPartChange: (pi: number, val: string, total: number) => void
  mathInputModes: MathInputModes
  activeMathField: string | null
  onActivateMathField: (fieldId: string, answerId: string, partKey: string, label: string) => void
  onDeactivateMathField: () => void
  onMathInputModeChange: (partKey: string, mode: MathInputMode) => void
  requiresWorkImage: boolean
  workImages: (string | null)[]
  onWorkImageChange: (partIndex: number, url: string | null) => void
  scratchpadEnabled: boolean
  workArtifacts: Record<string, StudentWorkArtifactView>
  onOpenScratchpad: (answerId: string, partIndex: number, label: string, loadAttached?: boolean) => void
  onArtifactDelete: (artifact: StudentWorkArtifactView) => Promise<boolean | void>
  onArtifactRefresh: (answerId: string) => Promise<void>
  /** ครูดูตัวอย่างอยู่ — แนบรูปได้จริงแต่ไม่อัปขึ้น storage (ดู WorkImageUpload) */
  localOnly?: boolean
}) {
  const activeParts = parts && parts.length > 0 ? parts : null

  const mathField = ({
    value,
    onChange,
    partId,
    partIndex,
    totalParts,
    ariaLabel,
    className,
    inputClassName,
  }: {
    value: string
    onChange: (value: string) => void
    partId?: string
    partIndex: number
    totalParts: number
    ariaLabel: string
    className?: string
    inputClassName?: string
  }) => {
    const partKey = mathInputPartKey(partId, partIndex, totalParts)
    const fieldId = `${answerId}:${partKey}`
    return (
      <MathAnswerField
        value={value}
        mode={readMathInputMode(mathInputModes, partKey)}
        active={activeMathField === fieldId}
        onActivate={() => onActivateMathField(fieldId, answerId, partKey, ariaLabel)}
        onDeactivate={onDeactivateMathField}
        onChange={onChange}
        onModeChange={mode => onMathInputModeChange(partKey, mode)}
        ariaLabel={ariaLabel}
        className={className}
        inputClassName={inputClassName}
      />
    )
  }

  // One or more numbered [คำตอบ N] blanks embedded directly in the question
  // stem — render the stem here (interleaved with inputs) instead of the
  // generic "คำตอบ" box(es) below, whether there's 1 blank or several.
  const mainBlanks = questionText ? splitNumberedAnswerBlanks(questionText) : null
  const mainBlankCount = mainBlanks ? mainBlanks.numbers.length : 0
  if (mainBlanks && mainBlankCount > 0 && activeParts && mainBlankCount <= activeParts.length) {
    let inlineValues: string[] = []
    if (activeParts.length > 1) {
      try { inlineValues = JSON.parse(rawValue || '[]') } catch { inlineValues = [] }
      while (inlineValues.length < activeParts.length) inlineValues.push('')
    }
    const getValue = (i: number) => activeParts.length > 1 ? (inlineValues[i] ?? '') : rawValue
    const setValue = (i: number, val: string) => {
      if (activeParts.length > 1) onPartChange(i, val, activeParts.length)
      else onSingleChange(val)
    }

    return (
      <div className="space-y-1">
        <div className="leading-loose text-sm">
          {mainBlanks.parts.map((frag, i) => {
            const num = mainBlanks.numbers[i]
            const part = activeParts[i]
            if (num === undefined || !part) return <RichText key={i} text={frag} className="[&_p]:inline" />
            return (
              <span key={i}>
                {frag && <RichText text={frag} className="[&_p]:inline" />}
                <span className="inline-flex items-center gap-1.5 mx-1 align-middle">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">{num})</span>
                  {mathField({
                    value: getValue(i),
                    onChange: value => setValue(i, value),
                    partId: part.id,
                    partIndex: i,
                    totalParts: activeParts.length,
                    ariaLabel: `คำตอบข้อย่อย ${num}`,
                    className: 'max-w-[13rem]',
                    inputClassName: 'h-8 max-w-[9rem]',
                  })}
                  {part.unit && <UnitDisplay html={part.unit} />}
                </span>
              </span>
            )
          })}
        </div>
        {(requiresWorkImage || scratchpadEnabled || activeParts.some((_, index) => (
          !!workArtifacts[`${answerId}:${workArtifactPartKey(index, activeParts.length)}`]
        ))) && activeParts.map((_, index) => {
          const artifactPartKey = workArtifactPartKey(index, activeParts.length)
          return (
            <WorkProofSlot
              key={artifactPartKey}
              answerId={answerId}
              partIndex={index}
              partCount={activeParts.length}
              label={labels[index] ?? String(index + 1)}
              required={requiresWorkImage}
              scratchpadEnabled={scratchpadEnabled}
              workImage={workImages[index] ?? null}
              artifact={workArtifacts[`${answerId}:${artifactPartKey}`] ?? null}
              localOnly={localOnly}
              onPhotoChange={url => onWorkImageChange(index, url)}
              onOpenScratchpad={onOpenScratchpad}
              onArtifactDelete={onArtifactDelete}
              onArtifactRefresh={onArtifactRefresh}
            />
          )
        })}
      </div>
    )
  }

  if (!activeParts || activeParts.length === 1) {
    const unit = activeParts?.[0]?.unit ?? fallbackUnit ?? ''
    const blankSplit = questionText ? splitAnswerBlankHtml(questionText) : null
    const inputEl = mathField({
      value: rawValue,
      onChange: onSingleChange,
      partId: activeParts?.[0]?.id,
      partIndex: 0,
      totalParts: 1,
      ariaLabel: 'คำตอบตัวเลข',
      className: 'w-full max-w-xs',
    })
    return (
      <div className="space-y-1">
        {blankSplit ? (
          <div className="flex flex-wrap items-center gap-2 text-sm leading-loose">
            {blankSplit[0] && <RichText text={blankSplit[0]} className="[&_p]:inline" />}
            {inputEl}
            {unit && <UnitDisplay html={unit} />}
            {blankSplit[1] && <RichText text={blankSplit[1]} className="[&_p]:inline" />}
          </div>
        ) : (
          <>
            <label className="text-sm font-medium">คำตอบ</label>
            <div className="flex items-center gap-2">
              {inputEl}
              {unit && <UnitDisplay html={unit} />}
            </div>
          </>
        )}
        {(requiresWorkImage || scratchpadEnabled || workArtifacts[`${answerId}:answer`]) && (
          <WorkProofSlot
            answerId={answerId}
            partIndex={0}
            partCount={1}
            label="คำตอบ"
            required={requiresWorkImage}
            scratchpadEnabled={scratchpadEnabled}
            workImage={workImages[0] ?? null}
            artifact={workArtifacts[`${answerId}:answer`] ?? null}
            localOnly={localOnly}
            onPhotoChange={url => onWorkImageChange(0, url)}
            onOpenScratchpad={onOpenScratchpad}
            onArtifactDelete={onArtifactDelete}
            onArtifactRefresh={onArtifactRefresh}
          />
        )}
      </div>
    )
  }
  let partValues: string[] = []
  try { partValues = JSON.parse(rawValue || '[]') } catch { partValues = [] }
  while (partValues.length < activeParts.length) partValues.push('')
  return (
    <div className="space-y-3">
      {activeParts.map((part, i) => (
        <div key={part.id} className="space-y-1">
          <label className="text-sm font-medium">
            {labels[i] ?? i + 1})
            {part.sub_text && <RichText text={part.sub_text} className="font-normal text-muted-foreground ml-1" />}
          </label>
          <div className="flex items-center gap-2">
            {mathField({
              value: partValues[i] ?? '',
              onChange: value => onPartChange(i, value, activeParts.length),
              partId: part.id,
              partIndex: i,
              totalParts: activeParts.length,
              ariaLabel: `คำตอบข้อย่อย ${labels[i] ?? i + 1}`,
              className: 'w-full max-w-xs',
            })}
            {part.unit && <UnitDisplay html={part.unit} />}
          </div>
          {(requiresWorkImage || scratchpadEnabled || workArtifacts[`${answerId}:${workArtifactPartKey(i, activeParts.length)}`]) && (
            <WorkProofSlot
              answerId={answerId}
              partIndex={i}
              partCount={activeParts.length}
              label={labels[i] ?? String(i + 1)}
              required={requiresWorkImage}
              scratchpadEnabled={scratchpadEnabled}
              workImage={workImages[i] ?? null}
              artifact={workArtifacts[`${answerId}:${workArtifactPartKey(i, activeParts.length)}`] ?? null}
              localOnly={localOnly}
              onPhotoChange={url => onWorkImageChange(i, url)}
              onOpenScratchpad={onOpenScratchpad}
              onArtifactDelete={onArtifactDelete}
              onArtifactRefresh={onArtifactRefresh}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── True/False ───────────────────────────────────────────────────────────────

// The student ticks whichever statements match `select_target` (any number,
// including zero) instead of judging each one individually — used when
// config.answer_mode === 'select_matching'. Reuses the same
// { answers: string[], explanation } encoding as the classic multi-statement
// mode below: answers[i] === 'true' means "ticked", compared directly
// against the pre-flipped target built in submissions.ts.
function TrueFalseSelectMatching({ config, subStatements, mode, questionText, rawValue, onChange }: {
  config: TrueFalseConfig | SafeTrueFalseConfig | null
  subStatements: Array<TrueFalseStatement | SafeTrueFalseStatement>
  mode: TrueFalseExplanationMode
  questionText: string
  rawValue: string; onChange: (v: string) => void
}) {
  let answers: string[] = []; let explanation = ''
  if (rawValue) {
    try { const p = JSON.parse(rawValue); answers = p.answers ?? []; explanation = p.explanation ?? '' } catch { /* */ }
  }
  const labels = partLabels(config?.part_label_style)
  const target = config?.select_target ?? 'correct'
  function toggle(i: number) {
    const next = [...answers]
    next[i] = next[i] === 'true' ? 'false' : 'true'
    onChange(JSON.stringify({ answers: next, explanation }))
  }
  function updateExplanation(exp: string) {
    onChange(JSON.stringify({ answers, explanation: exp }))
  }
  // ก) is the question's own statement: a multi-statement ถูก-ผิด keeps it in
  // question_text rather than in `statements`, which start at ข). The exam also
  // shows question_text above as the stem, so writing it into the list repeats
  // it — but a row that reads just "ก)" with nothing beside it, between rows
  // that do have text, reads as a statement that failed to load, and the
  // student is left to guess that it means the sentence further up the page.
  const items: Array<{ text: string }> = [{ text: questionText }, ...subStatements]
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{choiceListHint(questionText, target)}</p>
      <div className="space-y-2">
        {items.map((st, i) => (
          <label key={i} className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 cursor-pointer transition-colors ${
            answers[i] === 'true' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
          }`}>
            <input type="checkbox" className="mt-0.5" checked={answers[i] === 'true'} onChange={() => toggle(i)} />
            <span className="flex items-center gap-1.5 flex-wrap text-sm">
              <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>
              {st.text && <RichText text={st.text} />}
            </span>
          </label>
        ))}
      </div>
      {mode !== 'none' && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {mode === 'wrong_only' ? 'เหตุผล (กรณีตอบผิด):' : 'เหตุผล:'}
          </label>
          <Textarea value={explanation} onChange={e => updateExplanation(e.target.value)} rows={3}
            placeholder="พิมพ์เหตุผล..." className="w-full resize-none" />
          <p className="text-xs text-warning">ครูจะตรวจและให้คะแนนด้วยมือ</p>
        </div>
      )}
    </div>
  )
}

function TrueFalseAnswerInput({ config, questionText, rawValue, onChange }: {
  answerId: string
  config: TrueFalseConfig | SafeTrueFalseConfig | null
  questionText: string
  rawValue: string
  onChange: (v: string) => void
}) {
  const mode = config?.explanation_mode ?? 'none'
  const subStatements = config?.statements ?? []

  if (config?.answer_mode === 'select_matching') {
    return <TrueFalseSelectMatching config={config} subStatements={subStatements} mode={mode} questionText={questionText} rawValue={rawValue} onChange={onChange} />
  }

  if (subStatements.length === 0) {
    let tfAnswer = rawValue; let explanation = ''
    if (rawValue.startsWith('{')) {
      try { const p = JSON.parse(rawValue); tfAnswer = p.answer ?? ''; explanation = p.explanation ?? '' } catch { /* */ }
    }
    function update(a: string, exp: string) {
      mode === 'none' ? onChange(a) : onChange(JSON.stringify({ answer: a, explanation: exp }))
    }
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">ข้อความนี้ถูกหรือผิด?</p>
        <div className="flex gap-3">
          {([
            { val: 'true',  label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' },
            { val: 'false', label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' },
          ] as const).map(({ val, label, cls }) => (
            <button key={val} type="button" onClick={() => update(val, explanation)}
              className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-colors ${
                tfAnswer === val ? cls : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {mode !== 'none' && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {mode === 'wrong_only' ? 'เหตุผล (กรณีตอบผิด):' : 'เหตุผล:'}
            </label>
            <Textarea value={explanation} onChange={e => update(tfAnswer, e.target.value)} rows={3}
              placeholder="พิมพ์เหตุผล..." className="w-full resize-none" />
            <p className="text-xs text-warning">ครูจะตรวจและให้คะแนนด้วยมือ</p>
          </div>
        )}
      </div>
    )
  }

  let answers: string[] = []; let explanation = ''
  if (rawValue) {
    try { const p = JSON.parse(rawValue); answers = p.answers ?? []; explanation = p.explanation ?? '' } catch { /* */ }
  }
  const labels = partLabels(config?.part_label_style)
  function updateAnswer(i: number, val: string) {
    const next = [...answers]
    next[i] = val
    onChange(JSON.stringify({ answers: next, explanation }))
  }
  function updateExplanation(exp: string) {
    onChange(JSON.stringify({ answers, explanation: exp }))
  }
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">ข้อความแต่ละข้อถูกหรือผิด?</p>
      {([{ text: questionText }, ...subStatements] as Array<{ text: string }>).map((st, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>
            {st.text && <RichText text={st.text} className="text-sm" />}
          </div>
          <div className="flex gap-3">
            {([
              { val: 'true',  label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' },
              { val: 'false', label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' },
            ] as const).map(({ val, label, cls }) => (
              <button key={val} type="button" onClick={() => updateAnswer(i, val)}
                className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-colors ${
                  answers[i] === val ? cls : 'border-border text-muted-foreground hover:border-muted-foreground'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {mode !== 'none' && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {mode === 'wrong_only' ? 'เหตุผล (กรณีตอบผิด):' : 'เหตุผล:'}
          </label>
          <Textarea value={explanation} onChange={e => updateExplanation(e.target.value)} rows={3}
            placeholder="พิมพ์เหตุผล..." className="w-full resize-none" />
          <p className="text-xs text-warning">ครูจะตรวจและให้คะแนนด้วยมือ</p>
        </div>
      )}
    </div>
  )
}

// ─── Fill-blank ───────────────────────────────────────────────────────────────

function FillBlankAnswerInput({ questionText, config, rawValue, onChange }: {
  questionText: string
  config: FillBlankConfig | SafeFillBlankConfig | null
  rawValue: string
  onChange: (v: string) => void
}) {
  const blanks = config?.blanks ?? []
  const parts  = splitFillBlankHtml(questionText)
  const blankNumbers = extractBlankNumbers(questionText)
  let ans: string[] = []
  try { ans = JSON.parse(rawValue || '[]') } catch { ans = [] }
  while (ans.length < blanks.length) ans.push('')
  function updateBlank(i: number, val: string) {
    const next = [...ans]; next[i] = val; onChange(JSON.stringify(next))
  }
  return (
    <div className="leading-loose text-sm">
      {parts.map((part, i) => {
        const blank = blanks[i]
        const type = i < blanks.length ? getBlankType(config, blank) : null
        return (
          <span key={i}>
            <RichText text={part} />
            {type === 'dropdown' ? (
              <NativeSelect value={ans[i] ?? ''} onChange={e => updateBlank(i, e.target.value)} className="inline-block mx-1 border-b-2 border-primary bg-primary/10 text-center">
                <option value="">เลือกคำตอบ</option>
                {(blank?.options ?? []).map((opt, oi) => (
                  <option key={oi} value={opt}>{opt}</option>
                ))}
              </NativeSelect>
            ) : type !== null ? (
              <Input type="text" value={ans[i] ?? ''} onChange={e => updateBlank(i, e.target.value)} className="inline-block mx-1 w-28 border-b-2 border-primary bg-primary/10 text-center"
                placeholder={`ช่อง ${blankNumbers[i] ?? i + 1}`} />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

// `Math.random()` during render made the server and browser paint a different
// order and forced React to throw the whole preview tree away at hydration.
// The real student payload is already shuffled server-side; this second,
// deterministic pass only keeps the legacy/component-preview behaviour stable.
function stableItemShuffle(items: OrderingItem[], salt: string): OrderingItem[] {
  const hash = (value: string) => {
    let result = 2166136261
    for (let i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i)
      result = Math.imul(result, 16777619)
    }
    return result >>> 0
  }
  return items
    .map((item, index) => ({ item, order: hash(`${salt}:${index}:${item.id}`) }))
    .sort((left, right) => left.order - right.order)
    .map(entry => entry.item)
}

// ─── Matching ────────────────────────────────────────────────────────────────
// Drag the choices from the bank underneath into the slot beside each prompt
// (see MatchingDragInput for why it is pointer events plus a tap fallback, not
// HTML5 drag-and-drop).
//
// The stored answer is unchanged: the chosen right_text per prompt, in prompt
// order, which is what the 'MATCH:' branch in lib/assignment-attempt.ts grades
// against. Only the way a student produces it changed, so answers saved by the
// old dropdown version still load and still grade the same.
//
// Placement is derived from that stored text rather than held as state, so a
// half-finished answer survives paging between questions and a reload — see
// lib/matching-answer.ts, where the conversion lives so it can be tested.
function MatchingAnswerInput({ prompts, options, mode, rawValue, onChange }: {
  prompts: Array<{ left_text?: string; left_image?: string }>
  options: Array<{ right_text: string; right_image?: string }>
  /** Which layout the teacher chose. Undefined behaves as 'slots', as it always did. */
  mode: MatchingAnswerMode | undefined
  rawValue: string
  onChange: (v: string) => void
}) {
  let picked: string[] = []
  try { picked = rawValue ? JSON.parse(rawValue) : [] } catch { picked = [] }
  if (!Array.isArray(picked)) picked = []

  const shared = {
    prompts: prompts.map(p => ({ text: p.left_text ?? '', imageUrl: p.left_image })),
    options: options.map((o, j) => ({
      id: String(j),
      text: o.right_text,
      imageUrl: o.right_image,
    })) satisfies MatchingOption[],
    placement: placementFromTexts(picked, options, prompts.length),
    onChange: (next: (string | null)[]) =>
      onChange(JSON.stringify(textsFromPlacement(next, options))),
  }

  return mode === 'lines' ? <MatchingLineInput {...shared} /> : <MatchingDragInput {...shared} />
}

// Ordering is dragged into place rather than numbered by dropdown, so a
// duplicate or missing position is no longer possible to express — the answer
// is always a complete permutation. The stored shape is the one 'ORDER:' in
// lib/assignment-attempt.ts already grades: item ids in the student's order.
//
// An untouched question stays *unanswered*, which is why the list needs the
// student to confirm an order they did not move. Writing the shuffled order on
// mount would mark every ordering question answered before it was read, hide
// who skipped it, and hand out partial credit for a lucky shuffle.
function OrderingAnswerInput({ config, rawValue, onChange }: {
  answerId: string
  config: OrderingConfig | SafeOrderingConfig | null
  rawValue: string
  onChange: (v: string) => void
}) {
  const items: OrderingItem[] = config?.items ?? []
  const shuffled = stableItemShuffle(items, 'ordering')
  const order = orderingDisplayOrder(rawValue, shuffled)

  return (
    <OrderingDragList
      items={order}
      answered={orderingIsAnswered(rawValue, items.length)}
      onReorder={ids => onChange(JSON.stringify(ids))}
      onConfirm={() => onChange(JSON.stringify(order.map(i => i.id)))}
    />
  )
}

// ─── Composite ────────────────────────────────────────────────────────────────
// Renders each part (true_false / fill_blank / mcq / ordering) with the same
// input style its standalone question type uses. The whole answer is stored
// as one JSON array, one entry per part, in part order — see the 'COMP:'
// grading branch in lib/actions/submissions.ts for the matching shape.

// A part's own รูปประกอบ. Both composite forms let a teacher upload one per
// ข้อย่อย (composite-form.tsx, true-false-group-form.tsx) and it survives into
// SafeCompositePart, but nothing ever drew it — the teacher saw the upload
// succeed and the student got the sub-question without its picture. Drawn
// under that part's prompt, matching the order the whole question uses (text,
// then images), so the picture reads as belonging to this part and not the one
// above it.
function PartImages({ urls }: { urls?: string[] }) {
  if (!urls?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map(url => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="รูปประกอบข้อย่อย" className="max-h-40 rounded-xl border object-contain" />
      ))}
    </div>
  )
}

function CompositeAnswerInput({ config, rawValue, onChange }: {
  config: CompositeConfig | SafeCompositeConfig | null
  rawValue: string
  onChange: (v: string) => void
}) {
  const parts = config?.parts ?? []
  const labels = partLabels(config?.part_label_style)
  let answers: string[] = []
  try { answers = JSON.parse(rawValue || '[]') } catch { answers = [] }
  while (answers.length < parts.length) answers.push('')

  const shuffledByPart = parts.map((part, index) =>
    part.items?.length ? stableItemShuffle(part.items, `composite:${index}:${part.id}`) : [],
  )

  function updatePart(i: number, val: string) {
    const next = [...answers]; next[i] = val; onChange(JSON.stringify(next))
  }

  return (
    <div className="space-y-5">
      {parts.map((part, i) => (
        <div key={part.id} className="space-y-2 pb-4 border-b last:border-b-0 last:pb-0">
          <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>

          {part.type === 'true_false' && Array.isArray(part.choices) && part.choices.length > 0 && (() => {
            let choiceAnswers: string[] = []
            try { choiceAnswers = JSON.parse(answers[i] || '[]') } catch { choiceAnswers = [] }
            function toggleChoice(ci: number) {
              const next = [...choiceAnswers]
              next[ci] = next[ci] === 'true' ? 'false' : 'true'
              updatePart(i, JSON.stringify(next))
            }
            const target = part.select_target ?? 'correct'
            const inRow = choicesFitOneRow(part.choices!.map(c => c.text))
            return (
              <>
                <RichText text={part.text} className="text-sm block" />
                <PartImages urls={part.image_urls} />
                <p className="text-xs text-muted-foreground">{choiceListHint(part.text, target)}</p>
                <div className={inRow ? 'flex flex-wrap gap-1.5' : 'space-y-1.5'}>
                  {part.choices!.map((c, ci) => (
                    <label key={c.id} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                      choiceAnswers[ci] === 'true' ? 'border-primary bg-primary/10' : 'border-border'
                    }`}>
                      <input type="checkbox" className="mt-0.5" checked={choiceAnswers[ci] === 'true'} onChange={() => toggleChoice(ci)} />
                      <RichText text={c.text} />
                    </label>
                  ))}
                </div>
              </>
            )
          })()}

          {part.type === 'true_false' && !(Array.isArray(part.choices) && part.choices.length > 0) && (
            <>
              <RichText text={part.text} className="text-sm block" />
              <PartImages urls={part.image_urls} />
              <div className="flex gap-3">
                {([
                  { val: 'true', label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' },
                  { val: 'false', label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' },
                ] as const).map(({ val, label, cls }) => (
                  <button key={val} type="button" onClick={() => updatePart(i, val)}
                    className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                      answers[i] === val ? cls : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {part.type === 'fill_blank' && part.blanks?.[0] && (() => {
            const blank = part.blanks![0]
            const split = splitAnswerBlankHtml(part.text)
            const type = getBlankType(undefined, blank)
            // Inline when the sub-question's text carries the [คำตอบ] marker,
            // on its own line when it doesn't. The form requires the marker,
            // but a question imported from a file carries whatever extra_data
            // it was given, and a part with no input at all is unanswerable
            // while still counting toward naturalMaxScore — the student loses
            // the point for a blank the teacher never gave them.
            const control = type === 'dropdown' ? (
              <NativeSelect value={answers[i] ?? ''} onChange={e => updatePart(i, e.target.value)}
                className={split
                  ? 'inline-block mx-1 border-b-2 border-primary bg-primary/10 text-center'
                  : 'border-b-2 border-primary bg-primary/10'}>
                <option value="">เลือกคำตอบ</option>
                {(blank.options ?? []).map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
              </NativeSelect>
            ) : (
              <Input type="text" value={answers[i] ?? ''} onChange={e => updatePart(i, e.target.value)}
                placeholder={split ? undefined : 'พิมพ์คำตอบ'}
                className={split
                  ? 'inline-block mx-1 w-28 border-b-2 border-primary bg-primary/10 text-center'
                  : 'w-full max-w-xs border-b-2 border-primary bg-primary/10'} />
            )
            if (!split) return (
              <>
                <RichText text={part.text} className="text-sm block" />
                <PartImages urls={part.image_urls} />
                <div className="mt-2">{control}</div>
              </>
            )
            return (
              <>
                <PartImages urls={part.image_urls} />
                <p className="text-sm leading-loose">
                  <RichText text={split[0]} />
                  {control}
                  <RichText text={split[1]} />
                </p>
              </>
            )
          })()}

          {part.type === 'mcq' && (
            <>
              <RichText text={part.text} className="text-sm block" />
              <PartImages urls={part.image_urls} />
              <div className="space-y-1.5">
                {(part.options ?? []).map((opt, oi) => {
                  // Same MCQ:<position> identity a standalone mcq uses; a
                  // composite part's options aren't shuffled, so the position
                  // is just where it sits in the list.
                  const value = `MCQ:${oi}`
                  return (
                    <label key={oi} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                      answers[i] === value ? 'border-tint-1 bg-tint-1/10' : 'border-border'
                    }`}>
                      <input type="radio" name={`composite-${part.id}`} checked={answers[i] === value} onChange={() => updatePart(i, value)} />
                      <RichText text={opt.text} />
                    </label>
                  )
                })}
              </div>
            </>
          )}

          {part.type === 'ordering' && (() => {
            const items = shuffledByPart[i] ?? []
            const raw = answers[i] ?? ''
            const order = orderingDisplayOrder(raw, items)
            return (
              <>
                <RichText text={part.text} className="text-sm block" />
                <PartImages urls={part.image_urls} />
                <OrderingDragList
                  items={order}
                  answered={orderingIsAnswered(raw, items.length)}
                  onReorder={ids => updatePart(i, JSON.stringify(ids))}
                  onConfirm={() => updatePart(i, JSON.stringify(order.map(it => it.id)))}
                />
              </>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

// ─── Classify (ตารางจำแนก) ────────────────────────────────────────────────────
//
// One <table>, two layouts. Above lg it is a table: the thing being classified
// on the left, one column per way of classifying it, the column's options
// repeated down the rows. Below lg every table element turns back into a block
// (`block lg:table-cell` and friends), so each row becomes a card that stacks
// its dimensions.
//
// The switch is at lg rather than md because md was measured, not guessed: at
// 768 and at 812 (a phone on its side) the table fits without overflowing, but
// the exam page's sidebar leaves the three columns so little room that
// "พอลิเมอร์ธรรมชาติ" wraps onto three lines. The rule is to break where the
// content stops reading well rather than at a named device width, and a
// landscape phone must not inherit a crowded desktop layout.
// The header row hides itself there and each cell reprints its own column title
// instead, because a radio group with no label is unanswerable.
//
// The answer is a row-major grid of chosen option positions, one entry per
// cell, -1 where nothing is chosen — the shape lib/classify.ts freezes as the
// 'CLS:' key and grades against. Rows, columns and options are rendered in the
// order they arrive and never shuffled; the grid is positional, so any
// reordering here would misalign every answer.

function ClassifyAnswerInput({ config, rawValue, onChange }: {
  config: ClassifyConfig | SafeClassifyConfig | null
  rawValue: string
  onChange: (v: string) => void
}) {
  const columns = config?.columns ?? []
  const rows = config?.rows ?? []
  const labels = partLabels(config?.row_label_style ?? 'number')

  const stored = parseClassifyGrid(rawValue)
  const grid = rows.map((_, r) => columns.map((_, c) => stored[r]?.[c] ?? CLASSIFY_UNSET))

  function choose(r: number, c: number, option: number) {
    const next = grid.map(row => [...row])
    next[r][c] = option
    onChange(JSON.stringify(next))
  }

  if (columns.length === 0 || rows.length === 0) {
    return <p className="text-sm text-warning">โจทย์นี้ยังไม่มีตารางให้ตอบ — แจ้งครูผู้สอน</p>
  }

  return (
    <table className="block w-full border-separate border-spacing-0 lg:table">
      <thead className="hidden lg:table-header-group">
        <tr>
          <th className="w-px whitespace-nowrap p-2 text-left align-bottom text-xs font-semibold text-muted-foreground">
            รายการ
          </th>
          {columns.map(column => (
            <th key={column.id} className="p-2 text-left align-bottom text-xs font-semibold text-muted-foreground">
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="block lg:table-row-group">
        {rows.map((row, r) => (
          <tr key={row.id} className="mb-3 block rounded-xl border p-3 last:mb-0 lg:mb-0 lg:table-row lg:rounded-none lg:border-0 lg:p-0">
            <th scope="row" className="block p-0 pb-2 text-left align-top font-normal lg:table-cell lg:w-px lg:whitespace-nowrap lg:border-t lg:p-2 lg:pr-4">
              <span className="flex items-start gap-2">
                <span className="text-xs font-bold text-muted-foreground">{labels[r] ?? r + 1}.</span>
                <RichText text={row.text} className="text-sm" />
              </span>
              {(row.image_urls ?? []).length > 0 && (
                <span className="mt-2 flex flex-wrap gap-2">
                  {(row.image_urls ?? []).map(url => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="รูปประกอบรายการ" className="max-h-28 rounded-lg border object-contain" />
                  ))}
                </span>
              )}
            </th>
            {columns.map((column, c) => (
              <td key={column.id} className="block p-0 pt-2 align-top lg:table-cell lg:border-t lg:p-2">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground lg:hidden">{column.title}</span>
                <span className={choicesFitOneRow(column.options ?? []) ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-1.5'}>
                  {(column.options ?? []).map((option, oi) => (
                    <label
                      key={oi}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        grid[r][c] === oi ? 'border-tint-1 bg-tint-1/10' : 'border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        className="shrink-0"
                        name={`classify-${row.id}-${column.id}`}
                        checked={grid[r][c] === oi}
                        onChange={() => choose(r, c, oi)}
                      />
                      <span className="min-w-0">{option}</span>
                    </label>
                  ))}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── File upload ──────────────────────────────────────────────────────────────

function FileUploadAnswerInput({ rawValue, onChange, localOnly }: {
  rawValue: string; onChange: (files: SubmittedFile[]) => void; localOnly?: boolean
}) {
  let files: SubmittedFile[] = []
  try { files = rawValue ? JSON.parse(rawValue) : [] } catch { files = [] }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">แนบไฟล์คำตอบ (รูปภาพหรือ PDF)</p>
      <FileSubmissionUpload value={files} onChange={onChange} localOnly={localOnly} />
      {files.length === 0 ? (
        <p className="text-xs text-warning">ยังไม่ได้แนบไฟล์ — ต้องแนบอย่างน้อย 1 ไฟล์เพื่อรับคะแนนเต็ม</p>
      ) : (
        <p className="text-xs text-success">✓ แนบไฟล์แล้ว {files.length} ไฟล์</p>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interpolateValues(text: string, values: Record<string, number>, variables: Array<{ name: string; unit?: string }>) {
  let result = text
  for (const v of variables) {
    if (values[v.name] !== undefined) {
      result = result.replace(new RegExp(`\\{${v.name}\\}`, 'g'), String(values[v.name]))
    }
  }
  return result
}

function UnitDisplay({ html }: { html: string }) {
  return /<[a-z][\s\S]*>/i.test(html) || containsMath(html)
    ? <span className="text-sm text-muted-foreground [&_p]:inline" dangerouslySetInnerHTML={{ __html: renderMathInHtml(html) }} />
    : <span className="text-sm text-muted-foreground">{html}</span>
}

function QuestionText({ text }: { text: string }) {
  // Support: HTML, MathML (<math>), TeX via KaTeX, plain text
  if (/<[a-z][\s\S]*>/i.test(text) || containsMath(text)) {
    return (
      <div
        className="leading-relaxed rich-text-content text-base [&_math]:my-1 [&_math]:inline-block"
        dangerouslySetInnerHTML={{ __html: renderMathInHtml(text) }}
      />
    )
  }
  return <p className="leading-relaxed whitespace-pre-line text-base">{text}</p>
}

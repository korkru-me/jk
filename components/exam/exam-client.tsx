'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { saveWorkImage, submitSubmission } from '@/lib/actions/submissions'
import { gradeAnswer, type GradedAnswer } from '@/lib/assignment-attempt'
import { useAnswerAutosave } from '@/hooks/use-answer-autosave'
import { useTabSwitchGuard } from '@/hooks/use-tab-switch-guard'
import { useFullscreenGuard } from '@/hooks/use-fullscreen-guard'
import { useExamTimer } from '@/hooks/use-exam-timer'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useExamProctor } from '@/hooks/use-exam-proctor'
import { WorkImageUpload } from './work-image-upload'
import { FileSubmissionUpload } from './file-submission-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Flag, Eye, EyeOff, Maximize2, Minimize2, CheckCircle2, XCircle, Clock, AlertTriangle,
  Calculator as CalcIcon, BookOpen, PenLine, Wifi, WifiOff, ShieldAlert, Maximize, MonitorSmartphone,
} from 'lucide-react'
import { Calculator } from './calculator'
import { FormulaSheet } from './formula-sheet'
import { Scratchpad } from './scratchpad'
import { RichText } from '@/components/ui/rich-text'
import { containsMath, renderMathInHtml } from '@/lib/math/latex'
import { partLabels } from '@/lib/part-labels'
import { groupQuestionsBySection, sectionByQuestionId, type QuestionSetSection } from '@/lib/question-set-sections'
import { getBlankType, splitFillBlankHtml, extractBlankNumbers } from '@/lib/fill-blank'
import { splitAnswerBlankHtml, countAnswerBlanks, splitNumberedAnswerBlanks } from '@/lib/answer-blank'
import type { AnswerPart, TrueFalseConfig, TrueFalseStatement, TrueFalseExplanationMode, FillBlankConfig, OrderingConfig, OrderingItem, RandomQuestionConfig, FileUploadConfig, SubmittedFile, CompositeConfig } from '@/lib/types'
import type {
  SafeAnswerPart,
  SafeCompositeConfig,
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

// ─── Types ────────────────────────────────────────────────────────────────────

const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']

interface AnswerRow extends Omit<SafeExamAnswer, 'questions'> {
  correct_answer?: string
  // Only populated for a teacher's preview (see previewMode) — real
  // submission_answers rows carry this column too, but the real exam-taking
  // route never needs it client-side since grading happens server-side.
  max_score?: number
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
    requires_work_image: boolean
    // Preview-only, see AnswerRow.max_score above.
    answer_tolerance?: number
  }
}

export interface ExamConfig {
  isCalculatorEnabled: boolean
  proctoringEnabled: boolean
  isFullscreenEnforced: boolean
  blockClipboard: boolean
  watermarkText: string | null
  // Assignment-level override of each question's own requires_work_image —
  // asked of the teacher at assignment-creation time; false switches the
  // work-image requirement off for every question in this assignment.
  isWorkImageEnforced: boolean
}

interface Props {
  submissionId: string
  answers: AnswerRow[]
  durationMinutes: number | null
  startedAt: string
  config: ExamConfig
  /** แฟ้มย่อย snapshotted onto the assignment, already filtered by the server to
   *  what this assignment contains. Empty/omitted = plain numbered list. */
  sections?: QuestionSetSection[]
  // Teacher-facing "see it as a student would" mode: renders the exact same
  // UI/interactions but never calls the save/submit server actions (there is
  // no real submission row behind `submissionId` to write to), and exits via
  // `previewReturnHref` instead of the real post-submit redirect.
  previewMode?: boolean
  previewReturnHref?: string
}

// ─── ExamClient ───────────────────────────────────────────────────────────────

function initLocalAnswers(answers: AnswerRow[]): Record<string, string> {
  return Object.fromEntries(answers.map(a => [a.id, a.student_answer ?? '']))
}

function initWorkImages(answers: AnswerRow[]): Record<string, (string | null)[]> {
  return Object.fromEntries(answers.map(a => [a.id, a.work_images ?? []]))
}

function requiredWorkImageCount(a: AnswerRow, config: ExamConfig): number {
  if (!config.isWorkImageEnforced) return 0
  if (a.questions.question_type !== 'written' || !a.questions.requires_work_image) return 0
  const parts = a.questions.answer_parts
  return parts && parts.length > 0 ? parts.length : 1
}

export function ExamClient({ submissionId, answers, durationMinutes, startedAt, config, sections = [], previewMode = false, previewReturnHref }: Props) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const {
    localAnswers, localAnswersRef,
    setAnswer, flushQueuedAnswers, retryPending, clearSavedAnswers,
    saving, pendingCount,
  } = useAnswerAutosave({
    submissionId,
    initialAnswers: () => initLocalAnswers(answers),
    previewMode,
  })
  const [workImages, setWorkImages] = useState<Record<string, (string | null)[]>>(
    () => initWorkImages(answers)
  )
  const [submitting, setSubmitting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  // Runs follow the order this student actually sees (shuffling reorders
  // submission_answers), so a shuffled exam simply breaks into short runs
  // instead of printing headings over the wrong questions.
  const sectionOwner = sectionByQuestionId(sections)
  const sectionRuns = groupQuestionsBySection(answers.map(a => a.question_id), sections)
  // Preview-only: the client-side (never persisted) grading result shown
  // after a teacher clicks submit in previewMode, in place of the real
  // /submissions/[id] results page.
  const [previewResult, setPreviewResult] = useState<{ graded: GradedAnswer[]; totalScore: number; totalMax: number } | null>(null)

  // ── UX state ────────────────────────────────────────────────────────────────
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [eliminated, setEliminated] = useState<Record<string, Set<number>>>({})
  const [focusMode, setFocusMode] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submitCountdown, setSubmitCountdown] = useState(0)

  // ── Tool panels ─────────────────────────────────────────────────────────────
  const [showCalculator, setShowCalculator] = useState(false)
  const [showFormulaSheet, setShowFormulaSheet] = useState(false)
  const [showScratchpad, setShowScratchpad] = useState(false)

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
      const allSynced = await retryPending()
      if (allSynced) toast.success('ซิงก์คำตอบสำเร็จ ✓')
      else toast.warning('ยังมีบางคำตอบที่รอซิงก์ ระบบจะลองอีกครั้งเมื่อเชื่อมต่อใหม่')
    },
    onOffline: () => {
      toast.warning('อินเทอร์เน็ตหลุด — บันทึกในเครื่องแล้ว จะซิงก์อัตโนมัติเมื่อเน็ตกลับมา')
    },
  })

  // ── Countdown timer ─────────────────────────────────────────────────────────
  const secondsLeft = useExamTimer(durationMinutes, startedAt, () => handleSubmit())

  // ── 5. Submit countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (submitCountdown <= 0) return
    const t = setTimeout(() => setSubmitCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [submitCountdown])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAnswerChange = setAnswer

  const handlePartAnswerChange = useCallback((
    answerId: string, partIndex: number, value: string, totalParts: number, currentRaw: string,
  ) => {
    let arr: string[] = []
    try { arr = JSON.parse(currentRaw || '[]') } catch { arr = [] }
    while (arr.length < totalParts) arr.push('')
    arr[partIndex] = value
    handleAnswerChange(answerId, JSON.stringify(arr))
  }, [handleAnswerChange])

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
    const allAnswersSynced = await flushQueuedAnswers()
    if (!previewMode && !allAnswersSynced) {
      toast.error('ยังบันทึกคำตอบล่าสุดไม่ครบ กรุณาตรวจอินเทอร์เน็ตแล้วลองส่งอีกครั้ง')
      setSubmitting(false)
      return
    }
    if (previewMode) {
      // Grade locally with the exact same rules a real submission would get
      // (see gradeAnswer) — nothing is written anywhere, so this costs
      // nothing and leaves no trace.
      const graded = answers.map(a => gradeAnswer({
        id: a.id,
        correct_answer: a.correct_answer ?? '',
        student_answer: localAnswersRef.current[a.id] ?? null,
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
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    // The result route redirects in-progress submissions back to the exam.
    // A client-side transition can reuse a stale prefetched result and briefly
    // see the just-submitted attempt as in_progress, which starts a new retry.
    // Reload the document so the summary always reads the committed server state,
    // and replace history so Back cannot reopen the completed attempt.
    window.location.replace(`/submissions/${submissionId}`)
  }

  function findMissingWorkImage(): number | null {
    for (let i = 0; i < answers.length; i++) {
      const required = requiredWorkImageCount(answers[i], config)
      if (required === 0) continue
      const imgs = workImages[answers[i].id] ?? []
      for (let p = 0; p < required; p++) {
        if (!imgs[p]) return i
      }
    }
    return null
  }

  function openSubmitDialog() {
    const missingIndex = findMissingWorkImage()
    if (missingIndex !== null) {
      toast.error(`กรุณาแนบรูปวิธีทำให้ครบก่อนส่งคำตอบ (ข้อ ${missingIndex + 1})`)
      setCurrentIndex(missingIndex)
      return
    }
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

  const current      = answers[currentIndex]
  const answeredCount = answers.filter(a => hasAnswered(a.id)).length
  const flaggedCount  = flagged.size
  const unanswered    = answers.length - answeredCount
  const progress      = Math.round((answeredCount / answers.length) * 100)
  const isFlagged     = flagged.has(current.id)
  const timerUrgent   = secondsLeft !== null && secondsLeft < 300
  const timerDanger   = secondsLeft !== null && secondsLeft < 60

  // "written" questions may embed one or more numbered answer inputs directly
  // in the main question text via [คำตอบ N], instead of the generic
  // standalone "คำตอบ" box(es).
  const currentQuestionText = interpolateValues(
    current.questions.question_text,
    current.random_values,
    current.questions.variables,
  )
  const mainInlineBlank = current.questions.question_type === 'written'
    && countAnswerBlanks(currentQuestionText) > 0

  // ── Toolbar buttons ───────────────────────────────────────────────────────────

  const toolBtn = (active: boolean) =>
    `flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
      active
        ? 'bg-primary/15 border-primary/40 text-primary'
        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
    }`

  // ── Exam body (shared between normal + focus mode) ────────────────────────────

  const examBody = (
    <div className="flex gap-4 h-full min-h-0">

      {/* LEFT: Question */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto">

        {/* Question card */}
        <Card padding="lg" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">ข้อ {currentIndex + 1} / {answers.length}</Badge>
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
              requiresWorkImage={requiredWorkImageCount(current, config) > 0}
              workImages={workImages[current.id] ?? []}
              onWorkImageChange={(pi, url) => handleWorkImageChange(current.id, pi, url)}
            />
          )}
        </Card>

        {/* Prev / Next */}
        <div className="flex items-center gap-3 pb-2">
          <Button
            variant="outline" className="flex-1"
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
          >
            ← ก่อนหน้า
          </Button>
          {currentIndex < answers.length - 1 ? (
            <Button className="flex-1" onClick={() => setCurrentIndex(i => i + 1)}>
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

        {/* Progress */}
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

        {/* Nav grid */}
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
                      const isCur = i === currentIndex
                      const isAns = hasAnswered(a.id)
                      const isFlg = flagged.has(a.id)
                      let cls = 'bg-muted text-muted-foreground'
                      if (isCur)      cls = 'bg-primary text-white shadow-md shadow-primary/40 scale-110 z-10'
                      else if (isFlg) cls = 'bg-flag text-white'
                      else if (isAns) cls = 'bg-success/10 text-success border border-success/20 dark:bg-success/15'
                      return (
                        <button
                          key={i}
                          onClick={() => setCurrentIndex(i)}
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

        <Button
          onClick={openSubmitDialog}
          disabled={submitting}
          className="w-full bg-success hover:bg-success/90 text-success-foreground border-0"
        >
          {submitting ? 'กำลังส่ง...' : 'ส่งคำตอบ ✓'}
        </Button>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {config.watermarkText && <ExamWatermark text={config.watermarkText} />}

      {/* ── Preview mode banner ────────────────────────────────────────────── */}
      {previewMode && (
        <div className="fixed top-0 inset-x-0 z-[110] bg-warning text-amber-950 text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-3">
          <span>🔍 โหมดตัวอย่าง — มุมมองนักเรียน (คำตอบจะไม่ถูกบันทึกจริง)</span>
          <a href={previewReturnHref ?? '/assignments'} className="underline hover:no-underline">
            ออกจากตัวอย่าง
          </a>
        </div>
      )}

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

      {/* ── Tool panels ────────────────────────────────────────────────────── */}
      {showCalculator && (
        <div className="fixed bottom-4 left-4 z-50">
          <Calculator onClose={() => setShowCalculator(false)} />
        </div>
      )}
      {showFormulaSheet && <FormulaSheet onClose={() => setShowFormulaSheet(false)} />}
      {showScratchpad   && <Scratchpad  onClose={() => setShowScratchpad(false)}  />}

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
          {/* Toolbar */}
          <ExamToolbar
            saving={saving}
            isOnline={isOnline}
            pendingSync={pendingCount}
            tabSwitchCount={tabSwitchCount}
            config={config}
            proctorStatus={proctorStatus}
            proctorActiveConnectionCount={proctorActiveConnectionCount}
            showCalculator={showCalculator}
            showFormulaSheet={showFormulaSheet}
            showScratchpad={showScratchpad}
            onToggleCalc={() => setShowCalculator(v => !v)}
            onToggleFormula={() => setShowFormulaSheet(v => !v)}
            onToggleScratch={() => setShowScratchpad(v => !v)}
            onFocusMode={() => setFocusMode(true)}
            toolBtn={toolBtn}
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
          {/* Focus header */}
          <div className="shrink-0 border-b bg-card">
            <div className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">
                  โหมดโฟกัส
                </span>
                <span className="h-3 w-px bg-border shrink-0" />
                <p className="text-sm font-medium truncate">{current.questions.title || 'ชุดข้อสอบ'}</p>
              </div>

              {/* Toolbar in focus mode */}
              <div className="flex items-center gap-2 shrink-0">
                {config.isCalculatorEnabled && (
                  <button onClick={() => setShowCalculator(v => !v)} className={toolBtn(showCalculator)}>
                    <CalcIcon size={12} /> คิดเลข
                  </button>
                )}
                <button onClick={() => setShowFormulaSheet(v => !v)} className={toolBtn(showFormulaSheet)}>
                  <BookOpen size={12} /> สูตร
                </button>
                <button onClick={() => setShowScratchpad(v => !v)} className={toolBtn(showScratchpad)}>
                  <PenLine size={12} /> ทด
                </button>
                <button
                  onClick={() => setFocusMode(false)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Minimize2 size={12} /> ออก
                </button>
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
  config, showCalculator, showFormulaSheet, showScratchpad,
  onToggleCalc, onToggleFormula, onToggleScratch, onFocusMode, toolBtn,
}: {
  saving: boolean
  isOnline: boolean
  pendingSync: number
  tabSwitchCount: number
  proctorStatus: 'disabled' | 'connecting' | 'connected' | 'offline'
  proctorActiveConnectionCount: number
  config: ExamConfig
  showCalculator: boolean
  showFormulaSheet: boolean
  showScratchpad: boolean
  onToggleCalc: () => void
  onToggleFormula: () => void
  onToggleScratch: () => void
  onFocusMode: () => void
  toolBtn: (active: boolean) => string
}) {
  return (
    <Card className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
      {/* Left: Tool buttons */}
      <div className="flex items-center gap-2">
        {config.isCalculatorEnabled && (
          <button onClick={onToggleCalc} className={toolBtn(showCalculator)} title="เครื่องคิดเลขวิทยาศาสตร์">
            <CalcIcon size={13} />
            <span className="hidden sm:inline">คิดเลข</span>
          </button>
        )}
        <button onClick={onToggleFormula} className={toolBtn(showFormulaSheet)} title="สูตรและค่าคงที่">
          <BookOpen size={13} />
          <span className="hidden sm:inline">สูตร</span>
        </button>
        <button onClick={onToggleScratch} className={toolBtn(showScratchpad)} title="กระดาษทด">
          <PenLine size={13} />
          <span className="hidden sm:inline">ทด</span>
        </button>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-border" />

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

      {/* Right: Focus mode */}
      <button
        onClick={onFocusMode}
        className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Maximize2 size={13} />
        <span className="hidden sm:inline">โฟกัส</span>
      </button>
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
                  <img src={opt.image_url} alt="" className="max-h-28 w-auto object-contain rounded border shrink-0" />
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

function MultiPartAnswerInput({
  answerId, parts, questionText, labels, fallbackUnit, rawValue, onSingleChange, onPartChange,
  requiresWorkImage, workImages, onWorkImageChange,
}: {
  answerId: string
  parts: SafeAnswerPart[] | AnswerPart[] | null
  questionText?: string
  labels: string[]
  fallbackUnit: string | null
  rawValue: string
  onSingleChange: (val: string) => void
  onPartChange: (pi: number, val: string, total: number) => void
  requiresWorkImage: boolean
  workImages: (string | null)[]
  onWorkImageChange: (partIndex: number, url: string | null) => void
}) {
  const activeParts = parts && parts.length > 0 ? parts : null

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
                  <Input type="text" inputMode="text" placeholder="เช่น 10, 9+1, sqrt(100) หรือ sin(30)" value={getValue(i)}
                    onChange={e => setValue(i, e.target.value)} className="max-w-[140px] inline-block h-8" />
                  {part.unit && <UnitDisplay html={part.unit} />}
                </span>
              </span>
            )
          })}
        </div>
        {requiresWorkImage && (
          <WorkImageUpload
            value={workImages[0] ?? null}
            onChange={url => onWorkImageChange(0, url)}
            required
          />
        )}
      </div>
    )
  }

  if (!activeParts || activeParts.length === 1) {
    const unit = activeParts?.[0]?.unit ?? fallbackUnit ?? ''
    const blankSplit = questionText ? splitAnswerBlankHtml(questionText) : null
    const inputEl = (
      <Input type="text" inputMode="text" placeholder="เช่น 10, 9+1, sqrt(100) หรือ sin(30)" value={rawValue}
        onChange={e => onSingleChange(e.target.value)} className="max-w-[200px]" />
    )
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
        {requiresWorkImage && (
          <WorkImageUpload
            value={workImages[0] ?? null}
            onChange={url => onWorkImageChange(0, url)}
            required
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
            <Input type="text" inputMode="text" placeholder="เช่น 10, 9+1, sqrt(100) หรือ sin(30)" value={partValues[i] ?? ''}
              onChange={e => onPartChange(i, e.target.value, activeParts.length)} className="max-w-[200px]" />
            {part.unit && <UnitDisplay html={part.unit} />}
          </div>
          {requiresWorkImage && (
            <WorkImageUpload
              value={workImages[i] ?? null}
              onChange={url => onWorkImageChange(i, url)}
              required
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
function TrueFalseSelectMatching({ config, subStatements, mode, rawValue, onChange }: {
  config: TrueFalseConfig | SafeTrueFalseConfig | null
  subStatements: Array<TrueFalseStatement | SafeTrueFalseStatement>
  mode: TrueFalseExplanationMode
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
  const items = [null, ...subStatements]
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        ข้อใดต่อไปนี้{target === 'wrong' ? 'ผิด' : 'ถูกต้อง'}? <span className="text-xs text-muted-foreground font-normal">(เลือกได้มากกว่า 1 ข้อ)</span>
      </p>
      <div className="space-y-2">
        {items.map((st, i) => (
          <label key={i} className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 cursor-pointer transition-colors ${
            answers[i] === 'true' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
          }`}>
            <input type="checkbox" className="mt-0.5" checked={answers[i] === 'true'} onChange={() => toggle(i)} />
            <span className="flex items-center gap-1.5 flex-wrap text-sm">
              <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>
              {st && <RichText text={st.text} />}
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

function TrueFalseAnswerInput({ config, rawValue, onChange }: {
  answerId: string
  config: TrueFalseConfig | SafeTrueFalseConfig | null
  rawValue: string
  onChange: (v: string) => void
}) {
  const mode = config?.explanation_mode ?? 'none'
  const subStatements = config?.statements ?? []

  if (config?.answer_mode === 'select_matching') {
    return <TrueFalseSelectMatching config={config} subStatements={subStatements} mode={mode} rawValue={rawValue} onChange={onChange} />
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
      {[null, ...subStatements].map((st, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>
            {st && <RichText text={st.text} className="text-sm" />}
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

// ─── Matching ────────────────────────────────────────────────────────────────
// One dropdown per left-hand prompt, listing the whole (already shuffled)
// right-hand column. The answer is stored as the chosen right_text per prompt,
// in prompt order — the shape the 'MATCH:' branch in lib/assignment-attempt.ts
// grades against. Options are deliberately not struck off as they're used: a
// teacher may legitimately reuse a label across pairs.
function MatchingAnswerInput({ prompts, options, rawValue, onChange }: {
  prompts: Array<{ left_text?: string; left_image?: string }>
  options: Array<{ right_text: string; right_image?: string }>
  rawValue: string
  onChange: (v: string) => void
}) {
  let picked: string[] = []
  try { picked = rawValue ? JSON.parse(rawValue) : [] } catch { picked = [] }
  if (!Array.isArray(picked)) picked = []

  const filled = prompts.every((_, i) => picked[i])

  function update(index: number, value: string) {
    const next = prompts.map((_, i) => (i === index ? value : picked[i] ?? ''))
    onChange(JSON.stringify(next))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">จับคู่แต่ละข้อกับคำตอบที่ถูกต้อง:</p>
      <div className="space-y-2">
        {prompts.map((prompt, i) => (
          <Card radius="md" className="flex items-center gap-3 p-2.5" key={i}>
            {prompt.left_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prompt.left_image} alt="" className="w-12 h-12 object-contain rounded border shrink-0" />
            )}
            <span className="flex-1 min-w-0 text-sm"><RichText text={prompt.left_text ?? ''} /></span>
            <NativeSelect
              value={picked[i] ?? ''}
              onChange={e => update(i, e.target.value)}
              className="w-44 shrink-0"
            >
              <option value="">— เลือก —</option>
              {options.map((o, j) => (
                <option key={j} value={o.right_text}>{o.right_text}</option>
              ))}
            </NativeSelect>
          </Card>
        ))}
      </div>
      {filled && prompts.length > 0 && <p className="text-xs text-success">✓ จับคู่ครบแล้ว</p>}
    </div>
  )
}

function OrderingAnswerInput({ config, rawValue, onChange }: {
  answerId: string
  config: OrderingConfig | SafeOrderingConfig | null
  rawValue: string
  onChange: (v: string) => void
}) {
  const items: OrderingItem[] = config?.items ?? []
  const n = items.length
  const [shuffled] = useState<OrderingItem[]>(() => [...items].sort(() => Math.random() - 0.5))
  let sel: Record<string, string> = {}
  if (rawValue.startsWith('{')) { try { sel = JSON.parse(rawValue) } catch { sel = {} } }
  else if (rawValue.startsWith('[')) {
    try { const a: string[] = JSON.parse(rawValue); a.forEach((id, i) => { if (id) sel[id] = String(i + 1) }) } catch { sel = {} }
  }
  const hasdup = Object.values(sel).length !== new Set(Object.values(sel)).size
  const allFilled = shuffled.every(it => sel[it.id])
  function updateSel(itemId: string, pos: string) {
    const next = { ...sel }
    if (pos) next[itemId] = pos; else delete next[itemId]
    const filled = shuffled.every(it => next[it.id])
    const noDup  = Object.values(next).length === new Set(Object.values(next)).size
    if (filled && noDup) {
      const arr: string[] = Array(n).fill('')
      for (const [id, p] of Object.entries(next)) { const idx = parseInt(p) - 1; if (idx >= 0 && idx < n) arr[idx] = id }
      onChange(JSON.stringify(arr))
    } else { onChange(JSON.stringify(next)) }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">เลือกลำดับสำหรับแต่ละรายการ:</p>
      <div className="space-y-2">
        {shuffled.map(item => (
          <Card radius="md" className="flex items-center gap-3 p-2.5" key={item.id}>
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="w-10 h-10 object-contain rounded border flex-shrink-0" />
            )}
            <span className="flex-1 text-sm">{item.text}</span>
            <NativeSelect value={sel[item.id] ?? ''} onChange={e => updateSel(item.id, e.target.value)} className="w-20 text-center">
              <option value="">ลำดับ</option>
              {Array.from({ length: n }, (_, i) => <option key={i + 1} value={String(i + 1)}>ที่ {i + 1}</option>)}
            </NativeSelect>
          </Card>
        ))}
      </div>
      {hasdup     && <p className="text-xs text-flag bg-flag/10 px-3 py-1.5 rounded-lg">⚠️ มีลำดับซ้ำ</p>}
      {allFilled && !hasdup && <p className="text-xs text-success">✓ เลือกครบแล้ว</p>}
    </div>
  )
}

// ─── Composite ────────────────────────────────────────────────────────────────
// Renders each part (true_false / fill_blank / mcq / ordering) with the same
// input style its standalone question type uses. The whole answer is stored
// as one JSON array, one entry per part, in part order — see the 'COMP:'
// grading branch in lib/actions/submissions.ts for the matching shape.

function orderSelFromRaw(raw: string): Record<string, string> {
  if (raw.startsWith('{')) { try { return JSON.parse(raw) } catch { return {} } }
  if (raw.startsWith('[')) {
    try {
      const a: string[] = JSON.parse(raw)
      const sel: Record<string, string> = {}
      a.forEach((id, i) => { if (id) sel[id] = String(i + 1) })
      return sel
    } catch { return {} }
  }
  return {}
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

  const [shuffledByPart] = useState<OrderingItem[][]>(
    () => parts.map(p => p.items?.length ? [...p.items].sort(() => Math.random() - 0.5) : [])
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
            return (
              <>
                <RichText text={part.text} className="text-sm block" />
                <p className="text-xs text-muted-foreground">ข้อใดต่อไปนี้{target === 'wrong' ? 'ผิด' : 'ถูกต้อง'}? (เลือกได้มากกว่า 1 ข้อ)</p>
                <div className="space-y-1.5">
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
            if (!split) return <RichText text={part.text} className="text-sm block" />
            return (
              <p className="text-sm leading-loose">
                <RichText text={split[0]} />
                {type === 'dropdown' ? (
                  <NativeSelect value={answers[i] ?? ''} onChange={e => updatePart(i, e.target.value)} className="inline-block mx-1 border-b-2 border-primary bg-primary/10 text-center">
                    <option value="">เลือกคำตอบ</option>
                    {(blank.options ?? []).map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
                  </NativeSelect>
                ) : (
                  <Input type="text" value={answers[i] ?? ''} onChange={e => updatePart(i, e.target.value)} className="inline-block mx-1 w-28 border-b-2 border-primary bg-primary/10 text-center" />
                )}
                <RichText text={split[1]} />
              </p>
            )
          })()}

          {part.type === 'mcq' && (
            <>
              <RichText text={part.text} className="text-sm block" />
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
            const n = items.length
            const sel = orderSelFromRaw(answers[i] ?? '')
            function updateSel(itemId: string, pos: string) {
              const next = { ...sel }
              if (pos) next[itemId] = pos; else delete next[itemId]
              const filled = items.every(it => next[it.id])
              const noDup = Object.values(next).length === new Set(Object.values(next)).size
              if (filled && noDup) {
                const arr: string[] = Array(n).fill('')
                for (const [id, p] of Object.entries(next)) { const idx = parseInt(p) - 1; if (idx >= 0 && idx < n) arr[idx] = id }
                updatePart(i, JSON.stringify(arr))
              } else { updatePart(i, JSON.stringify(next)) }
            }
            return (
              <>
                <RichText text={part.text} className="text-sm block" />
                <div className="space-y-2">
                  {items.map(item => (
                    <Card radius="md" className="flex items-center gap-3 p-2" key={item.id}>
                      <RichText text={item.text} className="flex-1 text-sm" />
                      <NativeSelect value={sel[item.id] ?? ''} onChange={e => updateSel(item.id, e.target.value)} className="w-20 text-center">
                        <option value="">ลำดับ</option>
                        {Array.from({ length: n }, (_, oi) => <option key={oi + 1} value={String(oi + 1)}>ที่ {oi + 1}</option>)}
                      </NativeSelect>
                    </Card>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

// ─── File upload ──────────────────────────────────────────────────────────────

function FileUploadAnswerInput({ rawValue, onChange }: {
  rawValue: string; onChange: (files: SubmittedFile[]) => void
}) {
  let files: SubmittedFile[] = []
  try { files = rawValue ? JSON.parse(rawValue) : [] } catch { files = [] }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">แนบไฟล์คำตอบ (รูปภาพหรือ PDF)</p>
      <FileSubmissionUpload value={files} onChange={onChange} />
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

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveAnswer, submitSubmission } from '@/lib/actions/submissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Flag, Eye, EyeOff, Maximize2, Minimize2, CheckCircle2, AlertTriangle,
  Calculator as CalcIcon, BookOpen, PenLine, Wifi, WifiOff, ShieldAlert, Maximize,
} from 'lucide-react'
import { Calculator } from './calculator'
import { FormulaSheet } from './formula-sheet'
import { Scratchpad } from './scratchpad'
import type { AnswerPart, TrueFalseConfig, FillBlankConfig, OrderingConfig, OrderingItem } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

const PART_LABELS  = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ']
const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']
const LS_KEY = (id: string) => `korkru_exam_${id}`

interface AnswerRow {
  id: string
  question_id: string
  random_values: Record<string, number>
  correct_answer: string
  student_answer: string | null
  questions: {
    title: string
    question_text: string
    question_type: string
    answer_unit: string | null
    mcq_options: Array<{ text: string; is_correct: boolean }> | null
    variables: Array<{ name: string; unit?: string; type?: string }>
    answer_parts: AnswerPart[] | null
    extra_data: TrueFalseConfig | FillBlankConfig | OrderingConfig | null
    image_urls: string[] | null
  }
}

export interface ExamConfig {
  isCalculatorEnabled: boolean
  isFullscreenEnforced: boolean
}

interface Props {
  submissionId: string
  answers: AnswerRow[]
  durationMinutes: number | null
  startedAt: string
  config: ExamConfig
}

// ─── ExamClient ───────────────────────────────────────────────────────────────

function initLocalAnswers(answers: AnswerRow[]): Record<string, string> {
  return Object.fromEntries(answers.map(a => [a.id, a.student_answer ?? '']))
}

export function ExamClient({ submissionId, answers, durationMinutes, startedAt, config }: Props) {
  const router = useRouter()

  // ── Core state ──────────────────────────────────────────────────────────────
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>(
    () => initLocalAnswers(answers)
  )
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

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

  // ── Anti-cheat state ────────────────────────────────────────────────────────
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const tabWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showTabWarning, setShowTabWarning] = useState(false)

  // ── 1. Restore answers from LocalStorage on mount ───────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY(submissionId))
      if (saved) {
        const savedAnswers: Record<string, string> = JSON.parse(saved)
        // Merge: DB value takes priority, localStorage fills gaps
        setLocalAnswers(prev => {
          const merged: Record<string, string> = { ...savedAnswers }
          for (const [k, v] of Object.entries(prev)) {
            if (v !== '') merged[k] = v
          }
          return merged
        })
      }
    } catch { /* ignore corrupt data */ }
  }, [submissionId])

  // ── 2. Persist to LocalStorage whenever answers change ──────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY(submissionId), JSON.stringify(localAnswers))
    } catch { /* ignore quota errors */ }
  }, [localAnswers, submissionId])

  // ── 3. Online / Offline detection + auto-sync ───────────────────────────────
  useEffect(() => {
    const onOnline = async () => {
      setIsOnline(true)
      if (pendingSync.size === 0) return
      toast.info(`กำลังซิงก์คำตอบ ${pendingSync.size} ข้อ...`)
      const ids = [...pendingSync]
      for (const id of ids) {
        const val = localAnswers[id]
        if (val !== undefined) {
          await saveAnswer(id, val).catch(() => null)
        }
      }
      setPendingSync(new Set())
      toast.success('ซิงก์คำตอบสำเร็จ ✓')
    }
    const onOffline = () => {
      setIsOnline(false)
      toast.warning('อินเทอร์เน็ตหลุด — บันทึกในเครื่องแล้ว จะซิงก์อัตโนมัติเมื่อเน็ตกลับมา')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSync, localAnswers])

  // ── 4. Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!durationMinutes) return
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    const remaining = Math.max(0, durationMinutes * 60 - elapsed)
    setSecondsLeft(remaining)
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 5. Anti-cheat: tab visibility ───────────────────────────────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(n => n + 1)
        setShowTabWarning(true)
        if (tabWarningTimer.current) clearTimeout(tabWarningTimer.current)
        tabWarningTimer.current = setTimeout(() => setShowTabWarning(false), 4000)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (tabWarningTimer.current) clearTimeout(tabWarningTimer.current)
    }
  }, [])

  // ── 6. Anti-cheat: fullscreen monitoring ────────────────────────────────────
  useEffect(() => {
    if (!config.isFullscreenEnforced) return
    const onChange = () => {
      const inFS = !!document.fullscreenElement
      setIsFullscreen(inFS)
      if (!inFS) setShowFullscreenWarning(true)
    }
    document.addEventListener('fullscreenchange', onChange)
    // Trigger fullscreen on mount
    document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [config.isFullscreenEnforced])

  // ── 7. Submit countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (submitCountdown <= 0) return
    const t = setTimeout(() => setSubmitCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [submitCountdown])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAnswerChange = useCallback(async (answerId: string, value: string) => {
    setLocalAnswers(prev => ({ ...prev, [answerId]: value }))
    if (!navigator.onLine) {
      setPendingSync(prev => new Set([...prev, answerId]))
      return
    }
    setSaving(true)
    try {
      await saveAnswer(answerId, value)
    } catch {
      setPendingSync(prev => new Set([...prev, answerId]))
    }
    setSaving(false)
  }, [])

  const handlePartAnswerChange = useCallback(async (
    answerId: string, partIndex: number, value: string, totalParts: number, currentRaw: string,
  ) => {
    let arr: string[] = []
    try { arr = JSON.parse(currentRaw || '[]') } catch { arr = [] }
    while (arr.length < totalParts) arr.push('')
    arr[partIndex] = value
    await handleAnswerChange(answerId, JSON.stringify(arr))
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
    const result = await submitSubmission(submissionId)
    if (result?.error) {
      toast.error(result.error)
      setSubmitting(false)
      return
    }
    localStorage.removeItem(LS_KEY(submissionId))
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    router.push(`/submissions/${submissionId}`)
  }

  function openSubmitDialog() {
    setShowSubmitConfirm(true)
    setSubmitCountdown(3)
  }

  function enterFullscreen() {
    document.documentElement.requestFullscreen()
      .then(() => { setIsFullscreen(true); setShowFullscreenWarning(false) })
      .catch(() => toast.error('ไม่สามารถเข้าสู่โหมดเต็มจอได้'))
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  function hasAnswered(answerId: string): boolean {
    const raw = localAnswers[answerId] ?? ''
    if (raw.startsWith('[')) {
      try { return (JSON.parse(raw) as string[]).some(v => v.trim() !== '') } catch { return false }
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

  // ── Toolbar buttons ───────────────────────────────────────────────────────────

  const toolBtn = (active: boolean) =>
    `flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
      active
        ? 'bg-blue-600/15 border-blue-500/40 text-blue-600 dark:text-blue-400'
        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
    }`

  // ── Exam body (shared between normal + focus mode) ────────────────────────────

  const examBody = (
    <div className="flex gap-4 h-full min-h-0">

      {/* LEFT: Question */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto">

        {/* Question card */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">ข้อ {currentIndex + 1} / {answers.length}</Badge>
            {current.questions.question_type === 'mcq' && (
              <Badge variant="outline" className="text-xs">ปรนัย</Badge>
            )}
            {isFlagged && (
              <Badge className="text-xs bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30">
                🚩 ปักธงไว้
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => toggleFlag(current.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                  isFlagged
                    ? 'bg-orange-500/15 border-orange-500/30 text-orange-600 dark:text-orange-400'
                    : 'border-border text-muted-foreground hover:border-orange-400 hover:text-orange-500'
                }`}
              >
                <Flag size={11} className={isFlagged ? 'fill-orange-500' : ''} />
                {isFlagged ? 'ยกเลิกธง' : 'ปักธง'}
              </button>
            </div>
          </div>

          {current.questions.question_type !== 'fill_blank' && (
            <QuestionText
              text={interpolateValues(
                current.questions.question_text,
                current.random_values,
                current.questions.variables,
              )}
            />
          )}

          {(current.questions.image_urls ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(current.questions.image_urls ?? []).map(url => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="รูปประกอบ" className="max-h-52 rounded-xl border object-contain" />
              ))}
            </div>
          )}

          {Object.keys(current.random_values).length > 0 && (
            <div className="bg-muted/40 rounded-xl p-3 border border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">ค่าที่กำหนด</p>
              <div className="flex flex-wrap gap-2">
                {current.questions.variables
                  .filter((v) => v.type !== 'reference')
                  .map(v => (
                    <span key={v.name} className="text-sm font-mono bg-background border rounded-lg px-2.5 py-1">
                      {v.name} = {current.random_values[v.name]}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Answer inputs */}
        <div className="bg-card border rounded-2xl p-5">
          {current.questions.question_type === 'mcq' && current.questions.mcq_options ? (
            <MCQInput
              answerId={current.id}
              options={current.questions.mcq_options}
              selected={localAnswers[current.id] ?? ''}
              eliminatedSet={eliminated[current.id] ?? new Set()}
              onSelect={val => handleAnswerChange(current.id, val)}
              onToggleEliminate={i => toggleEliminate(current.id, i)}
            />
          ) : current.questions.question_type === 'true_false' ? (
            <TrueFalseAnswerInput
              answerId={current.id}
              config={current.questions.extra_data as TrueFalseConfig}
              rawValue={localAnswers[current.id] ?? ''}
              onChange={val => handleAnswerChange(current.id, val)}
            />
          ) : current.questions.question_type === 'fill_blank' ? (
            <FillBlankAnswerInput
              questionText={current.questions.question_text}
              config={current.questions.extra_data as FillBlankConfig}
              rawValue={localAnswers[current.id] ?? ''}
              onChange={val => handleAnswerChange(current.id, val)}
            />
          ) : current.questions.question_type === 'ordering' ? (
            <OrderingAnswerInput
              answerId={current.id}
              config={current.questions.extra_data as OrderingConfig}
              rawValue={localAnswers[current.id] ?? ''}
              onChange={val => handleAnswerChange(current.id, val)}
            />
          ) : (
            <MultiPartAnswerInput
              answerId={current.id}
              parts={current.questions.answer_parts}
              fallbackUnit={current.questions.answer_unit}
              rawValue={localAnswers[current.id] ?? ''}
              onSingleChange={val => handleAnswerChange(current.id, val)}
              onPartChange={(pi, val, total) =>
                handlePartAnswerChange(current.id, pi, val, total, localAnswers[current.id] ?? '')}
            />
          )}
        </div>

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
              className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0"
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
              ? 'border-red-500 bg-red-500/10 animate-pulse'
              : timerUrgent
              ? 'border-orange-400 bg-orange-500/8'
              : 'bg-card'
          }`}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">เวลาที่เหลือ</p>
            <p className={`text-3xl font-black font-mono ${
              timerDanger ? 'text-red-600 dark:text-red-400' :
              timerUrgent ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'
            }`}>
              {formatTime(secondsLeft)}
            </p>
            {timerUrgent && (
              <p className="text-[10px] text-orange-500 mt-1 flex items-center justify-center gap-1">
                <AlertTriangle size={9} /> เหลือน้อยแล้ว
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="bg-card border rounded-2xl p-4 space-y-2">
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
              <span className="flex items-center gap-0.5 text-orange-500">
                <Flag size={9} className="fill-orange-500" /> {flaggedCount}
              </span>
            )}
            {saving && <span className="ml-auto animate-pulse">กำลังบันทึก...</span>}
            {!isOnline && (
              <span className="flex items-center gap-0.5 text-amber-500 ml-auto">
                <WifiOff size={9} /> ออฟไลน์
              </span>
            )}
          </div>
        </div>

        {/* Nav grid */}
        <div className="bg-card border rounded-2xl p-4 flex-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">นำทางข้อ</p>
          <div className="grid grid-cols-5 gap-1.5">
            {answers.map((a, i) => {
              const isCur = i === currentIndex
              const isAns = hasAnswered(a.id)
              const isFlg = flagged.has(a.id)
              let cls = 'bg-muted text-muted-foreground'
              if (isCur)      cls = 'bg-blue-600 text-white shadow-md shadow-blue-600/40 scale-110 z-10'
              else if (isFlg) cls = 'bg-orange-500 text-white'
              else if (isAns) cls = 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
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
          <div className="mt-3 border-t pt-3 space-y-1.5">
            {[
              { cls: 'bg-blue-600', label: 'ข้อปัจจุบัน' },
              { cls: 'bg-green-100 border border-green-300 dark:bg-green-900/30', label: 'ตอบแล้ว' },
              { cls: 'bg-orange-500', label: 'ปักธง' },
              { cls: 'bg-muted', label: 'ยังไม่ตอบ' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-sm shrink-0 ${l.cls}`} />
                <span className="text-[10px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Anti-cheat counter */}
        {tabSwitchCount > 0 && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-xl px-3 py-2 flex items-center gap-2">
            <ShieldAlert size={14} className="text-red-500 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-red-600 dark:text-red-400">สลับแท็บ {tabSwitchCount} ครั้ง</p>
              <p className="text-[9px] text-muted-foreground">ระบบบันทึกไว้แล้ว</p>
            </div>
          </div>
        )}

        <Button
          onClick={openSubmitDialog}
          disabled={submitting}
          className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
        >
          {submitting ? 'กำลังส่ง...' : 'ส่งคำตอบ ✓'}
        </Button>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Fullscreen warning overlay ─────────────────────────────────────── */}
      {config.isFullscreenEnforced && showFullscreenWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/95 backdrop-blur-sm">
          <div className="text-center max-w-md px-8">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-5">
              <ShieldAlert size={40} className="text-red-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">⚠️ ออกจากโหมดเต็มจอ</h2>
            <p className="text-red-300 text-sm mb-6">
              ระบบตรวจจับว่าคุณออกจากโหมดเต็มจอ<br />
              กรุณากลับสู่โหมดเต็มจอเพื่อทำข้อสอบต่อ
            </p>
            <button
              onClick={enterFullscreen}
              className="bg-red-500 hover:bg-red-400 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2 mx-auto"
            >
              <Maximize size={18} />
              กลับสู่โหมดเต็มจอ
            </button>
            <p className="text-red-500/60 text-xs mt-4">เหตุการณ์นี้ถูกบันทึกไว้ในระบบ</p>
          </div>
        </div>
      )}

      {/* ── Tab switch warning toast ───────────────────────────────────────── */}
      {showTabWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] bg-red-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-semibold">
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

      {/* ── Normal mode ────────────────────────────────────────────────────── */}
      {!focusMode && (
        <div className="flex flex-col gap-3">
          {/* Toolbar */}
          <ExamToolbar
            saving={saving}
            isOnline={isOnline}
            pendingSync={pendingSync.size}
            tabSwitchCount={tabSwitchCount}
            config={config}
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
      {focusMode && (
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <h3 className="font-bold text-lg">ยืนยันการส่งข้อสอบ</h3>

              <div className="mt-4 space-y-2 text-sm text-left bg-muted/40 rounded-xl p-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ตอบแล้ว</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{answeredCount} / {answers.length} ข้อ</span>
                </div>
                {unanswered > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ยังไม่ตอบ</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{unanswered} ข้อ</span>
                  </div>
                )}
                {flaggedCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ปักธงไว้</span>
                    <span className="font-semibold text-orange-500">{flaggedCount} ข้อ</span>
                  </div>
                )}
                {tabSwitchCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ShieldAlert size={12} /> สลับแท็บ
                    </span>
                    <span className="font-semibold text-red-500">{tabSwitchCount} ครั้ง</span>
                  </div>
                )}
              </div>

              {(unanswered > 0 || flaggedCount > 0) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center justify-center gap-1">
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
                className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0 transition-all"
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
          </div>
        </div>
      )}
    </>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function ExamToolbar({
  saving, isOnline, pendingSync, tabSwitchCount,
  config, showCalculator, showFormulaSheet, showScratchpad,
  onToggleCalc, onToggleFormula, onToggleScratch, onFocusMode, toolBtn,
}: {
  saving: boolean
  isOnline: boolean
  pendingSync: number
  tabSwitchCount: number
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
    <div className="bg-card border rounded-2xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
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
          <span className="text-amber-500 flex items-center gap-1">
            <WifiOff size={11} /> รอซิงก์ {pendingSync}
          </span>
        ) : isOnline ? (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <Wifi size={11} /> บันทึกอัตโนมัติ
          </span>
        ) : (
          <span className="text-amber-500 flex items-center gap-1">
            <WifiOff size={11} /> ออฟไลน์
          </span>
        )}
        {tabSwitchCount > 0 && (
          <span className="text-red-500 flex items-center gap-1">
            <ShieldAlert size={11} /> สลับแท็บ {tabSwitchCount}×
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
    </div>
  )
}

// ─── MCQ Input ────────────────────────────────────────────────────────────────

function MCQInput({
  answerId, options, selected, eliminatedSet, onSelect, onToggleEliminate,
}: {
  answerId: string
  options: Array<{ text: string; is_correct: boolean }>
  selected: string
  eliminatedSet: Set<number>
  onSelect: (val: string) => void
  onToggleEliminate: (i: number) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">เลือกคำตอบ</p>
      {options.map((opt, i) => {
        const isSelected  = selected === opt.text
        const isEliminated = eliminatedSet.has(i)
        return (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-xl border-2 transition-all ${
              isEliminated
                ? 'opacity-35 border-dashed border-border'
                : isSelected
                ? 'border-blue-500 bg-blue-500/8 dark:bg-blue-500/10'
                : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            <label className="flex items-center gap-3 p-3 cursor-pointer flex-1 min-w-0">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                isSelected ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground/40'
              }`}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <span className="font-bold text-sm text-muted-foreground shrink-0 w-5">{CHOICE_LABELS[i]}</span>
              <span className={`text-sm flex-1 ${isEliminated ? 'line-through text-muted-foreground' : ''}`}>
                {opt.text}
              </span>
              <input
                type="radio"
                className="sr-only"
                name={`answer-${answerId}`}
                value={opt.text}
                checked={isSelected}
                onChange={() => !isEliminated && onSelect(opt.text)}
              />
            </label>
            <button
              onClick={() => onToggleEliminate(i)}
              className={`p-2 mr-2 rounded-lg transition-all shrink-0 ${
                isEliminated ? 'text-red-500 bg-red-500/10' : 'text-muted-foreground hover:text-red-400 hover:bg-muted'
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
  answerId, parts, fallbackUnit, rawValue, onSingleChange, onPartChange,
}: {
  answerId: string
  parts: AnswerPart[] | null
  fallbackUnit: string | null
  rawValue: string
  onSingleChange: (val: string) => void
  onPartChange: (pi: number, val: string, total: number) => void
}) {
  const activeParts = parts && parts.length > 0 ? parts : null
  if (!activeParts || activeParts.length === 1) {
    const unit = activeParts?.[0]?.unit ?? fallbackUnit ?? ''
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium">คำตอบ</label>
        <div className="flex items-center gap-2">
          <Input type="number" step="any" placeholder="ใส่คำตอบ..." value={rawValue}
            onChange={e => onSingleChange(e.target.value)} className="max-w-[200px]" />
          {unit && <UnitDisplay html={unit} />}
        </div>
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
            {PART_LABELS[i] ?? i + 1})
            {part.sub_text && <span className="font-normal text-muted-foreground ml-1">{part.sub_text}</span>}
          </label>
          <div className="flex items-center gap-2">
            <Input type="number" step="any" placeholder="ใส่คำตอบ..." value={partValues[i] ?? ''}
              onChange={e => onPartChange(i, e.target.value, activeParts.length)} className="max-w-[200px]" />
            {part.unit && <UnitDisplay html={part.unit} />}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── True/False ───────────────────────────────────────────────────────────────

function TrueFalseAnswerInput({ config, rawValue, onChange }: {
  answerId: string; config: TrueFalseConfig | null; rawValue: string; onChange: (v: string) => void
}) {
  let tfAnswer = rawValue; let explanation = ''
  if (rawValue.startsWith('{')) {
    try { const p = JSON.parse(rawValue); tfAnswer = p.answer ?? ''; explanation = p.explanation ?? '' } catch { /* */ }
  }
  const mode = config?.explanation_mode ?? 'none'
  function update(a: string, exp: string) {
    mode === 'none' ? onChange(a) : onChange(JSON.stringify({ answer: a, explanation: exp }))
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">ข้อความนี้ถูกหรือผิด?</p>
      <div className="flex gap-3">
        {([
          { val: 'true',  label: '✓ ถูก', cls: 'border-green-500 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400' },
          { val: 'false', label: '✗ ผิด', cls: 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400' },
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
          <textarea value={explanation} onChange={e => update(tfAnswer, e.target.value)} rows={3}
            placeholder="พิมพ์เหตุผล..." className="w-full border border-input rounded-xl p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
          <p className="text-xs text-amber-600">ครูจะตรวจและให้คะแนนด้วยมือ</p>
        </div>
      )}
    </div>
  )
}

// ─── Fill-blank ───────────────────────────────────────────────────────────────

function FillBlankAnswerInput({ questionText, config, rawValue, onChange }: {
  questionText: string; config: FillBlankConfig | null; rawValue: string; onChange: (v: string) => void
}) {
  const blanks = config?.blanks ?? []
  const parts  = questionText.split('[___]')
  let ans: string[] = []
  try { ans = JSON.parse(rawValue || '[]') } catch { ans = [] }
  while (ans.length < blanks.length) ans.push('')
  function updateBlank(i: number, val: string) {
    const next = [...ans]; next[i] = val; onChange(JSON.stringify(next))
  }
  return (
    <div className="leading-loose text-sm">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < blanks.length && (
            <input type="text" value={ans[i] ?? ''} onChange={e => updateBlank(i, e.target.value)}
              className="inline-block mx-1 px-2 py-0.5 w-28 border-b-2 border-blue-400 bg-blue-50 dark:bg-blue-950/40 rounded text-sm text-center focus:outline-none focus:border-blue-600"
              placeholder={`ช่อง ${i + 1}`} />
          )}
        </span>
      ))}
    </div>
  )
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

function OrderingAnswerInput({ config, rawValue, onChange }: {
  answerId: string; config: OrderingConfig | null; rawValue: string; onChange: (v: string) => void
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
          <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl border bg-card">
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="w-10 h-10 object-contain rounded border flex-shrink-0" />
            )}
            <span className="flex-1 text-sm">{item.text}</span>
            <select value={sel[item.id] ?? ''} onChange={e => updateSel(item.id, e.target.value)}
              className="h-8 w-20 border border-input rounded-lg px-1 text-sm text-center bg-background">
              <option value="">ลำดับ</option>
              {Array.from({ length: n }, (_, i) => <option key={i + 1} value={String(i + 1)}>ที่ {i + 1}</option>)}
            </select>
          </div>
        ))}
      </div>
      {hasdup     && <p className="text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-lg">⚠️ มีลำดับซ้ำ</p>}
      {allFilled && !hasdup && <p className="text-xs text-green-600 dark:text-green-400">✓ เลือกครบแล้ว</p>}
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
  return /<[a-z][\s\S]*>/i.test(html)
    ? <span className="text-sm text-muted-foreground [&_p]:inline" dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="text-sm text-muted-foreground">{html}</span>
}

function QuestionText({ text }: { text: string }) {
  // Support: HTML, MathML (<math>), plain text
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return (
      <div
        className="leading-relaxed rich-text-content text-base [&_math]:my-1 [&_math]:inline-block"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    )
  }
  return <p className="leading-relaxed whitespace-pre-line text-base">{text}</p>
}

'use client'

import Link from 'next/link'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Calculator, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, LoaderCircle, Maximize, Minimize, PenLine } from 'lucide-react'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ExamToolbarDock } from '@/components/exam/exam-toolbar-dock'
import { ExamQuestionNavigation, ExamQuestionNavigationLegend, type ExamNavigationItem } from '@/components/exam/exam-question-navigation'
import { PracticeQuestionRunner, type PracticeQuestionHandle } from './practice-question-runner'
import { PracticeExerciseSummary } from './practice-exercise-summary'
import { practiceRunSummary, type PracticeRunState } from '@/lib/practice-run-summary'
import { getPracticeRunQuestion } from '@/lib/actions/practice-exercises'
import { defaultPracticeExerciseSettings, practiceExercisePage, readPracticeExerciseSettings } from '@/lib/practice-exercise-settings'
import { practiceLocalReviewSchema, localPracticeExercises } from '@/lib/practice-local-review'
import { PRACTICE_FLAG_DESCRIPTION, type PracticeRunQuestion, type PracticeRunQuestionLoader, type PracticeRunAnswerAction } from '@/lib/practice-run'
import type { PracticeExercise } from '@/lib/practice-exercises'
import type { PracticeQuestionListItem, StudentPracticeLibrary } from '@/lib/practice-question-access.server'
import type { PracticeFeedback } from '@/lib/practice-question'
import type { MathInputMode } from '@/lib/types'
import { DEFAULT_FINGER_INPUT_MODE, type FingerInputMode } from '@/lib/drawing-board-input'
import { cn } from '@/lib/utils'
import { readPracticeVisibleValues, rememberPracticeVisibleValues } from '@/lib/practice-visible-variant'
import { visibleRandomValueStorage } from '@/lib/math/visible-random-values'

const ScientificCalculator = lazy(() => import('@/components/exam/scientific-calculator'))
const Scratchpad = lazy(() => import('@/components/exam/scratchpad'))
const EMPTY_LOCAL_ITEMS: PracticeQuestionListItem[] = []

export function PracticeExerciseRunner({ library, exerciseId, storageOwnerId, exercise: serverExercise, localItems = EMPTY_LOCAL_ITEMS, localReview = false, returnHref, questionLoader = getPracticeRunQuestion, checkAction }: {
  library: StudentPracticeLibrary
  exerciseId: string
  storageOwnerId: string
  exercise?: PracticeExercise
  localItems?: PracticeQuestionListItem[]
  localReview?: boolean
  returnHref: string
  questionLoader?: PracticeRunQuestionLoader
  checkAction?: PracticeRunAnswerAction
}) {
  const [exercise, setExercise] = useState(serverExercise)
  const [settings, setSettings] = useState(defaultPracticeExerciseSettings(exerciseId))
  const [ready, setReady] = useState(false)
  const [fatalError, setFatalError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cache, setCache] = useState<Record<string, PracticeRunQuestion>>({})
  const cacheRef = useRef(cache)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [reloadNonce, setReloadNonce] = useState(0)
  const [states, setStates] = useState<Record<string, PracticeRunState>>({})
  const visibleValues = useRef<Record<string, Record<string, number>>>({})
  const questionHandles = useRef<Record<string, PracticeQuestionHandle>>({})
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [submitError, setSubmitError] = useState('')
  const [completed, setCompleted] = useState(false)
  const [summaryStates, setSummaryStates] = useState<Record<string, PracticeRunState>>({})
  const [confirm, confirmDialog] = useConfirm()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const mobileNavigationRef = useRef<HTMLDivElement>(null)
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const [flags, setFlags] = useState(new Set<string>())
  const rootRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [toolError, setToolError] = useState('')
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [calculatorLoaded, setCalculatorLoaded] = useState(false)
  const [calculatorMode, setCalculatorMode] = useState<MathInputMode>('deg')
  const [calculatorResult, setCalculatorResult] = useState<{ questionId: string; value: string; nonce: number }>()
  const [scratchpadOpen, setScratchpadOpen] = useState(false)
  const [scratchpadLoaded, setScratchpadLoaded] = useState(false)
  const [fingerInputMode, setFingerInputMode] = useState<FingerInputMode>(DEFAULT_FINGER_INPUT_MODE)

  useEffect(() => {
    try {
      const saved = readPracticeExerciseSettings(localStorage, storageOwnerId, library.id)
      setSettings(saved[exerciseId] ?? defaultPracticeExerciseSettings(exerciseId))
      if (localReview) {
        const raw: unknown = JSON.parse(localStorage.getItem(`korkru:practice-local-review:${storageOwnerId}:${library.id}`) || '{"exercises":[],"pinnedQuestionIds":[]}')
        const stored = practiceLocalReviewSchema.parse(raw)
        const found = localPracticeExercises(stored, localItems).find(group => group.id === exerciseId)
        if (!found) { setFatalError('ไม่พบแบบฝึกหัดนี้ในเบราว์เซอร์ หรือโจทย์ไม่อยู่ในคลังที่เข้าถึงได้แล้ว'); return }
        setExercise(found)
      }
      setReady(true)
    } catch { setFatalError('ยังอ่านแบบฝึกหัดในเบราว์เซอร์ไม่ได้ กรุณากลับไปคลังฝึกแล้วลองอีกครั้ง') }
  }, [exerciseId, library.id, storageOwnerId, localReview, localItems])

  const ids = exercise?.questionIds ?? []
  const page = practiceExercisePage(ids, currentIndex, settings.questionsPerPage)
  const pageKey = page.ids.join(',')
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    for (const id of page.ids) {
      if (cacheRef.current[id]) continue
      const previous = visibleValues.current[id] ?? readPracticeVisibleValues(visibleRandomValueStorage(), storageOwnerId, library.id, id)
      void questionLoader(library.id, id, previous).then(result => {
        if (cancelled) return
        if (!result.ok) { setErrors(previous => ({ ...previous, [id]: result.error })); return }
        cacheRef.current = { ...cacheRef.current, [id]: result.data }
        visibleValues.current[id] = result.data.question.random_values
        rememberPracticeVisibleValues(visibleRandomValueStorage(), storageOwnerId, library.id, id, result.data.question.random_values)
        setCache(cacheRef.current)
        setErrors(previous => { const next = { ...previous }; delete next[id]; return next })
      }).catch(() => { if (!cancelled) setErrors(previous => ({ ...previous, [id]: 'การเชื่อมต่อสะดุด กรุณาลองเปิดโจทย์อีกครั้ง' })) })
    }
    return () => { cancelled = true }
  }, [ready, pageKey, library.id, storageOwnerId, questionLoader, reloadNonce])

  const onProgress = useCallback((id: string, answered: boolean, verdict?: PracticeFeedback['verdict']) => {
    setStates(previous => previous[id]?.answered === answered && previous[id]?.verdict === verdict ? previous : { ...previous, [id]: { answered, verdict } })
  }, [])
  function reloadQuestion(id: string) {
    if (calculatorResult?.questionId === id) setCalculatorResult(undefined)
    const next = { ...cacheRef.current }; delete next[id]
    cacheRef.current = next; setCache(next)
    setErrors(previous => { const next = { ...previous }; delete next[id]; return next })
    setReloadNonce(previous => previous + 1)
  }
  function navigate(index: number) {
    setCompleted(false)
    setMobileNavigationOpen(false)
    setCurrentIndex(index)
    requestAnimationFrame(() => {
      const target = document.getElementById(`practice-run-${ids[index]}`)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
  }
  useEffect(() => {
    if (!mobileNavigationOpen || submitOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !mobileNavigationRef.current?.contains(event.target) && !mobileNavigationTriggerRef.current?.contains(event.target)) setMobileNavigationOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileNavigationOpen(false); mobileNavigationTriggerRef.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [mobileNavigationOpen, submitOpen])
  useEffect(() => {
    if (!completed) return
    // Let the submit dialog finish returning focus before announcing the summary.
    const timer = window.setTimeout(() => summaryRef.current?.focus(), 150)
    return () => window.clearTimeout(timer)
  }, [completed])
  useEffect(() => {
    const onFullscreen = () => setFocused(document.fullscreenElement === document.documentElement)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])
  async function toggleFocus() {
    try {
      setToolError('')
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { setToolError('เบราว์เซอร์นี้ยังเปิดโหมดโฟกัสไม่ได้') }
  }
  const activeId = ids[currentIndex]
  const activeQuestion = cache[activeId]
  // A freshly loaded question can only narrow the library's authorized tool settings.
  const calculatorEnabled = library.calculatorEnabled && activeQuestion?.calculatorEnabled === true
  const scratchpadEnabled = library.scratchpadEnabled && activeQuestion?.scratchpadEnabled === true
  const checkedCount = ids.filter(id => Boolean(states[id]?.verdict)).length
  const summary = practiceRunSummary(ids, states)
  const navigation: ExamNavigationItem[] = ids.map((id, index) => ({
    current: index >= page.start && index < page.start + page.ids.length,
    answered: states[id]?.answered ?? false, flagged: flags.has(id), verdict: states[id]?.verdict,
  }))
  const preset = COVER_PRESETS.find(color => color.id === settings.theme) ?? COVER_PRESETS[0]
  async function submitAnswers() {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitOpen(false)
    setSubmitError('')
    setCalculatorOpen(false)
    setScratchpadOpen(false)
    const nextStates = { ...states }
    try {
      for (const id of ids) {
        if (!states[id]?.answered || states[id]?.verdict) continue
        const verdict = await questionHandles.current[id]?.check()
        if (!verdict) {
          setSubmitError(`ยังส่งคำตอบข้อ ${ids.indexOf(id) + 1} ไม่สำเร็จ กรุณาตรวจสอบแล้วส่งอีกครั้ง`)
          navigate(ids.indexOf(id))
          return
        }
        nextStates[id] = { answered: true, verdict }
      }
      setSummaryStates(nextStates)
      setCompleted(true)
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'start' }))
    } catch {
      setSubmitError('การส่งคำตอบสะดุด กรุณาลองอีกครั้ง คำตอบที่กรอกไว้ยังอยู่')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  const submitButton = <Button size="sm" onClick={() => setSubmitOpen(true)} disabled={submitting} className="w-full bg-success text-success-foreground hover:bg-success/90 pointer-coarse:min-h-11">
    {submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{submitting ? 'กำลังส่ง…' : 'ส่งคำตอบ'}
  </Button>
  const renderNavigation = () => <>
    <Card padding="sm" radius="md" className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs"><span>ตอบแล้ว {summary.answered}/{ids.length} ข้อ</span><span>หน้า {page.page}/{page.totalPages}</span></div>
      <Progress value={ids.length ? summary.answered / ids.length * 100 : 0} aria-label="จำนวนข้อที่ตอบแล้ว" />
      <p className="text-[10px] text-muted-foreground">ตรวจแล้ว {checkedCount}/{ids.length} ข้อ</p>
    </Card>
    <Card radius="md" className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold"><ListChecks className="size-3.5 text-primary" aria-hidden="true" />นำทางข้อ</h2>
        <span className="text-[10px] text-muted-foreground">{flags.size ? `ปักธง ${flags.size}` : `${ids.length} ข้อ`}</span>
      </div>
      <div className="min-h-0 max-h-48 overflow-y-auto overscroll-contain p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:max-h-none" tabIndex={0} role="region" aria-label="เลือกข้อที่ต้องการทำ">
        <ExamQuestionNavigation items={navigation} onNavigate={navigate} />
      </div>
      <div className="shrink-0 border-t px-3 py-2.5"><ExamQuestionNavigationLegend instantCheck flagDescription={PRACTICE_FLAG_DESCRIPTION} /></div>
      <div className="shrink-0 border-t bg-muted/20 p-3">{submitButton}</div>
    </Card>
  </>
  if (fatalError || (ready && !exercise)) return <Card padding="sm"><p role="alert" className="text-sm text-destructive">{fatalError || 'ไม่พบแบบฝึกหัดนี้'}</p><Button variant="link" size="sm" render={<Link href={returnHref} />}>กลับไปคลังฝึก</Button></Card>
  if (!ready || !exercise) return <p role="status" className="text-sm text-muted-foreground">กำลังเปิดแบบฝึกหัด…</p>

  return <div ref={rootRef} data-exam-normal-stage data-practice-exercise-stage className={cn('flex min-w-0 w-full flex-col gap-3 bg-background', focused && 'fixed inset-0 z-40 overflow-y-auto p-3')}>
    {completed && <div ref={summaryRef} tabIndex={-1} className="outline-none"><PracticeExerciseSummary title={exercise.title} ids={ids} questionTitles={exercise.questionTitles} states={summaryStates} returnHref={returnHref} onReview={navigate} /></div>}
    <Collapsible open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen} className={cn('flex min-w-0 flex-col gap-3', completed && 'hidden')}>
    <ExamToolbarDock>
      <Card padding="sm" radius="md" className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
        <Button variant="ghost" size="icon-sm" render={<Link href={returnHref} />} aria-label="กลับไปคลังฝึก"><ArrowLeft aria-hidden="true" /></Button>
        <div className="min-w-0 flex-1"><p className="truncate text-xs text-muted-foreground">{library.title}</p><h1 className="truncate text-base font-semibold">{exercise.title}</h1></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
        <CollapsibleTrigger ref={mobileNavigationTriggerRef} render={<Button variant="outline" size="sm" aria-label="นำทางข้อ" title="นำทางข้อ" className="size-7 px-0 lg:hidden pointer-coarse:size-11" />}><ListChecks aria-hidden="true" /></CollapsibleTrigger>
        <Button variant="outline" size="sm" aria-label={focused ? 'ออกจากโฟกัส' : 'โหมดโฟกัส'} title={focused ? 'ออกจากโฟกัส' : 'โหมดโฟกัส'} className="size-7 px-0 sm:w-auto sm:px-2.5 pointer-coarse:size-11 sm:pointer-coarse:w-auto" onClick={() => void toggleFocus()}>{focused ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}<span className="hidden sm:inline">{focused ? 'ออกจากโฟกัส' : 'โหมดโฟกัส'}</span></Button>
        {calculatorEnabled && <Button variant="outline" size="sm" aria-label="เครื่องคิดเลข" title="เครื่องคิดเลข" className="size-7 px-0 sm:w-auto sm:px-2.5 pointer-coarse:size-11 sm:pointer-coarse:w-auto" onClick={() => { setCalculatorLoaded(true); setCalculatorOpen(true) }}><Calculator aria-hidden="true" /><span className="hidden sm:inline">เครื่องคิดเลข</span></Button>}
        {scratchpadEnabled && <Button variant="outline" size="sm" aria-label="กระดาษทด" title="กระดาษทด" className="size-7 px-0 sm:w-auto sm:px-2.5 pointer-coarse:size-11 sm:pointer-coarse:w-auto" onClick={() => { setScratchpadLoaded(true); setScratchpadOpen(true) }}><PenLine aria-hidden="true" /><span className="hidden sm:inline">กระดาษทด</span></Button>}
        </div>
      </Card>
    </ExamToolbarDock>
    {toolError && <p role="alert" className="text-sm text-destructive">{toolError}</p>}
    {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
    <CollapsibleContent ref={mobileNavigationRef} className="flex flex-col gap-2 lg:hidden">{renderNavigation()}</CollapsibleContent>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex min-w-0 flex-col gap-3" inert={submitting ? true : undefined}>
        {/* Keep loaded panels mounted: changing page preserves in-memory answers and math modes. */}
        {ids.filter(id => page.ids.includes(id) || cache[id]).map(id => {
          const index = ids.indexOf(id)
          const visible = page.ids.includes(id)
          const loaded = cache[id]
          return <div key={id} id={`practice-run-${id}`} hidden={!visible} tabIndex={-1} className="scroll-mt-[calc(var(--exam-toolbar-height,4rem)+1rem)] outline-none" onFocusCapture={() => setCurrentIndex(index)}>
            {loaded ? <PracticeQuestionRunner key={loaded.variantReceipt} ref={handle => { if (handle) questionHandles.current[id] = handle; else delete questionHandles.current[id] }} disabled={submitting} libraryId={library.id} libraryTitle={library.title} question={loaded.question} variantReceipt={loaded.variantReceipt} changesOnRefresh={loaded.changesOnRefresh}
              storageOwnerId={storageOwnerId} returnHref={returnHref} calculatorEnabled={false} scratchpadEnabled={false} embedded questionNumber={index + 1} flagged={flags.has(id)}
              onToggleFlag={() => setFlags(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })}
              onProgress={onProgress} onReload={() => reloadQuestion(id)} checkAction={checkAction} calculatorResult={calculatorResult} frameClassName={cn(preset.surface, 'border bg-card')}
              frameHeaderClassName={cn(preset.surface, preset.text, 'rounded-lg border px-2 py-1')}
            /> : <Card padding="sm"><p role={errors[id] ? 'alert' : 'status'} className="flex items-center gap-2 text-sm text-muted-foreground">{errors[id] || <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />กำลังเปิดข้อ {index + 1}…</>}</p>{errors[id] && <Button size="sm" variant="outline" onClick={() => reloadQuestion(id)}>ลองอีกครั้ง</Button>}</Card>}
          </div>
        })}
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={page.start === 0} onClick={() => navigate(Math.max(0, page.start - settings.questionsPerPage))}><ChevronLeft aria-hidden="true" />ก่อนหน้า</Button>
          <span className="text-xs text-muted-foreground">{settings.questionsPerPage} ข้อต่อหน้า</span>
          {page.page === page.totalPages ? <div className="min-w-0">{submitButton}</div> : <Button size="sm" onClick={() => navigate(page.start + settings.questionsPerPage)}>ถัดไป<ChevronRight aria-hidden="true" /></Button>}
        </div>
      </div>
      <aside aria-label="สถานะและนำทางข้อ" className="sticky top-[calc(var(--exam-toolbar-height,4rem)+0.75rem)] hidden max-h-[max(16rem,calc(100dvh-var(--exam-toolbar-height,4rem)-8rem))] min-h-0 min-w-0 flex-col gap-3 self-start lg:flex" data-practice-desktop-navigation>
        {renderNavigation()}
      </aside>
    </div>
    </Collapsible>
    <Dialog open={submitOpen} onOpenChange={(open, details) => {
      if (open) { setSubmitOpen(true); return }
      if (details.reason === 'outside-press' || details.reason === 'escape-key') {
        details.cancel()
        void confirm({ title: 'กลับไปทำแบบฝึกหัด?', description: 'ยังไม่มีการส่งคำตอบ คำตอบที่กรอกไว้ยังอยู่', confirmLabel: 'กลับไปทำต่อ', cancelLabel: 'กลับไปส่งคำตอบ' }).then(accepted => { if (accepted) setSubmitOpen(false) })
      } else setSubmitOpen(false)
    }}>
      <DialogContent className="sm:max-w-md" finalFocus={completed ? summaryRef : undefined}>
        <DialogHeader><DialogTitle>ยืนยันส่งคำตอบ</DialogTitle><DialogDescription>ตรวจคำตอบที่กรอกไว้และแสดงผลสรุปการฝึก</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>ตอบแล้ว {summary.answered}/{ids.length} ข้อ</span><span>ยังไม่ตอบ {summary.unanswered} ข้อ</span>{flags.size > 0 && <span>ปักธงไว้ {flags.size} ข้อ</span>}</div>
        <DialogFooter><Button size="sm" variant="outline" onClick={() => setSubmitOpen(false)}>กลับไปทำต่อ</Button><Button size="sm" onClick={() => void submitAnswers()}>ยืนยันส่งคำตอบ</Button></DialogFooter>
      </DialogContent>
      {confirmDialog}
    </Dialog>
    {calculatorLoaded && calculatorEnabled && <Suspense fallback={<p role="status">กำลังเปิดเครื่องคิดเลข…</p>}><ScientificCalculator open={calculatorOpen} mode={calculatorMode} onModeChange={setCalculatorMode}
      targetLabel={activeQuestion?.question.questions.question_type === 'written' ? `คำตอบข้อ ${currentIndex + 1}` : null}
      onInsertResult={value => setCalculatorResult({ questionId: activeId, value, nonce: Date.now() })} onClose={() => setCalculatorOpen(false)} /></Suspense>}
    {scratchpadLoaded && scratchpadEnabled && <Suspense fallback={<p role="status">กำลังเปิดกระดาษทด…</p>}><Scratchpad key={activeId} open={scratchpadOpen} scope={{ ownerId: storageOwnerId, submissionId: `practice:${library.id}`, answerId: activeId, partKey: 'practice' }}
      targetLabel={`ข้อ ${currentIndex + 1}`} persistenceEnabled artifactPartKey="practice" artifact={null} loadAttachedNonce={0} previewMode={false} attachmentEnabled={false}
      fingerInputMode={fingerInputMode} onFingerInputModeChange={setFingerInputMode} onAttachmentSaved={() => {}} onAttachmentStateChange={() => {}} onClose={() => setScratchpadOpen(false)} /></Suspense>}
  </div>
}

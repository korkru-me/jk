'use client'

import Link from 'next/link'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Calculator, ChevronLeft, ChevronRight, LoaderCircle, Maximize, Minimize, PenLine, Target } from 'lucide-react'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ExamToolbarDock } from '@/components/exam/exam-toolbar-dock'
import { ExamQuestionNavigation, ExamQuestionNavigationLegend, type ExamNavigationItem } from '@/components/exam/exam-question-navigation'
import { PracticeQuestionRunner } from './practice-question-runner'
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
  const [states, setStates] = useState<Record<string, { answered: boolean; verdict?: PracticeFeedback['verdict'] }>>({})
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
      void questionLoader(library.id, id).then(result => {
        if (cancelled) return
        if (!result.ok) { setErrors(previous => ({ ...previous, [id]: result.error })); return }
        cacheRef.current = { ...cacheRef.current, [id]: result.data }
        setCache(cacheRef.current)
        setErrors(previous => { const next = { ...previous }; delete next[id]; return next })
      }).catch(() => { if (!cancelled) setErrors(previous => ({ ...previous, [id]: 'การเชื่อมต่อสะดุด กรุณาลองเปิดโจทย์อีกครั้ง' })) })
    }
    return () => { cancelled = true }
  }, [ready, pageKey, library.id, questionLoader, reloadNonce])

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
    setCurrentIndex(index)
    requestAnimationFrame(() => {
      const target = document.getElementById(`practice-run-${ids[index]}`)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
  }
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
  const navigation: ExamNavigationItem[] = ids.map((id, index) => ({
    current: index >= page.start && index < page.start + page.ids.length,
    answered: states[id]?.answered ?? false, flagged: flags.has(id), verdict: states[id]?.verdict,
  }))
  const preset = COVER_PRESETS.find(color => color.id === settings.theme) ?? COVER_PRESETS[0]
  if (fatalError || (ready && !exercise)) return <Card padding="sm"><p role="alert" className="text-sm text-destructive">{fatalError || 'ไม่พบแบบฝึกหัดนี้'}</p><Button variant="link" size="sm" render={<Link href={returnHref} />}>กลับไปคลังฝึก</Button></Card>
  if (!ready || !exercise) return <p role="status" className="text-sm text-muted-foreground">กำลังเปิดแบบฝึกหัด…</p>

  return <div ref={rootRef} className={cn('flex min-w-0 w-full flex-col gap-3 bg-background', focused && 'fixed inset-0 z-40 overflow-y-auto p-3')}>
    <ExamToolbarDock>
      <Card padding="sm" radius="md" className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
        <Button variant="ghost" size="icon-sm" render={<Link href={returnHref} />} aria-label="กลับไปคลังฝึก"><ArrowLeft aria-hidden="true" /></Button>
        <div className="min-w-0 flex-1"><p className="truncate text-xs text-muted-foreground">{library.title}</p><h1 className="truncate text-base font-semibold">{exercise.title}</h1></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary"><Target className="size-3" aria-hidden="true" /><span className="hidden sm:inline">ฝึกเอง · </span>ไม่มีคะแนน</Badge>
        <Button variant="outline" size="sm" aria-label={focused ? 'ออกจากโฟกัส' : 'โหมดโฟกัส'} title={focused ? 'ออกจากโฟกัส' : 'โหมดโฟกัส'} className="size-7 px-0 sm:w-auto sm:px-2.5 pointer-coarse:size-11 sm:pointer-coarse:w-auto" onClick={() => void toggleFocus()}>{focused ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}<span className="hidden sm:inline">{focused ? 'ออกจากโฟกัส' : 'โหมดโฟกัส'}</span></Button>
        {calculatorEnabled && <Button variant="outline" size="sm" aria-label="เครื่องคิดเลข" title="เครื่องคิดเลข" className="size-7 px-0 sm:w-auto sm:px-2.5 pointer-coarse:size-11 sm:pointer-coarse:w-auto" onClick={() => { setCalculatorLoaded(true); setCalculatorOpen(true) }}><Calculator aria-hidden="true" /><span className="hidden sm:inline">เครื่องคิดเลข</span></Button>}
        {scratchpadEnabled && <Button variant="outline" size="sm" aria-label="กระดาษทด" title="กระดาษทด" className="size-7 px-0 sm:w-auto sm:px-2.5 pointer-coarse:size-11 sm:pointer-coarse:w-auto" onClick={() => { setScratchpadLoaded(true); setScratchpadOpen(true) }}><PenLine aria-hidden="true" /><span className="hidden sm:inline">กระดาษทด</span></Button>}
        </div>
      </Card>
    </ExamToolbarDock>
    {toolError && <p role="alert" className="text-sm text-destructive">{toolError}</p>}
    <div className="grid min-w-0 gap-3 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <Card padding="sm" radius="md" className="flex h-fit min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--exam-toolbar-height,4rem)+0.5rem)]">
        <div className="flex items-center justify-between text-xs"><span>ตรวจแล้ว {checkedCount}/{ids.length} ข้อ</span><span>หน้า {page.page}/{page.totalPages}</span></div>
        <Progress value={checkedCount / ids.length * 100} aria-label="ความคืบหน้าในการฝึกรอบนี้" />
        <div className="max-h-48 overflow-y-auto p-1 lg:max-h-[45dvh]"><ExamQuestionNavigation items={navigation} onNavigate={navigate} /></div>
        <div className="hidden lg:block"><ExamQuestionNavigationLegend instantCheck flagDescription={PRACTICE_FLAG_DESCRIPTION} /></div>
        <Collapsible className="lg:hidden">
          <CollapsibleTrigger render={<Button variant="ghost" size="xs" />}>ความหมายสีและธง</CollapsibleTrigger>
          <CollapsibleContent className="pt-2"><ExamQuestionNavigationLegend instantCheck flagDescription={PRACTICE_FLAG_DESCRIPTION} /></CollapsibleContent>
        </Collapsible>
      </Card>
      <div className="flex min-w-0 flex-col gap-3">
        {/* Keep loaded panels mounted: changing page preserves in-memory answers and math modes. */}
        {ids.filter(id => page.ids.includes(id) || cache[id]).map(id => {
          const index = ids.indexOf(id)
          const visible = page.ids.includes(id)
          const loaded = cache[id]
          return <div key={id} id={`practice-run-${id}`} hidden={!visible} tabIndex={-1} className="scroll-mt-[calc(var(--exam-toolbar-height,4rem)+1rem)] outline-none" onFocusCapture={() => setCurrentIndex(index)}>
            {loaded ? <PracticeQuestionRunner key={loaded.variantReceipt} libraryId={library.id} libraryTitle={library.title} question={loaded.question} variantReceipt={loaded.variantReceipt} changesOnRefresh={loaded.changesOnRefresh}
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
          <Button size="sm" variant="outline" disabled={page.page === page.totalPages} onClick={() => navigate(page.start + settings.questionsPerPage)}>ถัดไป<ChevronRight aria-hidden="true" /></Button>
        </div>
      </div>
    </div>
    {calculatorLoaded && calculatorEnabled && <Suspense fallback={<p role="status">กำลังเปิดเครื่องคิดเลข…</p>}><ScientificCalculator open={calculatorOpen} mode={calculatorMode} onModeChange={setCalculatorMode}
      targetLabel={activeQuestion?.question.questions.question_type === 'written' ? `คำตอบข้อ ${currentIndex + 1}` : null}
      onInsertResult={value => setCalculatorResult({ questionId: activeId, value, nonce: Date.now() })} onClose={() => setCalculatorOpen(false)} /></Suspense>}
    {scratchpadLoaded && scratchpadEnabled && <Suspense fallback={<p role="status">กำลังเปิดกระดาษทด…</p>}><Scratchpad key={activeId} open={scratchpadOpen} scope={{ ownerId: storageOwnerId, submissionId: `practice:${library.id}`, answerId: activeId, partKey: 'practice' }}
      targetLabel={`ข้อ ${currentIndex + 1}`} persistenceEnabled artifactPartKey="practice" artifact={null} loadAttachedNonce={0} previewMode={false} attachmentEnabled={false}
      fingerInputMode={fingerInputMode} onFingerInputModeChange={setFingerInputMode} onAttachmentSaved={() => {}} onAttachmentStateChange={() => {}} onClose={() => setScratchpadOpen(false)} /></Suspense>}
  </div>
}

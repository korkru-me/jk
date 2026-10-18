'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { ShellClient } from '@/components/layout/shell-client'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { AssignmentContextNavigation } from '@/app/(app)/assignments/[id]/_components/assignment-context-sidebar'
import { GradingOverview } from '@/components/assignments/grading-overview'
import { QuestionGradingReview, StudentGradingReview, type GradingReviewQuery } from '@/components/assignments/grading-review'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { confirmPageExit } from '@/components/layout/confirm-page-exit'
import type { GradingWorkspaceData } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import type { ConfigureGradingPartsInput, GradingReviewActionResult } from '@/lib/actions/grading-review'
import type { GradingDraftError, PublishGradingDraftsInput, PublishGradingDraftsResult, SaveGradingDraftsInput, SaveGradingDraftsResult } from '@/lib/grading-draft-types'
import { createGradingLab, LAB_BASE, LAB_LEGACY_STORAGE, LAB_LONG_QUESTION_TITLE, LAB_STORAGE, LAB_TIME, labId, recomputeLab } from './fixture'
import { createGradingLabState, migrateLegacyGradingLab, parseGradingLabState, publishLabDrafts, saveLabDrafts, type GradingLabState } from './grading-workspace-lab-state'

type Scenario = 'default' | 'long-question' | 'unconfigured' | 'void' | 'streak' | 'readonly'

export function GradingWorkspaceLabShell({ children }: { children: ReactNode }) {
  return <div data-navigation-boundary={LAB_BASE} onClickCapture={event => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (href && !href.startsWith(LAB_BASE) && !href.startsWith('blob:')) { event.preventDefault(); event.stopPropagation(); toast.info('ห้องทดลองนี้เปิดเฉพาะหน้าตรวจให้คะแนน') }
  }} onSubmitCapture={event => { if (!(event.target as HTMLElement).closest('[data-grading-lab-content]')) { event.preventDefault(); event.stopPropagation() } }}>
    <ShellClient user={{ id: labId(8000, 1), email: 'grading-lab@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false} practiceLibraryEnabled>{children}</ShellClient>
  </div>
}

function scenarioData(scenario: Scenario) {
  let data = createGradingLab({ longQuestion: scenario === 'long-question' })
  if (scenario === 'unconfigured') {
    data.gradingParts = {}
    data.answers = data.answers.map(answer => answer.questionId === data.questions[1].id ? { ...answer, gradingPartsConfigured: false, answerScore: (answer.answerScore ?? 0) / 2 * 5, score: (answer.answerScore ?? 0) / 2 * 5, answerMaxScore: 5, workScore: 0, workMaxScore: 0, workReviewedAt: null } : answer)
  }
  if (scenario === 'readonly') { data.reviewAvailable = false; data.draftsAvailable = false }
  if (scenario === 'void') {
    data.voidedQuestionIds = [data.questions[0].id]
    data.answers = data.answers.map(answer => answer.questionId === data.questions[0].id ? { ...answer, isVoid: true, voidOriginalMaxScore: answer.maxScore, maxScore: 0, score: 0 } : answer)
  }
  if (scenario === 'streak') {
    data.assignment = { ...data.assignment, type: 'exercise', completionRule: 'streak', streakTarget: 3 }
    const first = data.answers.find(answer => answer.studentId === data.students[0].id && answer.questionId === data.questions[0].id)!
    data.answers.push({ ...first, id: labId(8400, 10001), orderIndex: 7, studentAnswer: 'MCQ:2', isCorrect: false, answerScore: 0, score: 0 }, { ...first, id: labId(8400, 10002), orderIndex: 8 })
  }
  return recomputeLab(data)
}

function inferScenario(data: GradingWorkspaceData): Scenario {
  if (data.questions[1]?.title === LAB_LONG_QUESTION_TITLE) return 'long-question'
  return data.reviewAvailable === false ? 'readonly' : data.assignment.completionRule === 'streak' ? 'streak' : data.voidedQuestionIds.length ? 'void' : !data.gradingParts?.[data.questions[1].id] ? 'unconfigured' : 'default'
}

function LabSidebar({ data }: { data: GradingWorkspaceData }) {
  const pathname = usePathname()
  const pendingCount = new Set(data.answers.filter(answer => { const q = data.questions.find(question => question.id === answer.questionId); return q && scoreParts(answer, q).pending }).map(answer => answer.studentId)).size
  const render = useCallback((close?: () => void) => <AssignmentContextNavigation assignment={{ id: data.assignment.id, classroom_id: labId(8000, 3), status: 'published', title: data.assignment.title, type: data.assignment.type, mode: 'online', question_ids: data.questions.map(q => q.id), random_question_count: null, completion_rule: data.assignment.completionRule, streak_target: data.assignment.streakTarget ?? null, classrooms: { name: data.assignment.classroomName ?? 'ห้องจำลอง' } }} currentSection="results" gradeHref={LAB_BASE} pendingCount={pendingCount} availableQuestionCount={data.questions.length} missingQuestionCount={0} duplicateQuestionCount={0} isPending={false} onPublish={() => toast.info('คำสั่งเผยแพร่ไม่ทำงานในห้องทดลอง')} onCloseExam={() => toast.info('คำสั่งปิดงานไม่ทำงานในห้องทดลอง')} onDelete={() => toast.info('คำสั่งลบไม่ทำงานในห้องทดลอง')} onClose={close} />, [data, pendingCount])
  useContextualSidebar(pathname, render)
  return null
}

export function GradingWorkspaceLab({ questionId, studentId }: { questionId?: string; studentId?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [lab, setLab] = useState(createGradingLabState)
  const data = lab.data
  const [ready, setReady] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('default')
  const [failNext, setFailNext] = useState(false)
  const fail = useRef(false)

  function update(next: GradingLabState) {
    try { localStorage.setItem(LAB_STORAGE, JSON.stringify(next)) }
    catch { toast.error('บันทึกข้อมูลจำลองในเบราว์เซอร์ไม่สำเร็จ'); return false }
    setLab(next); setScenario(inferScenario(next.data))
    return true
  }

  useEffect(() => {
    let disposed = false
    const accept = (next: GradingLabState) => {
      if (disposed) return
      setLab(next); setScenario(inferScenario(next.data))
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== LAB_STORAGE) return
      try {
        if (event.storageArea !== localStorage) return
        // Read the latest value, not a queued event's possibly older snapshot.
        const raw = localStorage.getItem(LAB_STORAGE)
        const next = raw ? parseGradingLabState(raw) : createGradingLabState()
        if (next) accept(next)
      } catch { /* A write action will explain an unavailable storage error. */ }
    }
    async function hydrate() {
      try {
        const load = () => {
          const stored = parseGradingLabState(localStorage.getItem(LAB_STORAGE))
          const migrated = stored ? null : migrateLegacyGradingLab(sessionStorage.getItem(LAB_LEGACY_STORAGE))
          const parsed = stored ?? migrated
          if (parsed) {
            if (migrated) { localStorage.setItem(LAB_STORAGE, JSON.stringify(parsed)); sessionStorage.removeItem(LAB_LEGACY_STORAGE) }
            accept(parsed)
          }
        }
        if (navigator.locks) await navigator.locks.request(LAB_STORAGE + ':write', load)
        else load()
      } catch { if (!disposed) toast.error('อ่านข้อมูลจำลองเดิมไม่สำเร็จ เริ่มด้วยข้อมูลตัวอย่างใหม่') }
      finally { if (!disposed) setReady(true) }
    }
    window.addEventListener('storage', onStorage)
    void hydrate()
    return () => { disposed = true; window.removeEventListener('storage', onStorage) }
  }, [])

  async function withStorage<T>(operation: (latest: GradingLabState) => T, replaceInvalid = false): Promise<T | GradingDraftError> {
    if (!navigator.locks) return { error: 'เบราว์เซอร์นี้ยังไม่รองรับการบันทึกข้อมูลจำลองอย่างปลอดภัย', code: 'unavailable' }
    try {
      return await navigator.locks.request(LAB_STORAGE + ':write', () => {
        const raw = localStorage.getItem(LAB_STORAGE)
        const latest = raw ? parseGradingLabState(raw) : createGradingLabState()
        if (!latest && !replaceInvalid) return { error: 'ข้อมูลจำลองเดิมไม่ถูกต้อง กรุณากดเริ่มใหม่', code: 'connection' as const }
        return operation(latest ?? createGradingLabState())
      })
    } catch { return { error: 'อ่านหรือบันทึกข้อมูลจำลองไม่สำเร็จ กรุณาลองใหม่', code: 'connection' } }
  }

  const query: GradingReviewQuery = { classroom: params.get('classroom') ?? undefined, sort: (['classroom','code','number','name'].includes(params.get('sort') ?? '') ? params.get('sort') : 'classroom') as GradingReviewQuery['sort'], dir: params.get('dir') === 'desc' ? 'desc' : 'asc', page: Math.max(1, Number(params.get('page')) || 1) }

  function simulatedFailure() {
    if (!fail.current) return null
    fail.current = false; setFailNext(false)
    return { error: 'จำลองการเชื่อมต่อขัดข้อง ข้อมูลทั้งชุดยังไม่เปลี่ยน กรุณาลองใหม่', code: 'connection' as const }
  }

  async function saveDrafts(input: SaveGradingDraftsInput): Promise<SaveGradingDraftsResult> {
    await new Promise(resolve => setTimeout(resolve, 180))
    const failed = simulatedFailure()
    if (failed) return failed
    return withStorage(latest => {
      const next = saveLabDrafts(latest, input)
      if ('error' in next.result) return next.result
      if (!update(next.state)) return { error: 'บันทึกข้อมูลจำลองไม่สำเร็จ ร่างคะแนนยังอยู่', code: 'connection' as const }
      return next.result
    })
  }

  async function publish(input: PublishGradingDraftsInput): Promise<PublishGradingDraftsResult> {
    await new Promise(resolve => setTimeout(resolve, 180))
    const failed = simulatedFailure()
    if (failed) return failed
    return withStorage(latest => {
      const next = publishLabDrafts(latest, input)
      if ('error' in next.result) return next.result
      if (!update(next.state)) return { error: 'เผยแพร่ข้อมูลจำลองไม่สำเร็จ ร่างคะแนนยังอยู่', code: 'connection' as const }
      return next.result
    })
  }

  async function configure(input: ConfigureGradingPartsInput): Promise<GradingReviewActionResult> {
    await new Promise(resolve => setTimeout(resolve, 180))
    return withStorage(previousState => {
      const previous = previousState.data
      const policy = previous.gradingParts?.[input.questionId]
      const max = previous.questionMaxScores?.[input.questionId] ?? 0
      if (input.assignmentId !== previous.assignment.id || previous.reviewAvailable === false || !max || !Number.isFinite(input.answerMaxScore) || !Number.isFinite(input.workMaxScore) || Math.abs(input.answerMaxScore + input.workMaxScore - max) > 0.000001 || input.answerMaxScore < 0 || input.workMaxScore < 0) return { error: 'สัดส่วนคะแนนไม่ถูกต้อง' }
      if ((policy?.updatedAt ?? null) !== input.expectedUpdatedAt) return { error: 'สัดส่วนคะแนนเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่' }
      const time = new Date(Math.max(Date.now(), Date.parse(policy?.updatedAt ?? LAB_TIME) + 1, ...previous.answers.map(answer => Date.parse(answer.scoreEditedAt ?? LAB_TIME) + 1))).toISOString()
      const workShare = input.workMaxScore / max
      const answers = previous.answers.map(answer => {
        if (answer.questionId !== input.questionId || answer.isVoid) return answer
        const answerMaxScore = Math.round(answer.maxScore * (1 - workShare) * 1000000) / 1000000, workMaxScore = Math.round(answer.maxScore * workShare * 1000000) / 1000000
        const oldAnswerMax = answer.answerMaxScore ?? answer.maxScore
        const oldWorkMax = answer.workMaxScore ?? 0
        const answerScore = oldAnswerMax > 0 ? Math.round((answer.answerScore ?? answer.score) / oldAnswerMax * answerMaxScore * 100) / 100 : 0
        const workScore = oldWorkMax > 0 && answer.workReviewedAt ? Math.round((answer.workScore ?? 0) / oldWorkMax * workMaxScore * 100) / 100 : 0
        return { ...answer, answerMaxScore, workMaxScore, answerScore, workScore, score: answerScore + workScore, gradingPartsConfigured: true, scoreEditedAt: time }
      })
      if (!update({ ...previousState, data: recomputeLab({ ...previous, answers, gradingParts: { ...previous.gradingParts, [input.questionId]: { workShare, updatedAt: time } } }) })) return { error: 'บันทึกสัดส่วนจำลองไม่สำเร็จ' }
      return { success: true as const }
    })
  }

  async function changeScenario(value: Scenario) {
    if (!await confirmPageExit()) return
    const result = await withStorage(() => update(createGradingLabState(scenarioData(value))), true)
    if (result === true) router.push(LAB_BASE)
    else if (typeof result === 'object') toast.error(result.error)
  }

  async function reset() {
    if (!await confirmPageExit()) return
    const result = await withStorage(() => {
      localStorage.removeItem(LAB_STORAGE); sessionStorage.removeItem(LAB_LEGACY_STORAGE)
      return update(createGradingLabState())
    }, true)
    if (result === true) router.push(LAB_BASE)
    else if (typeof result === 'object') toast.error(result.error)
  }

  return <div data-grading-lab-content className="flex min-w-0 flex-col gap-2">
    <LabSidebar data={data} />
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline"><FlaskConical aria-hidden="true" />LOCAL · ข้อมูลจำลองเท่านั้น</Badge><div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="grading-lab-scenario">สถานการณ์จำลอง</label><NativeSelect id="grading-lab-scenario" value={scenario} onChange={event => { void changeScenario(event.target.value as Scenario) }} className="w-auto pointer-coarse:min-h-11"><option value="default">ตัวอย่างปกติ</option><option value="long-question">โจทย์ยาว · ภาพและสูตร</option><option value="unconfigured">ยังไม่กำหนดสัดส่วน</option><option value="void">มีข้อโมฆะ</option><option value="streak">โจทย์ซ้ำแบบ streak</option><option value="readonly">ฐานข้อมูลยังไม่พร้อม</option></NativeSelect><Button type="button" variant="ghost" className="pointer-coarse:min-h-11" onClick={() => { void reset() }}><RotateCcw data-icon="inline-start" />เริ่มใหม่</Button><Button type="button" variant={failNext ? 'navigation' : 'outline'} className="pointer-coarse:min-h-11" onClick={() => { fail.current = !fail.current; setFailNext(fail.current) }}>{failNext ? 'คำสั่งครั้งหน้าจะขัดข้อง' : 'ลองบันทึกขัดข้อง'}</Button></div></div>
    <p className="text-xs text-muted-foreground">ข้อมูลจำลองเก็บในเบราว์เซอร์นี้ เปิดใหม่ได้ · แจ้งเตือนจำลอง {lab.notificationCount} รายการ · ไม่ส่งการแจ้งเตือนจริง</p>
    {!ready ? <p role="status" className="text-sm text-muted-foreground">กำลังเตรียมห้องทดลอง…</p> : questionId ? <QuestionGradingReview data={data} questionId={questionId} query={query} saveDrafts={saveDrafts} publish={publish} configure={configure} correctionActions={false} /> : studentId ? <StudentGradingReview data={data} studentId={studentId} query={query} saveDrafts={saveDrafts} publish={publish} /> : <GradingOverview key={`${params.get('view')}-${scenario}`} data={data} initialQuery={{ ...query, view: params.get('view') === 'students' ? 'students' : 'questions' }} />}
    <div className="flex flex-wrap items-center gap-2 text-xs"><Link href={LAB_BASE} className="text-primary underline underline-offset-2">ตารางรายข้อ</Link><Link href={`${LAB_BASE}?view=students`} className="text-primary underline underline-offset-2">ตารางรายคน</Link><Link href={`${LAB_BASE}/questions/${data.questions[1].id}`} className="text-primary underline underline-offset-2">ตัวอย่างตรวจวิธีทำ</Link><Link href={`${LAB_BASE}/students/${data.students[0].id}`} className="text-primary underline underline-offset-2">ตัวอย่างตรวจรายคน</Link></div>
  </div>
}

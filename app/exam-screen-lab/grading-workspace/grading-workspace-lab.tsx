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
import { GradingExportButton } from '@/components/assignments/grading-tools'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import type { GradingWorkspaceData } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import type { ConfigureGradingPartsInput, GradingReviewActionResult, SaveGradingReviewInput } from '@/lib/actions/grading-review'
import { createGradingLab, LAB_BASE, LAB_STORAGE, LAB_TIME, labId, recomputeLab } from './fixture'

type Scenario = 'default' | 'unconfigured' | 'void' | 'streak' | 'readonly'

export function GradingWorkspaceLabShell({ children }: { children: ReactNode }) {
  return <div onClickCapture={event => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (href && !href.startsWith(LAB_BASE) && !href.startsWith('blob:')) { event.preventDefault(); event.stopPropagation(); toast.info('ห้องทดลองนี้เปิดเฉพาะหน้าตรวจให้คะแนน') }
  }} onSubmitCapture={event => { if (!(event.target as HTMLElement).closest('[data-grading-lab-content]')) { event.preventDefault(); event.stopPropagation() } }}>
    <ShellClient user={{ id: labId(8000, 1), email: 'grading-lab@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false} practiceLibraryEnabled>{children}</ShellClient>
  </div>
}

function scenarioData(scenario: Scenario) {
  let data = createGradingLab()
  if (scenario === 'unconfigured') {
    data.gradingParts = {}
    data.answers = data.answers.map(answer => answer.questionId === data.questions[1].id ? { ...answer, gradingPartsConfigured: false, answerScore: (answer.answerScore ?? 0) / 2 * 5, score: (answer.answerScore ?? 0) / 2 * 5, answerMaxScore: 5, workScore: 0, workMaxScore: 0, workReviewedAt: null } : answer)
  }
  if (scenario === 'readonly') data.reviewAvailable = false
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
  const [data, setData] = useState(createGradingLab)
  const current = useRef(data)
  const [ready, setReady] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('default')
  const [failNext, setFailNext] = useState(false)
  const fail = useRef(false)

  function update(next: GradingWorkspaceData) {
    current.current = next; setData(next); setScenario(inferScenario(next))
    try { sessionStorage.setItem(LAB_STORAGE, JSON.stringify(next)) } catch { toast.error('บันทึกข้อมูลจำลองในแท็บนี้ไม่สำเร็จ') }
  }

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(LAB_STORAGE)
      const parsed = stored ? JSON.parse(stored) as GradingWorkspaceData : null
      if (parsed?.baseHref === LAB_BASE && parsed.students?.length === 32 && parsed.questions?.length === 7) { current.current = parsed; setData(parsed); setScenario(inferScenario(parsed)) }
    } catch { sessionStorage.removeItem(LAB_STORAGE) }
    setReady(true)
  }, [])

  const query: GradingReviewQuery = { classroom: params.get('classroom') ?? undefined, sort: (['classroom','code','number','name'].includes(params.get('sort') ?? '') ? params.get('sort') : 'classroom') as GradingReviewQuery['sort'], dir: params.get('dir') === 'desc' ? 'desc' : 'asc', page: Math.max(1, Number(params.get('page')) || 1) }

  async function save(input: SaveGradingReviewInput): Promise<GradingReviewActionResult> {
    await new Promise(resolve => setTimeout(resolve, 180))
    if (fail.current) { fail.current = false; setFailNext(false); return { error: 'จำลองการเชื่อมต่อขัดข้อง ร่างคะแนนยังอยู่ กดบันทึกเพื่อลองใหม่ได้' } }
    const previous = current.current
    const answer = previous.answers.find(item => item.id === input.answerId)
    if (previous.reviewAvailable === false || input.assignmentId !== previous.assignment.id || !answer || answer.isVoid) return { error: 'ไม่สามารถแก้คะแนนคำตอบนี้ได้' }
    if (!Object.hasOwn(input, 'answerScore') && !Object.hasOwn(input, 'workScore')) return { error: 'กรุณากรอกคะแนนก่อนบันทึก' }
    if (input.expectedScoreEditedAt !== answer.scoreEditedAt) return { error: 'คะแนนเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก' }
    for (const [key, max] of [['answerScore', answer.answerMaxScore ?? answer.maxScore], ['workScore', answer.workMaxScore ?? 0]] as const) if (Object.hasOwn(input, key) && (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key]! < 0 || input[key]! > max)) return { error: 'คะแนนไม่อยู่ในช่วงคะแนนเต็มของส่วนนี้' }
    const time = new Date(Math.max(Date.now(), Date.parse(answer.scoreEditedAt ?? LAB_TIME) + 1)).toISOString()
    const next = { ...answer, answerScore: input.answerScore ?? answer.answerScore, workScore: input.workScore ?? answer.workScore, answerReviewedAt: input.answerScore !== undefined ? time : answer.answerReviewedAt, workReviewedAt: input.workScore !== undefined ? time : answer.workReviewedAt, scoreEditedAt: time, scoreEditedBy: labId(8000, 1) }
    next.score = (next.answerScore ?? 0) + (next.workScore ?? 0)
    update(recomputeLab({ ...previous, answers: previous.answers.map(item => item.id === answer.id ? next : item) }))
    return { success: true }
  }

  async function configure(input: ConfigureGradingPartsInput): Promise<GradingReviewActionResult> {
    await new Promise(resolve => setTimeout(resolve, 180))
    const previous = current.current
    const policy = previous.gradingParts?.[input.questionId]
    const max = previous.questionMaxScores?.[input.questionId] ?? 0
    if (input.assignmentId !== previous.assignment.id || previous.reviewAvailable === false || !max || !Number.isFinite(input.answerMaxScore) || !Number.isFinite(input.workMaxScore) || Math.abs(input.answerMaxScore + input.workMaxScore - max) > 0.000001 || input.answerMaxScore < 0 || input.workMaxScore < 0) return { error: 'สัดส่วนคะแนนไม่ถูกต้อง' }
    if ((policy?.updatedAt ?? null) !== input.expectedUpdatedAt) return { error: 'สัดส่วนคะแนนเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่' }
    const time = new Date().toISOString()
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
    update(recomputeLab({ ...previous, answers, gradingParts: { ...previous.gradingParts, [input.questionId]: { workShare, updatedAt: time } } }))
    return { success: true }
  }

  return <div data-grading-lab-content className="flex min-w-0 flex-col gap-2">
    <LabSidebar data={data} />
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline"><FlaskConical aria-hidden="true" />LOCAL · ข้อมูลจำลองเท่านั้น</Badge><div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="grading-lab-scenario">สถานการณ์จำลอง</label><NativeSelect id="grading-lab-scenario" value={scenario} onChange={event => { const value = event.target.value as Scenario; setScenario(value); update(scenarioData(value)); router.push(LAB_BASE) }} className="w-auto pointer-coarse:min-h-11"><option value="default">ตัวอย่างปกติ</option><option value="unconfigured">ยังไม่กำหนดสัดส่วน</option><option value="void">มีข้อโมฆะ</option><option value="streak">โจทย์ซ้ำแบบ streak</option><option value="readonly">ฐานข้อมูลยังไม่พร้อม</option></NativeSelect><Button type="button" variant="ghost" className="pointer-coarse:min-h-11" onClick={() => { update(createGradingLab()); setScenario('default'); router.push(LAB_BASE) }}><RotateCcw data-icon="inline-start" />เริ่มใหม่</Button><Button type="button" variant={failNext ? 'navigation' : 'outline'} className="pointer-coarse:min-h-11" onClick={() => { fail.current = !fail.current; setFailNext(fail.current) }}>{failNext ? 'บันทึกครั้งหน้าจะขัดข้อง' : 'ลองบันทึกขัดข้อง'}</Button></div></div>
    <p className="text-xs text-muted-foreground">ไม่อ่านหรือเปลี่ยนฐานข้อมูลจริง · ภาพและไฟล์สร้างในเครื่อง · คะแนนจำลองอยู่เฉพาะแท็บนี้</p>
    {!ready ? <p role="status" className="text-sm text-muted-foreground">กำลังเตรียมห้องทดลอง…</p> : questionId ? <QuestionGradingReview data={data} questionId={questionId} query={query} save={save} configure={configure} correctionActions={false} /> : studentId ? <StudentGradingReview data={data} studentId={studentId} query={query} save={save} /> : <GradingOverview key={`${params.get('view')}-${scenario}`} data={data} initialQuery={{ ...query, view: params.get('view') === 'students' ? 'students' : 'questions' }} actions={<GradingExportButton data={data} />} />}
    <div className="flex flex-wrap items-center gap-2 text-xs"><Link href={LAB_BASE} className="text-primary underline underline-offset-2">ตารางรายข้อ</Link><Link href={`${LAB_BASE}?view=students`} className="text-primary underline underline-offset-2">ตารางรายคน</Link><Link href={`${LAB_BASE}/questions/${data.questions[1].id}`} className="text-primary underline underline-offset-2">ตัวอย่างตรวจวิธีทำ</Link><Link href={`${LAB_BASE}/students/${data.students[0].id}`} className="text-primary underline underline-offset-2">ตัวอย่างตรวจรายคน</Link></div>
  </div>
}

'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownUp, ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, PencilLine } from 'lucide-react'
import type { GradingAnswer, GradingStudent, GradingWorkspaceData } from '@/lib/grading-workspace'
import { scoreParts, sortGradingStudents } from '@/lib/grading-workspace'
import { pendingWorkForReview } from '@/lib/grading-review-status'
import type { saveGradingReview } from '@/lib/actions/grading-review'
import type { Question } from '@/lib/types'
import { TYPE_LABEL } from '@/lib/question-display'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { GradingWorkspaceHeader } from './grading-workspace-header'
import { GradingAnswerContent, GradingQuestionContent } from './grading-answer-content'
import { GradingScoreFields } from './grading-score-fields'
import { GradingScoreAllocation, type GradingScoreAllocationProps } from './grading-score-allocation'
import { VoidQuestionButton } from './void-question-button'
import { GradingBatchProvider, GradingBatchSaveButton, useGradingBatch } from './grading-batch-provider'
import { useGradingNavigationGuard } from './grading-navigation-guard'

export interface GradingReviewQuery {
  classroom?: string
  sort?: 'classroom' | 'code' | 'number' | 'name'
  dir?: 'asc' | 'desc'
  page?: number
}

interface CommonProps {
  data: GradingWorkspaceData
  query?: GradingReviewQuery
  save?: typeof saveGradingReview
  configure?: GradingScoreAllocationProps['configure']
  correctionActions?: ReactNode | false
}

function hrefFor(path: string, query: GradingReviewQuery, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams()
  const values = { classroom: query.classroom, sort: query.sort, dir: query.dir, page: query.page, ...extra }
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '' && value !== 'all') params.set(key, String(value))
  return `${path}${params.size ? `?${params}` : ''}`
}

function orderedStudents(students: GradingStudent[], query: GradingReviewQuery) {
  const key = query.sort === 'number' ? 'classNumber' : query.sort === 'code' ? 'studentCode' : query.sort ?? 'classroom'
  return sortGradingStudents(students.filter(student => !query.classroom || query.classroom === 'all' || student.classroom === query.classroom), key, query.dir ?? 'asc')
}

function ReviewFilters({ data, query, path, navigate }: { data: GradingWorkspaceData; query: GradingReviewQuery; path: string; navigate: (href: string) => void }) {
  const { busy } = useGradingBatch()
  const rooms = [...new Set(data.students.map(student => student.classroom).filter((room): room is string => !!room))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))
  function change(patch: Partial<GradingReviewQuery>) { navigate(hrefFor(path, { ...query, ...patch, page: 1 })) }
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-busy={busy}>
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">ชั้น/ห้อง
      <NativeSelect className="w-auto max-w-40 pointer-coarse:min-h-11" aria-label="กรองชั้นและห้อง" value={query.classroom ?? 'all'} disabled={busy} onChange={event => change({ classroom: event.target.value })}><option value="all">ทุกห้อง</option>{rooms.map(room => <option key={room} value={room}>{room}</option>)}</NativeSelect>
    </label>
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">เรียงตาม
      <NativeSelect className="w-auto max-w-40 pointer-coarse:min-h-11" aria-label="เรียงคำตอบนักเรียน" value={query.sort ?? 'classroom'} disabled={busy} onChange={event => change({ sort: event.target.value as GradingReviewQuery['sort'] })}><option value="classroom">ชั้น/ห้อง</option><option value="code">รหัสนักเรียน</option><option value="number">เลขที่</option><option value="name">ชื่อ–สกุล</option></NativeSelect>
    </label>
    <Button type="button" variant="outline" className="pointer-coarse:min-h-11" disabled={busy} onClick={() => change({ dir: query.dir === 'desc' ? 'asc' : 'desc' })}><ArrowDownUp data-icon="inline-start" />{query.dir === 'desc' ? 'มาก→น้อย' : 'น้อย→มาก'}</Button>
  </div>
}

function StepNavigation({ previous, next, label, unit, position = 'ด้านบน' }: { previous?: string; next?: string; label: string; unit: 'ข้อ' | 'คน'; position?: 'ด้านบน' | 'ด้านล่าง' }) {
  return <nav aria-label={`เปลี่ยน${unit} ${position}`} className="flex flex-wrap items-center gap-1.5">
    {previous ? <Button variant="outline" className="pointer-coarse:min-h-11" render={<Link href={previous} />}><ChevronLeft data-icon="inline-start" />{unit}ก่อนหน้า</Button> : <Button variant="outline" disabled><ChevronLeft data-icon="inline-start" />{unit}ก่อนหน้า</Button>}
    <span className={cn('text-xs tabular-nums text-muted-foreground', position === 'ด้านล่าง' && 'hidden @min-[36rem]/grading-footer:inline')}>{label}</span>
    {next ? <Button variant="outline" className="pointer-coarse:min-h-11" render={<Link href={next} />}>{unit}ถัดไป<ChevronRight data-icon="inline-end" /></Button> : <Button variant="outline" disabled>{unit}ถัดไป<ChevronRight data-icon="inline-end" /></Button>}
  </nav>
}

function ReviewPagination({ count, page, path, query }: { count: number; page: number; path: string; query: GradingReviewQuery }) {
  const pages = Math.max(1, Math.ceil(count / 30))
  const nearby = [...new Set([1, page - 1, page, page + 1, pages])].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b)
  return <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
    <span className="hidden @min-[36rem]/grading-footer:inline">{count ? `${(page - 1) * 30 + 1}–${Math.min(page * 30, count)}` : '0'} จาก {count} คน</span>
    <nav aria-label="หน้าคำตอบนักเรียน" className="flex flex-wrap items-center gap-1">
      {page > 1 ? <Button variant="outline" size="icon" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="หน้าก่อนหน้า" render={<Link href={hrefFor(path, query, { page: page - 1 })} />}><ChevronLeft /></Button> : <Button variant="outline" size="icon" disabled aria-label="หน้าก่อนหน้า"><ChevronLeft /></Button>}
      {nearby.map((value, index) => <span key={value} className="flex items-center gap-1">{index > 0 && nearby[index - 1] < value - 1 && <span>…</span>}<Button variant={value === page ? 'navigation' : 'ghost'} size="icon" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label={`หน้า ${value}`} aria-current={value === page ? 'page' : undefined} render={<Link href={hrefFor(path, query, { page: value })} />}>{value}</Button></span>)}
      {page < pages ? <Button variant="outline" size="icon" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="หน้าถัดไป" render={<Link href={hrefFor(path, query, { page: page + 1 })} />}><ChevronRight /></Button> : <Button variant="outline" size="icon" disabled aria-label="หน้าถัดไป"><ChevronRight /></Button>}
    </nav>
  </div>
}

function AnswerStatus({ answer, question }: { answer: GradingAnswer; question: Question }) {
  const parts = scoreParts(answer, question)
  if (answer.isVoid || answer.maxScore <= 0) return <Badge variant="secondary">โมฆะ · ไม่นับคะแนน</Badge>
  return <div className="flex flex-wrap items-center gap-1.5">
    {parts.answer.pending && <Badge variant="statusWarning"><Clock3 aria-hidden="true" />รอตรวจคำตอบ</Badge>}
    {pendingWorkForReview(parts) && <Badge variant="statusWarning"><Clock3 aria-hidden="true" />รอตรวจวิธีทำ</Badge>}
    {!parts.pending && <Badge variant={answer.scoreEditedBy ? 'secondary' : 'statusSuccess'}>{answer.scoreEditedBy ? <PencilLine aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{answer.scoreEditedBy ? 'ครูปรับคะแนนแล้ว' : parts.answer.source === 'automatic' && !parts.hasWork ? 'ตรวจแล้วโดยระบบ' : 'ครูตรวจแล้ว'}</Badge>}
  </div>
}

function AnswerCard({ data, student, question, answer, person, occurrence, sequence }: CommonProps & { student: GradingStudent; question: Question; answer?: GradingAnswer; person?: boolean; occurrence?: number; sequence?: number }) {
  const number = sequence ?? data.questions.findIndex(item => item.id === question.id) + 1
  return <Card radius="md" className="@container/review-answer px-3 py-2.5">
    <article className="flex min-w-0 flex-col gap-2" aria-label={person ? `ข้อ ${number} ${question.title}` : `คำตอบของ ${student.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        {person ? <div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">ข้อ {number} · {question.title}</h3><Badge variant="outline">{TYPE_LABEL[question.question_type] ?? question.question_type}</Badge>{occurrence && <span className="text-xs text-muted-foreground">ครั้งที่ตอบ {occurrence}</span>}</div> : <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5"><h3 className="text-sm font-semibold">{student.name}</h3><p className="text-xs text-muted-foreground">{student.classroom || 'ไม่ระบุชั้น/ห้อง'} · เลขที่ {student.classNumber ?? '—'} · รหัส {student.studentCode || '—'}{student.attemptNumber && student.attemptNumber > 1 ? ` · รอบที่ ${student.attemptNumber}` : ''}{occurrence ? ` · ครั้งที่ตอบ ${occurrence}` : ''}</p></div>}
        {answer ? <AnswerStatus answer={answer} question={question} /> : <Badge variant="secondary">{student.submissionId ? 'ไม่ได้รับโจทย์ข้อนี้' : 'ยังไม่ส่งคำตอบ'}</Badge>}
      </div>
      {person && <GradingQuestionContent question={question} answer={answer} />}
      {answer ? <div className="grid min-w-0 gap-3 @min-[48rem]/review-answer:grid-cols-[minmax(0,1fr)_18rem]">
        <GradingAnswerContent question={question} answer={answer} showQuestionVariant={!person} workLabel={`วิธีทำที่แนบของ ${student.name} ข้อ ${number}${occurrence ? ` ครั้งที่ตอบ ${occurrence}` : ''}`} />
        <div className="min-w-0"><GradingScoreFields question={question} answer={answer} disabled={data.reviewAvailable === false} studentName={student.name} occurrence={occurrence} /></div>
      </div> : <p className="text-sm text-muted-foreground">{student.submissionId ? 'ไม่มีคำตอบของข้อนี้ในรอบที่เลือก จึงไม่นับเป็นข้อรอตรวจ' : 'จะแสดงคำตอบเมื่อนักเรียนส่งงานแล้ว'}</p>}
      {person && answer && scoreParts(answer, question).needsAllocation && <p className="text-xs text-muted-foreground">ยังไม่ได้กำหนดสัดส่วนคะแนนคำตอบและวิธีทำ <Link href={`${data.baseHref}/questions/${question.id}`} className="text-primary underline underline-offset-2">กำหนดสัดส่วนคะแนน</Link></p>}
    </article>
  </Card>
}

function QuestionDisclosure({ data, question, configure, correctionActions }: { data: GradingWorkspaceData; question: Question; configure?: GradingScoreAllocationProps['configure']; correctionActions?: ReactNode | false }) {
  const [open, setOpen] = useState(true)
  const { hasUnsavedChanges, busy } = useGradingBatch()
  return <Card radius="md" className="overflow-hidden"><Collapsible open={open} onOpenChange={setOpen}>
    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium">โจทย์</span><Badge variant="outline">{TYPE_LABEL[question.question_type] ?? question.question_type}</Badge></div>
      <div className="flex flex-wrap items-center gap-1.5">
        {correctionActions === undefined ? <><Button variant="ghost" className="pointer-coarse:min-h-11" render={<Link href={`/questions/${question.id}/edit`} />}><PencilLine data-icon="inline-start" />แก้เฉลย</Button><VoidQuestionButton assignmentId={data.assignment.id} questionId={question.id} isVoid={data.voidedQuestionIds.includes(question.id)} /></> : correctionActions}
        <CollapsibleTrigger render={<Button variant="ghost" className="pointer-coarse:min-h-11" />}>{open ? 'ซ่อนโจทย์' : 'แสดงโจทย์'}{open ? <ChevronUp data-icon="inline-end" /> : <ChevronDown data-icon="inline-end" />}</CollapsibleTrigger>
      </div>
    </div>
    <CollapsibleContent><div className="px-3 py-2.5"><GradingQuestionContent question={question} /></div></CollapsibleContent>
    <GradingScoreAllocation data={data} question={question} configure={configure} disabled={hasUnsavedChanges || busy} />
  </Collapsible></Card>
}

function reviewDraftKey(data: GradingWorkspaceData, focus: string, query: GradingReviewQuery = {}) {
  return JSON.stringify([data.assignment.id, focus, query.classroom ?? 'all', query.sort ?? 'classroom', query.dir ?? 'asc', query.page ?? 1])
}

function ReviewSaveFooter({ children }: { children: ReactNode }) {
  const { error } = useGradingBatch()
  return <Card radius="md" className="@container/grading-footer sticky bottom-2 flex min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-background px-3 py-2">
    {error && <Alert variant="destructive" className="w-full py-1.5"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="min-w-0 flex-1 basis-full @min-[36rem]/grading-footer:basis-auto">{children}</div>
    <GradingBatchSaveButton className="ml-auto" />
  </Card>
}

export function QuestionGradingReview(props: CommonProps & { questionId: string }) {
  return <GradingBatchProvider key={reviewDraftKey(props.data, `question:${props.questionId}`, props.query)} assignmentId={props.data.assignment.id} save={props.save} disabled={props.data.reviewAvailable === false}>
    <QuestionReviewBody {...props} />
  </GradingBatchProvider>
}

function QuestionReviewBody({ data, questionId, query = {}, configure, correctionActions }: CommonProps & { questionId: string }) {
  const { navigate, dialog } = useGradingNavigationGuard()
  const index = data.questions.findIndex(question => question.id === questionId)
  const question = data.questions[index]
  if (!question) return <ReviewEmpty title="ไม่พบโจทย์ข้อนี้" description="โจทย์อาจถูกนำออกจากงานแล้ว" />
  const students = orderedStudents(data.students, query)
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1)), Math.max(1, Math.ceil(students.length / 30)))
  const rows = students.slice((page - 1) * 30, page * 30)
  const path = `${data.baseHref}/questions/${questionId}`
  return <div className="flex min-w-0 flex-col gap-3">
    <GradingWorkspaceHeader data={data} title="ตรวจคำตอบรายข้อ" />
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" className="pointer-coarse:min-h-11" render={<Link href={hrefFor(data.baseHref, query, { view: 'questions', page: undefined })} />}><ArrowLeft data-icon="inline-start" />กลับตารางรายข้อ</Button><StepNavigation previous={index > 0 ? hrefFor(`${data.baseHref}/questions/${data.questions[index - 1].id}`, query, { page: 1 }) : undefined} next={index < data.questions.length - 1 ? hrefFor(`${data.baseHref}/questions/${data.questions[index + 1].id}`, query, { page: 1 }) : undefined} label={`ข้อ ${index + 1} / ${data.questions.length}`} unit="ข้อ" /></div>
    <h2 className="text-base font-semibold">ข้อ {index + 1} · {question.title}</h2>
    <QuestionDisclosure key={question.id} data={data} question={question} configure={configure} correctionActions={correctionActions} />
    <div className="flex flex-wrap items-center justify-between gap-2"><ReviewFilters data={data} query={query} path={path} navigate={navigate} /><span className="text-xs text-muted-foreground">{students.length} คน · 30 คนต่อหน้า</span></div>
    {rows.length ? <div className="flex flex-col gap-2">{rows.flatMap(student => {
      const answers = data.answers.filter(answer => answer.studentId === student.id && answer.questionId === questionId).sort((a, b) => a.orderIndex - b.orderIndex)
      return answers.length ? answers.map((answer, occurrence) => <AnswerCard key={answer.id} data={data} student={student} question={question} answer={answer} occurrence={answers.length > 1 ? occurrence + 1 : undefined} />) : <AnswerCard key={student.id} data={data} student={student} question={question} />
    })}</div> : <ReviewEmpty title="ไม่พบนักเรียนในตัวกรองนี้" description="ลองเลือกชั้น/ห้องอื่น" />}
    <ReviewSaveFooter><ReviewPagination count={students.length} page={page} path={path} query={query} /></ReviewSaveFooter>
    {dialog}
  </div>
}

export function StudentGradingReview(props: CommonProps & { studentId: string }) {
  return <GradingBatchProvider key={reviewDraftKey(props.data, `student:${props.studentId}`, props.query)} assignmentId={props.data.assignment.id} save={props.save} disabled={props.data.reviewAvailable === false}>
    <StudentReviewBody {...props} />
  </GradingBatchProvider>
}

function StudentReviewBody({ data, studentId, query = {} }: CommonProps & { studentId: string }) {
  const { dialog } = useGradingNavigationGuard()
  const student = data.students.find(item => item.id === studentId)
  if (!student) return <ReviewEmpty title="ไม่พบนักเรียนคนนี้" description="กลับตารางรายคนเพื่อเลือกรายชื่ออีกครั้ง" />
  const filtered = orderedStudents(data.students, query)
  const roster = filtered.some(item => item.id === studentId) ? filtered : orderedStudents(data.students, { ...query, classroom: undefined })
  const index = roster.findIndex(item => item.id === studentId)
  const answers = data.answers.filter(answer => answer.studentId === studentId).sort((a, b) => a.orderIndex - b.orderIndex)
  const reviewedAnswers = answers.flatMap(answer => { const question = data.questions.find(item => item.id === answer.questionId); return question ? [{ answer, question }] : [] })
  const pendingCount = answers.filter(answer => { const question = data.questions.find(item => item.id === answer.questionId); return question && scoreParts(answer, question).pending }).length
  const streak = data.assignment.completionRule === 'streak'
  const scoreLabel = streak ? 'ผลการทำงาน' : 'คะแนนปัจจุบัน'
  const scoreValue = !answers.length ? 'ยังไม่มีผลคะแนน' : streak ? student.streakReached ? 'ผ่านเกณฑ์' : 'ยังไม่ผ่านเกณฑ์' : student.maxScore > 0 ? `${(student.score ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}/${student.maxScore.toLocaleString('th-TH', { maximumFractionDigits: 2 })}` : 'ไม่มีข้อที่นับคะแนน'
  const stepper = (position: 'ด้านบน' | 'ด้านล่าง') => <StepNavigation previous={index > 0 ? hrefFor(`${data.baseHref}/students/${roster[index - 1].id}`, query) : undefined} next={index < roster.length - 1 ? hrefFor(`${data.baseHref}/students/${roster[index + 1].id}`, query) : undefined} label={`${index + 1} / ${roster.length} คน`} unit="คน" position={position} />
  return <div className="flex min-w-0 flex-col gap-3">
    <GradingWorkspaceHeader data={data} title="ตรวจคำตอบรายคน" />
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" className="pointer-coarse:min-h-11" render={<Link href={hrefFor(data.baseHref, query, { view: 'students' })} />}><ArrowLeft data-icon="inline-start" />กลับตารางรายคน</Button>{stepper('ด้านบน')}</div>
    <Card radius="md" className="flex flex-wrap items-center justify-between gap-2 bg-primary/5 px-3 py-2.5"><div><h2 className="text-base font-semibold">{student.name}</h2><p className="text-xs text-foreground/75">{student.classroom || 'ไม่ระบุชั้น/ห้อง'} · เลขที่ {student.classNumber ?? '—'} · รหัสนักเรียน {student.studentCode || '—'}{student.attemptNumber ? ` · ครั้งที่ ${student.attemptNumber}` : ''}</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-foreground/75">{scoreLabel}</span><strong className="text-sm tabular-nums text-primary">{scoreValue}</strong><Badge variant={pendingCount ? 'statusWarning' : 'statusSuccess'}>{pendingCount ? `รอตรวจ ${pendingCount} ข้อ` : answers.length ? 'ตรวจครบแล้ว' : 'ยังไม่ส่งคำตอบ'}</Badge></div></Card>
    {reviewedAnswers.length ? <><p className="text-xs text-muted-foreground">คำตอบทั้งหมด {reviewedAnswers.length} ข้อ · ครูแก้คะแนนได้ทุกข้อ · ส่วนที่รอตรวจแสดง 0 ชั่วคราว</p><div className="flex flex-col gap-2">{reviewedAnswers.map(({ question, answer }, index) => {
      const repeats = reviewedAnswers.filter(item => item.question.id === question.id)
      return <AnswerCard key={answer.id} data={data} student={student} question={question} answer={answer} sequence={index + 1} occurrence={repeats.length > 1 ? repeats.findIndex(item => item.answer.id === answer.id) + 1 : undefined} person />
    })}</div><ReviewSaveFooter>{stepper('ด้านล่าง')}</ReviewSaveFooter></> : <ReviewEmpty title="ยังไม่มีคำตอบที่ส่งแล้ว" description="จะแสดงโจทย์และคำตอบเมื่อนักเรียนส่งงาน" />}
    {dialog}
  </div>
}

function ReviewEmpty({ title, description }: { title: string; description: string }) {
  return <Empty className="gap-2 py-6"><EmptyHeader className="gap-1"><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>
}

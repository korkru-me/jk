'use client'

import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye } from 'lucide-react'
import { GradingWorkspaceHeader } from '@/components/assignments/grading-workspace-header'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { scoreParts, type GradingStudent, type GradingWorkspaceData } from '@/lib/grading-workspace'
import { gradingReviewPresentation } from '@/lib/grading-review-status'
import { questionExcerpt, TYPE_LABEL } from '@/lib/question-display'
import { isTrueFalseGroupQuestion } from '@/lib/true-false-group'
import { sortStudentsByRules, type SortableStudentProfile, type StudentSortDir, type StudentSortKey } from '@/lib/student-sort'
import type { ClassifyConfig, CompositeConfig, FileUploadConfig, FillBlankConfig, ImageLabelConfig, MatchingConfig, MatchingPair, MCQOption, OrderingConfig, Question, RandomQuestionConfig, TrueFalseConfig } from '@/lib/types'

const PAGE_SIZE = 30
type StudentOrder = 'classroom' | 'number' | 'code' | 'name'
export interface GradingOverviewQuery {
  view?: 'questions' | 'students'
  classroom?: string
  sort?: StudentOrder
  dir?: StudentSortDir
  page?: number
}

interface Props {
  data: GradingWorkspaceData
  initialQuery?: GradingOverviewQuery
  /** Late adjustments and streak tools stay in a compact disclosure. */
  tools?: ReactNode
}

function classroomLabel(student: GradingStudent) {
  if (student.classroom) return student.classroom
  if (student.gradeLevel) return `${student.gradeLevel}${student.sectionNumber == null ? '' : `/${student.sectionNumber}`}`
  return 'ไม่ระบุชั้น/ห้อง'
}

function formatCount(value: number) {
  return value.toLocaleString('th-TH')
}

function WorkspacePagination({ page, total, label, onChange }: {
  page: number; total: number; label: string; onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
    <p>{total === 0 ? '0 รายการ' : `${formatCount((page - 1) * PAGE_SIZE + 1)}–${formatCount(Math.min(page * PAGE_SIZE, total))} จาก ${formatCount(total)}`} · {PAGE_SIZE} รายการต่อหน้า</p>
    {pages > 1 && <nav aria-label={label} className="flex items-center gap-1">
      <Button type="button" size="icon-sm" variant="outline" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" disabled={page <= 1} aria-label="หน้าก่อนหน้า" onClick={() => onChange(page - 1)}><ChevronLeft /></Button>
      <NativeSelect value={String(page)} aria-label={`เลือกหน้า — ${label}`} className="w-auto pointer-coarse:min-h-11" onChange={event => onChange(Number(event.target.value))}>
        {Array.from({ length: pages }, (_, index) => <option key={index} value={index + 1}>หน้า {index + 1}/{pages}</option>)}
      </NativeSelect>
      <Button type="button" size="icon-sm" variant="outline" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" disabled={page >= pages} aria-label="หน้าถัดไป" onClick={() => onChange(page + 1)}><ChevronRight /></Button>
    </nav>}
  </div>
}

export function GradingOverview({ data, initialQuery, tools }: Props) {
  const [view, setView] = useState<'questions' | 'students'>(initialQuery?.view ?? 'questions')
  const [classroom, setClassroom] = useState(initialQuery?.classroom ?? 'all')
  const [sort, setSort] = useState<StudentOrder>(initialQuery?.sort ?? 'classroom')
  const [direction, setDirection] = useState<StudentSortDir>(initialQuery?.dir ?? 'asc')
  const initialPage = Number.isSafeInteger(initialQuery?.page) && (initialQuery?.page ?? 0) > 0 ? initialQuery!.page! : 1
  const [questionPage, setQuestionPage] = useState(initialQuery?.view === 'students' ? 1 : initialPage)
  const [studentPage, setStudentPage] = useState(initialQuery?.view === 'students' ? initialPage : 1)
  const [preview, setPreview] = useState<Question | null>(null)
  const [confirmingPreviewClose, setConfirmingPreviewClose] = useState(false)
  const previewTrigger = useRef<HTMLElement | null>(null)
  const dismissFocus = useRef<HTMLElement | null>(null)
  const controlId = useId()

  const classroomOptions = useMemo(() => [...new Set(data.students.map(classroomLabel))]
    .sort((left, right) => left.localeCompare(right, 'th', { numeric: true })), [data.students])
  const submittedIds = useMemo(() => new Set(data.students.filter(student => student.submissionId != null
    && (student.status == null || student.status === 'submitted' || student.status === 'graded'))
    .map(student => student.submissionId!)), [data.students])
  const savedDraftIds = new Set((data.savedDrafts ?? []).map(draft => draft.answerId))
  const draftQuestions = new Set(data.answers.filter(answer => savedDraftIds.has(answer.id)).map(answer => answer.questionId))
  const draftStudents = new Set(data.answers.filter(answer => savedDraftIds.has(answer.id)).map(answer => answer.studentId))
  const questionById = useMemo(() => new Map(data.questions.map(question => [question.id, question])), [data.questions])
  const reviewSummary = useMemo(() => {
    const questions = new Map<string, { automatic: number; teacher: number; pendingAnswer: number; pendingWork: number; count: number; hasWork: boolean }>()
    const pendingStudents = new Set<string>()
    for (const answer of data.answers) {
      if (!submittedIds.has(answer.submissionId)) continue
      const question = questionById.get(answer.questionId)
      if (!question) continue
      const item = questions.get(answer.questionId) ?? { automatic: 0, teacher: 0, pendingAnswer: 0, pendingWork: 0, count: 0, hasWork: false }
      item.count++
      if (!answer.isVoid && !data.voidedQuestionIds.includes(answer.questionId)) {
        const parts = scoreParts(answer, question)
        const status = gradingReviewPresentation(parts)
        if (status.automatic) item.automatic++
        if (parts.hasWork || status.pendingWork) item.hasWork = true
        if (status.teacher) item.teacher++
        if (status.pendingAnswer) item.pendingAnswer++
        if (status.pendingWork) item.pendingWork++
        if (parts.pending) pendingStudents.add(answer.studentId)
      }
      questions.set(answer.questionId, item)
    }
    return { questions, pendingStudents }
  }, [data.answers, data.voidedQuestionIds, questionById, submittedIds])

  const sortedStudents = useMemo(() => {
    const profiles: Record<string, SortableStudentProfile> = Object.fromEntries(data.students.map(student => [student.id, {
      grade_level: student.gradeLevel, section_number: student.sectionNumber,
      class_number: student.classNumber, student_code: student.studentCode,
    }]))
    const filtered = data.students.filter(student => classroom === 'all' || classroomLabel(student) === classroom)
      .map(student => ({ ...student, full_name: student.name }))
    const keys: StudentSortKey[] = sort === 'classroom' ? ['grade', 'section', 'number'] : [sort]
    const ordered = sortStudentsByRules(filtered, profiles, keys.map(key => ({ key, dir: direction })))
    if (sort !== 'classroom') return ordered
    return ordered.sort((left, right) => {
      const leftMissing = !left.classroom && !left.gradeLevel
      const rightMissing = !right.classroom && !right.gradeLevel
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
      const compared = classroomLabel(left).localeCompare(classroomLabel(right), 'th', { numeric: true })
      return direction === 'asc' ? compared : -compared
    })
  }, [data.students, classroom, sort, direction])
  const currentQuestionPage = Math.min(questionPage, Math.max(1, Math.ceil(data.questions.length / PAGE_SIZE)))
  const currentStudentPage = Math.min(studentPage, Math.max(1, Math.ceil(sortedStudents.length / PAGE_SIZE)))
  const questionOffset = (currentQuestionPage - 1) * PAGE_SIZE
  const studentOffset = (currentStudentPage - 1) * PAGE_SIZE

  function detailHref(kind: 'questions' | 'students', id: string) {
    const query = new URLSearchParams({ view: kind, sort, dir: direction, page: String(kind === 'students' ? currentStudentPage : currentQuestionPage) })
    if (classroom !== 'all') query.set('classroom', classroom)
    return `${data.baseHref}/${kind}/${encodeURIComponent(id)}?${query}`
  }

  function openPreview(question: Question, trigger: HTMLElement) {
    previewTrigger.current = trigger
    setConfirmingPreviewClose(false)
    setPreview(question)
  }

  const descending = direction === 'desc'
  const directionLabel = descending ? 'มากไปน้อย' : 'น้อยไปมาก'
  const toggleLabel = `เรียงจาก${directionLabel} · กดเพื่อเรียงจาก${descending ? 'น้อยไปมาก' : 'มากไปน้อย'}`

  return <div className="flex min-w-0 flex-col gap-3" data-grading-overview>
    <GradingWorkspaceHeader data={data} />
    <Tabs value={view} onValueChange={value => setView(value === 'students' ? 'students' : 'questions')} className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label="มุมมองการตรวจ" className="pointer-coarse:min-h-11">
          <TabsTrigger value="questions" className="px-3 pointer-coarse:min-h-11">รายข้อ</TabsTrigger>
          <TabsTrigger value="students" className="px-3 pointer-coarse:min-h-11">รายคน</TabsTrigger>
        </TabsList>
        {view === 'questions' ? <p className="text-xs text-muted-foreground">{formatCount(data.questions.length)} ข้อ · {formatCount(submittedIds.size)} คนส่งแล้ว</p> : (
          <FieldGroup className="min-w-0 max-w-full flex-1 basis-[32rem] flex-row flex-wrap items-center justify-end gap-2">
            <Field orientation="horizontal" className="w-auto max-w-full shrink-0 gap-1.5">
              <FieldLabel htmlFor={`${controlId}-classroom`} className="whitespace-nowrap text-xs text-foreground/80">ชั้น/ห้อง</FieldLabel>
              <NativeSelect id={`${controlId}-classroom`} value={classroom} className="h-7 w-auto max-w-48 bg-card font-medium text-foreground pointer-coarse:min-h-11" onChange={event => { setClassroom(event.target.value); setStudentPage(1) }}>
                <option value="all">ทุกห้อง</option>
                {classroomOptions.map(label => <option key={label} value={label}>{label}</option>)}
              </NativeSelect>
            </Field>
            <Field orientation="horizontal" className="w-auto max-w-full shrink-0 gap-1.5">
              <FieldLabel htmlFor={`${controlId}-sort`} className="whitespace-nowrap text-xs text-foreground/80">เรียงตาม</FieldLabel>
              <NativeSelect id={`${controlId}-sort`} value={sort} className="h-7 w-auto bg-card font-medium text-foreground pointer-coarse:min-h-11" onChange={event => { setSort(event.target.value as StudentOrder); setStudentPage(1) }}>
                <option value="classroom">ชั้น/ห้อง</option><option value="number">เลขที่</option><option value="code">รหัสนักเรียน</option><option value="name">ชื่อ–สกุล</option>
              </NativeSelect>
            </Field>
            <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" aria-label={toggleLabel} title={toggleLabel} onClick={() => { setDirection(value => value === 'asc' ? 'desc' : 'asc'); setStudentPage(1) }}>
              {descending ? <ArrowDownWideNarrow data-icon="inline-start" aria-hidden="true" /> : <ArrowUpNarrowWide data-icon="inline-start" aria-hidden="true" />}{directionLabel}
            </Button>
          </FieldGroup>
        )}
      </div>

      <TabsContent value="questions" className="flex flex-col gap-2">
        <Card radius="md" className="min-w-0 overflow-hidden">
          <Table className="min-w-[680px]">
            <TableHeader><TableRow className="bg-muted/50"><TableHead className="w-16 px-3">ลำดับ</TableHead><TableHead className="px-3">โจทย์</TableHead><TableHead className="px-3">ประเภทข้อสอบ</TableHead><TableHead className="px-3">สถานะการตรวจ</TableHead><TableHead className="px-3">คำตอบนักเรียน</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.questions.slice(questionOffset, questionOffset + PAGE_SIZE).map((question, index) => {
                const position = questionOffset + index + 1
                const summary = reviewSummary.questions.get(question.id)
                const isVoid = data.voidedQuestionIds.includes(question.id)
                return <TableRow key={question.id}>
                  <TableCell className="px-3 text-muted-foreground">{position}</TableCell>
                  <TableCell className="px-3">
                    <div className="flex items-center gap-1.5">
                      <Tooltip><TooltipTrigger render={<Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" aria-label={`ข้อ ${position}${question.title ? ` · ${question.title}` : ''}`} onClick={event => openPreview(question, event.currentTarget)}>ข้อ {position}</Button>} />
                        <TooltipContent align="start"><div className="flex max-w-72 flex-col gap-1"><strong>{question.title || `โจทย์ข้อ ${position}`}</strong><p>{questionExcerpt(question.question_text).slice(0, 180) || 'ไม่มีข้อความโจทย์'}</p></div></TooltipContent>
                      </Tooltip>
                      <Button type="button" size="icon-sm" variant="outline" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label={`ดูตัวอย่างโจทย์ข้อ ${position}`} onClick={event => openPreview(question, event.currentTarget)}><Eye /></Button>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 text-muted-foreground">{isTrueFalseGroupQuestion(question) ? 'ถูก–ผิดแบบชุด' : question.question_type === 'true_false' ? 'ถูก–ผิด' : TYPE_LABEL[question.question_type] ?? 'ไม่ระบุประเภท'}</TableCell>
                  <TableCell className="px-3 whitespace-normal"><div className="flex min-w-80 flex-wrap gap-1.5">
                    {isVoid ? <Badge variant="secondary">โมฆะ · ไม่นับคะแนน</Badge> : !summary?.count ? <span className="text-xs text-muted-foreground">ยังไม่มีคำตอบที่ส่งแล้ว</span> : <>
                      {summary.automatic > 0 && <Badge variant="statusSuccess"><CheckCircle2 aria-hidden="true" />{summary.hasWork ? 'ระบบตรวจคำตอบแล้ว' : 'ตรวจแล้วโดยระบบ'} {formatCount(summary.automatic)} รายการ</Badge>}
                      {summary.teacher > 0 && <Badge variant="statusSuccess"><CheckCircle2 aria-hidden="true" />ครูตรวจแล้ว {formatCount(summary.teacher)} รายการ</Badge>}
                      {summary.pendingAnswer > 0 && <Badge variant="statusWarning"><Clock aria-hidden="true" />รอตรวจคำตอบ {formatCount(summary.pendingAnswer)} รายการ</Badge>}
                      {summary.pendingWork > 0 && <Badge variant="statusWarning"><Clock aria-hidden="true" />รอตรวจวิธีทำ {formatCount(summary.pendingWork)} รายการ</Badge>}
                      {summary.automatic + summary.teacher + summary.pendingAnswer + summary.pendingWork === 0 && <Badge variant="secondary">ไม่นับคะแนน</Badge>}
                    </>}
                    {draftQuestions.has(question.id) && <Badge variant="secondary">มีร่าง · ยังไม่ส่งคะแนนนักเรียน</Badge>}
                  </div></TableCell>
                  <TableCell className="px-3"><Button size="sm" variant="outline" className="pointer-coarse:min-h-11" render={<Link href={detailHref('questions', question.id)} prefetch={false} />}>ตรวจ/ดูคำตอบ<ArrowUpRight data-icon="inline-end" /></Button></TableCell>
                </TableRow>
              })}
              {data.questions.length === 0 && <TableRow><TableCell colSpan={5}><Empty className="gap-2 p-4"><EmptyHeader><EmptyTitle>ยังไม่มีโจทย์ในงานนี้</EmptyTitle></EmptyHeader></Empty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
        <WorkspacePagination page={currentQuestionPage} total={data.questions.length} label="หน้ารายการโจทย์" onChange={setQuestionPage} />
      </TabsContent>

      <TabsContent value="students" className="flex flex-col gap-2">
        <Card radius="md" className="min-w-0 overflow-hidden">
          <Table className="min-w-[820px]">
            <TableHeader><TableRow className="bg-muted/50"><TableHead className="w-16 px-3">ลำดับ</TableHead><TableHead className="px-3">ชั้น/ห้อง</TableHead><TableHead className="px-3">เลขที่</TableHead><TableHead className="px-3">รหัสนักเรียน</TableHead><TableHead className="px-3">ชื่อ–สกุล</TableHead><TableHead className="px-3">สถานะการตรวจ</TableHead><TableHead className="px-3">ตรวจรายคน</TableHead></TableRow></TableHeader>
            <TableBody>
              {sortedStudents.slice(studentOffset, studentOffset + PAGE_SIZE).map((student, index) => {
                const submitted = student.submissionId != null && (student.status == null || student.status === 'submitted' || student.status === 'graded')
                const pending = reviewSummary.pendingStudents.has(student.id)
                return <TableRow key={student.id}>
                  <TableCell className="px-3 text-muted-foreground">{studentOffset + index + 1}</TableCell>
                  <TableCell className="px-3">{classroomLabel(student)}</TableCell><TableCell className="px-3">{student.classNumber ?? '—'}</TableCell><TableCell className="px-3">{student.studentCode || '—'}</TableCell><TableCell className="px-3 font-medium">{student.name}</TableCell>
                  <TableCell className="px-3">{!submitted ? <Badge variant="secondary">{student.status === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ส่ง'}</Badge> : <Badge variant={pending ? 'statusWarning' : 'statusSuccess'}>{pending ? 'มีข้อรอตรวจ' : 'ตรวจครบแล้ว'}</Badge>}{draftStudents.has(student.id) && <Badge variant="secondary" className="ml-1">มีร่าง · ยังไม่ส่งคะแนนนักเรียน</Badge>}</TableCell>
                  <TableCell className="px-3">{submitted ? <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" render={<Link href={detailHref('students', student.id)} prefetch={false} />}>ตรวจ/ดูคำตอบ<ArrowUpRight data-icon="inline-end" /></Button> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              })}
              {sortedStudents.length === 0 && <TableRow><TableCell colSpan={7}><Empty className="gap-2 p-4"><EmptyHeader><EmptyTitle>{data.students.length ? 'ไม่พบนักเรียนในชั้น/ห้องที่เลือก' : 'ยังไม่มีนักเรียนในงานนี้'}</EmptyTitle></EmptyHeader></Empty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
        <WorkspacePagination page={currentStudentPage} total={sortedStudents.length} label="หน้ารายชื่อนักเรียน" onChange={setStudentPage} />
      </TabsContent>
    </Tabs>

    {tools}
    <Dialog open={preview !== null} onOpenChange={(open, details) => {
      if (open) return
      if (details.reason === 'outside-press' || details.reason === 'escape-key') {
        details.cancel()
        dismissFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setConfirmingPreviewClose(true)
        return
      }
      setPreview(null)
    }}>
      <DialogContent className="gap-3 sm:max-w-3xl" finalFocus={previewTrigger}>
        <DialogHeader className="gap-1 pr-8"><DialogTitle>ตัวอย่างโจทย์ · ข้อ {preview ? data.questions.findIndex(question => question.id === preview.id) + 1 : ''}</DialogTitle><DialogDescription>{preview?.title || 'มุมมองนักเรียน'} · คำตอบในตัวอย่างจะไม่ถูกบันทึก</DialogDescription></DialogHeader>
        {preview && <QuestionSample key={preview.id} question={preview} />}
      </DialogContent>
      <ConfirmDialog open={confirmingPreviewClose} onOpenChange={setConfirmingPreviewClose}
        title="ปิดตัวอย่างโจทย์?" description="คำตอบที่ลองกรอกในตัวอย่างจะถูกยกเลิก คะแนนนักเรียนจะไม่เปลี่ยนแปลง"
        confirmLabel="ยืนยันปิด" cancelLabel="กลับไปดูต่อ" finalFocus={preview ? dismissFocus : previewTrigger}
        onConfirm={() => { setConfirmingPreviewClose(false); setPreview(null) }} />
    </Dialog>
  </div>
}

function QuestionSample({ question }: { question: Question }) {
  const extra = question.extra_data
  return <QuestionPreviewContent
    questionText={question.question_text} variables={question.variables ?? []}
    answerParts={question.question_type === 'written' ? question.answer_parts ?? [] : []}
    answerTolerance={question.answer_tolerance ?? undefined} isRandom={question.is_random} questionType={question.question_type}
    mcqOptions={question.question_type === 'mcq' ? (question.mcq_options ?? []) as MCQOption[] : []}
    matchingPairs={question.question_type === 'matching' ? (question.mcq_options ?? []) as unknown as MatchingPair[] : []}
    matchingConfig={question.question_type === 'matching' ? extra as MatchingConfig : undefined}
    imageUrls={question.image_urls ?? []}
    trueFalseConfig={question.question_type === 'true_false' ? extra as TrueFalseConfig : undefined}
    fillBlankConfig={question.question_type === 'fill_blank' ? extra as FillBlankConfig : undefined}
    orderingConfig={question.question_type === 'ordering' ? extra as OrderingConfig : undefined}
    compositeConfig={question.question_type === 'composite' ? extra as CompositeConfig : undefined}
    classifyConfig={question.question_type === 'classify' ? extra as ClassifyConfig : undefined}
    imageLabelConfig={question.question_type === 'image_label' ? extra as ImageLabelConfig : undefined}
    partLabelStyle={(extra as RandomQuestionConfig)?.part_label_style}
    attachmentUrls={question.question_type === 'file_upload' ? (extra as FileUploadConfig)?.attachment_urls ?? [] : []}
  />
}

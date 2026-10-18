'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { FlaskConical, RotateCcw, Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { VoidQuestionButton } from '@/components/assignments/void-question-button'
import {
  QuestionUpdateConfirmationProvider, useQuestionUpdate,
  type PreparedQuestionUpdate, type QuestionUpdateResult,
} from '@/components/questions/question-update-confirmation'
import { buildQuestionAnswerKeyAtValues, gradeAnswer } from '@/lib/assignment-attempt'
import { gradingSnapshot, isGradingDefinitionChanged, regradeAnswer, voidAnswer, type RegradableAnswer } from '@/lib/assignment-regrading'
import { rescaleToDisplayMax } from '@/lib/scoring'
import type { QuestionFormData } from '@/lib/actions/questions'
import type { Question } from '@/lib/types'

const QUESTION_ID = '00000000-0000-4000-a000-000000000090'
type LabType = 'mcq' | 'written'
type Draft = 'original' | 'corrected'
type LabAnswer = RegradableAnswer & { void_original_max_score: number }
interface LabStudent {
  name: string
  answer: LabAnswer
  originalScore: number
  originalMax: number
  otherScore: number
  otherMax: number
}
interface LabAssignment {
  id: string
  title: string
  type: 'exercise' | 'exam'
  manageable: boolean
  isVoid: boolean
  voidReason?: string
  students: LabStudent[]
}
interface LocalReceipt { kind: 'key' | 'void'; revision: number; content: string }

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const number = (value: number | null) => value == null ? '—' : value.toLocaleString('th-TH', { maximumFractionDigits: 2 })

function baseQuestion(type: LabType): Question {
  return {
    id: QUESTION_ID, question_type: type, title: 'โจทย์จำลอง',
    created_by: '00000000-0000-4000-a000-000000000091', org_id: null,
    team_edit_allowed: true, is_research_snapshot: false,
    research_snapshot_project_id: null, research_snapshot_source_id: null,
    category_id: '', grade_level: null, subject: null, difficulty: 'easy', visibility: 'private',
    question_text: type === 'mcq' ? '2 + 3 เท่ากับเท่าไร?' : 'จงหาค่าของ x × 2',
    answer_formula: type === 'written' ? 'x + 1' : '', answer_tolerance: 0,
    answer_parts: null, logic_rules: [], extra_data: {},
    variables: type === 'written' ? [{ name: 'x', min: 2, max: 7, step: 1 }] : [],
    mcq_options: type === 'mcq' ? [{ text: '4', is_correct: true }, { text: '5', is_correct: false }] : null,
    is_random: type === 'written', answer_unit: null, solution_text: null,
    solution_image_urls: [], tags: [], rejected_reason: null, image_urls: [], requires_work_image: false,
    parent_question_id: null, group_id: null, order_in_group: null,
    content_fingerprint: null, search_text: '', tag_count: 0,
    created_at: '2026-10-18T00:00:00.000Z', updated_at: '2026-10-18T00:00:00.000Z',
  }
}

function questionData(type: LabType, draft: Draft): QuestionFormData {
  const q = baseQuestion(type)
  return {
    title: q.title, question_text: q.question_text, question_type: type,
    subject: '', difficulty: 'easy', visibility: 'private', category_id: '', grade_level: '',
    is_random: q.is_random, variables: q.variables, logic_rules: [], answer_parts: [],
    answer_formula: type === 'written' ? draft === 'corrected' ? 'x * 2' : 'x + 1' : '',
    answer_unit: '', answer_tolerance: 0,
    mcq_options: type === 'mcq' ? [{ text: '4', is_correct: draft === 'original' }, { text: '5', is_correct: draft === 'corrected' }] : [],
    extra_data: {}, solution_text: '', solution_image_urls: [], tags: [], image_urls: [],
  }
}

function fromData(previous: Question, data: QuestionFormData): Question {
  return { ...previous, question_type: data.question_type, answer_formula: data.answer_formula,
    answer_parts: data.question_type === 'written' ? data.answer_parts : null,
    answer_tolerance: data.answer_tolerance, variables: data.variables,
    mcq_options: data.question_type === 'mcq' ? data.mcq_options : null, extra_data: data.extra_data ?? {} }
}

function createStudent(q: Question, index: number, selected: Draft, manual = false): LabStudent {
  const randomValues: Record<string, number> = q.question_type === 'written' ? { x: index % 2 === 0 ? 7 : 2 } : {}
  const skeleton = buildQuestionAnswerKeyAtValues(q, randomValues)
  const studentAnswer = q.question_type === 'mcq'
    ? selected === 'corrected' ? 'MCQ:1' : 'MCQ:0'
    : String(selected === 'corrected' ? randomValues.x! * 2 : randomValues.x! + 1)
  const id = `00000000-0000-4000-b000-${String(index).padStart(12, '0')}`
  const grade = gradeAnswer({ id, correct_answer: skeleton.correct_answer, student_answer: studentAnswer,
    max_score: 4, questions: gradingSnapshot(q) })
  const score = manual ? 2 : grade.score
  return {
    name: `นักเรียนตัวอย่าง ${index}`,
    answer: { id, correct_answer: skeleton.correct_answer, student_answer: studentAnswer,
      random_values: randomValues, option_order: [1, 0], math_input_modes: {}, max_score: 4,
      score, is_correct: manual ? false : grade.is_correct,
      score_edited_by: manual ? 'local-teacher' : null, is_void: false,
      grading_config: gradingSnapshot(q), void_original_max_score: 0 },
    originalScore: score, originalMax: 4, otherScore: 3, otherMax: 6,
  }
}

function initialAssignments(type: LabType): LabAssignment[] {
  const q = baseQuestion(type)
  return [
    { id: '00000000-0000-4000-c000-000000000091', title: 'แบบฝึกหัด ห้องตัวอย่าง ก', type: 'exercise', manageable: true, isVoid: false,
      students: [createStudent(q, 1, 'corrected'), createStudent(q, 2, 'original')] },
    { id: '00000000-0000-4000-c000-000000000092', title: 'ข้อสอบ ห้องตัวอย่าง ข', type: 'exam', manageable: true, isVoid: false,
      students: [createStudent(q, 3, 'corrected'), createStudent(q, 4, 'corrected', true), createStudent(q, 5, 'corrected')] },
    { id: '00000000-0000-4000-c000-000000000093', title: 'งานตัวอย่างนอกขอบเขตสิทธิ์', type: 'exercise', manageable: false, isVoid: false,
      students: [createStudent(q, 6, 'corrected')] },
  ]
}

function draftFingerprint(data: QuestionFormData) {
  const { regrade_confirmation: _receipt, ...content } = data
  return JSON.stringify(content)
}

export function GradingCorrectionsLab({ active, questionType }: { active: boolean; questionType: LabType }) {
  const [current, setCurrent] = useState(() => baseQuestion(questionType))
  const [assignments, setAssignments] = useState(() => initialAssignments(questionType))
  const [message, setMessage] = useState('เลือกเฉลยใหม่แล้วกดบันทึก เพื่อเปิดคำเตือนตัวจริงและดูคะแนนเปลี่ยนพร้อมกัน')
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const sequence = useRef(0)
  const receipts = useRef(new Map<string, LocalReceipt>())

  const impact = useCallback(() => {
    const manageable = assignments.filter(item => item.manageable)
    return { assignmentCount: manageable.length, submissionCount: manageable.reduce((sum, item) => sum + item.students.length, 0),
      manualCount: manageable.flatMap(item => item.students).filter(student => student.answer.score_edited_by).length,
      activeCount: active ? 1 : 0 }
  }, [assignments, active])

  const makeReceipt = useCallback((kind: LocalReceipt['kind'], content: string) => {
    const token = `synthetic-local-${kind}-${++sequence.current}`
    receipts.current.set(token, { kind, revision: revision.current, content })
    return token
  }, [])

  const prepareUpdate = useCallback(async (_id: string, data: QuestionFormData): Promise<PreparedQuestionUpdate> => {
    await pause(150)
    const changed = isGradingDefinitionChanged(current, fromData(current, data))
    return { requiresConfirmation: changed, impact: impact(), token: changed ? makeReceipt('key', draftFingerprint(data)) : undefined }
  }, [current, impact, makeReceipt])

  const applyUpdate = useCallback(async (_id: string, data: QuestionFormData): Promise<QuestionUpdateResult> => {
    const next = fromData(current, data)
    const changed = isGradingDefinitionChanged(current, next)
    const receipt = receipts.current.get(data.regrade_confirmation ?? '')
    if (changed && (!receipt || receipt.kind !== 'key' || receipt.revision !== revision.current || receipt.content !== draftFingerprint(data))) {
      return { error: 'ข้อมูลจำลองเปลี่ยนแล้ว กรุณาบันทึกและยืนยันใหม่' }
    }
    if (changed && active) return { error: 'ยังมีนักเรียนตัวอย่างกำลังทำ กรุณาใช้กรณีไม่มีรอบที่กำลังทำ' }
    setBusy(true)
    try {
      await pause(650)
      if (changed) setAssignments(previous => previous.map(assignment => assignment.manageable ? {
        ...assignment,
        students: assignment.students.map(student => ({ ...student, answer: {
          ...student.answer, ...regradeAnswer(current, next, student.answer),
        } })),
      } : assignment))
      setCurrent(next)
      revision.current++
      receipts.current.clear()
      setMessage(changed ? 'บันทึกเฉลยใหม่แล้ว: ตรวจย้อนหลัง 2 งาน / 5 รอบ เก็บคะแนนที่ครูแก้เอง 1 รายการ และคงงานนอกสิทธิ์ไว้' : 'เฉลยยังเหมือนเดิม คะแนนจำลองจึงไม่เปลี่ยน')
      return {}
    } finally { setBusy(false) }
  }, [current, active])

  const prepareVoid = useCallback(async (assignmentId: string, _questionId: string) => {
    await pause(150)
    const assignment = assignments.find(item => item.id === assignmentId && item.manageable)
    if (!assignment) return { error: 'ไม่มีสิทธิ์จัดการงานจำลองนี้' }
    return { token: makeReceipt('void', assignmentId), impact: { ...impact(), assignmentCount: 1,
      submissionCount: assignment.students.length } }
  }, [assignments, impact, makeReceipt])

  const applyVoid = useCallback(async (assignmentId: string, _questionId: string, token: string, reason: string) => {
    const receipt = receipts.current.get(token)
    if (!receipt || receipt.kind !== 'void' || receipt.content !== assignmentId || receipt.revision !== revision.current) return { error: 'คำยืนยันจำลองหมดอายุ กรุณาเปิดใหม่' }
    if (active) return { error: 'ยังมีนักเรียนตัวอย่างกำลังทำ' }
    if (reason.trim().length < 3) return { error: 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' }
    setBusy(true)
    try {
      await pause(650)
      setAssignments(previous => previous.map(assignment => assignment.id === assignmentId && assignment.manageable ? {
        ...assignment, isVoid: true, voidReason: reason.trim(),
        students: assignment.students.map(student => ({ ...student, answer: {
          ...student.answer, ...voidAnswer(student.answer),
          void_original_max_score: student.answer.is_void ? student.answer.void_original_max_score : student.answer.max_score,
        } })),
      } : assignment))
      revision.current++
      receipts.current.clear()
      setMessage('ทำข้อเป็นโมฆะในงานที่เลือกแล้ว: คะแนนข้อนี้เป็น 0/0 และตัดคะแนนเต็มออก โดยอีกงานยังใช้เฉลยและคะแนนเดิมของตน')
      return { success: true as const }
    } finally { setBusy(false) }
  }, [active])

  function reset() {
    setAssignments(initialAssignments(questionType)); setCurrent(baseQuestion(questionType))
    revision.current++; receipts.current.clear()
    setMessage('รีเซ็ตข้อมูลจำลองแล้ว คะแนนและเฉลยกลับเป็นค่าเริ่มต้น')
  }

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-background p-3 sm:p-5" data-testid="grading-corrections-lab">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-bold">ทดลองแก้เฉลยและโมฆะ</h1><Badge variant="warning">ข้อมูลจำลอง · LOCAL</Badge></div>
          <p className="text-xs text-muted-foreground">ไม่มีการอ่านหรือบันทึกข้อมูลนักเรียนจริง · ข้อมูลเริ่มใหม่เมื่อรีโหลดหน้า</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={reset}><RotateCcw data-icon="inline-start" />รีเซ็ตข้อมูลทดลอง</Button>
      </header>

      <nav aria-label="กรณีทดลอง" className="flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-4" href="/exam-screen-lab/grading-corrections">ปรนัย</Link>
        <Link className="underline underline-offset-4" href="/exam-screen-lab/grading-corrections?type=written">ตัวเลขสุ่มเดิม x = 2, 7</Link>
        <Link className="underline underline-offset-4" href={`/exam-screen-lab/grading-corrections?type=${questionType}&active=1`}>มีนักเรียนกำลังทำ</Link>
      </nav>

      <Alert>
        <FlaskConical aria-hidden="true" />
        <AlertTitle>{active ? 'กรณีทดลอง: มี 1 รอบที่กำลังทำ จึงต้องปิดกั้นการแก้คะแนน' : 'ใช้หน้าต่างยืนยันและปุ่มโมฆะชุดเดียวกับเว็บ'}</AlertTitle>
        <AlertDescription>ทดลองเปลี่ยนเฉลยให้ครบทั้งแบบฝึกหัดและข้อสอบ แล้วทำข้อเป็นโมฆะเฉพาะงาน คะแนนครู 1 รายการจะคงเดิมเมื่อแก้เฉลย</AlertDescription>
      </Alert>

      <QuestionUpdateConfirmationProvider prepare={prepareUpdate} update={applyUpdate}>
        <KeyEditor key={`${questionType}-${revision.current}`} type={questionType} current={current} busy={busy} onMessage={setMessage} />
      </QuestionUpdateConfirmationProvider>

      <p role="status" className="text-sm text-muted-foreground" data-testid="lab-status">{message}</p>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        {assignments.map(assignment => (
          <Card key={assignment.id} padding="sm" className="flex min-w-0 flex-col gap-2" data-testid={`assignment-${assignment.type}-${assignment.manageable ? 'managed' : 'outside'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{assignment.title}</h2><Badge variant={assignment.manageable ? 'secondary' : 'outline'}>{assignment.students.length} รอบ</Badge></div>
              {assignment.manageable ? <VoidQuestionButton assignmentId={assignment.id} questionId={QUESTION_ID} isVoid={assignment.isVoid} prepare={prepareVoid} apply={applyVoid} /> : <Badge variant="outline">อยู่นอกสิทธิ์ · คงเดิม</Badge>}
            </div>
            {assignment.voidReason && <p className="text-xs text-muted-foreground">เหตุผลโมฆะ: {assignment.voidReason}</p>}
            <div className="divide-y divide-border">
              {assignment.students.map(student => <StudentScore key={student.answer.id} student={student} type={questionType} />)}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">ทุกงานจำลองตั้งคะแนนเต็มแสดงผล 20 จากคะแนนดิบเดิม 10; คะแนนข้ออื่นคงที่ 3/6 เพื่อให้เห็นผลของข้อที่กำลังแก้เพียงข้อเดียว</p>
    </main>
  )
}

function KeyEditor({ type, current, busy, onMessage }: { type: LabType; current: Question; busy: boolean; onMessage: (message: string) => void }) {
  const update = useQuestionUpdate()
  const [draft, setDraft] = useState<Draft>(() => type === 'mcq'
    ? current.mcq_options?.[1]?.is_correct ? 'corrected' : 'original'
    : current.answer_formula === 'x * 2' ? 'corrected' : 'original')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const result = await update(QUESTION_ID, questionData(type, draft))
      if (result?.error) onMessage(result.error)
      if (result?.cancelled) onMessage('ยกเลิกแล้ว เฉลยและคะแนนยังไม่เปลี่ยน ร่างเฉลยที่เลือกยังอยู่')
    } catch { onMessage('บันทึกข้อมูลจำลองไม่สำเร็จ กรุณาลองใหม่') }
    finally { setSaving(false) }
  }

  return <Card padding="sm">
    <FieldGroup className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{current.question_text}</h2><Badge variant="secondary">คะแนนข้อนี้ 4 คะแนนดิบ</Badge></div>
      <FieldSet className="gap-2" disabled={saving || busy}>
        <FieldLegend variant="label">เลือกเฉลยที่ต้องการบันทึก</FieldLegend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {(['original', 'corrected'] as const).map(value => <Field key={value} orientation="horizontal" className="w-auto">
            <FieldLabel className="min-h-11 cursor-pointer gap-2" htmlFor={`lab-key-${value}`}>
              <input id={`lab-key-${value}`} type="radio" name="lab-answer-key" value={value} checked={draft === value} onChange={() => setDraft(value)} className="size-4 accent-primary" />
              {type === 'mcq' ? value === 'original' ? 'ก. 4 (เฉลยเดิม)' : 'ข. 5 (แก้เฉลย)' : value === 'original' ? 'x + 1 (สูตรเดิม)' : 'x × 2 (แก้สูตร)'}
            </FieldLabel>
          </Field>)}
        </div>
      </FieldSet>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">เฉลยที่บันทึกอยู่: {type === 'mcq' ? current.mcq_options?.[1]?.is_correct ? 'ข. 5' : 'ก. 4' : current.answer_formula} · มีผล 2 งาน / 5 รอบ</p>
        <Button type="button" size="sm" disabled={saving || busy} onClick={save} data-testid="save-key"><Save data-icon="inline-start" />{saving ? 'กำลังดำเนินการ…' : 'บันทึกเฉลย'}</Button>
      </div>
    </FieldGroup>
  </Card>
}

function StudentScore({ student, type }: { student: LabStudent; type: LabType }) {
  const answer = student.answer
  const raw = { total_score: student.otherScore + (answer.score ?? 0), max_score: student.otherMax + answer.max_score, voided_max_score: answer.void_original_max_score }
  const [visible] = rescaleToDisplayMax([raw], () => 20)
  const [initial] = rescaleToDisplayMax([{ total_score: student.otherScore + student.originalScore, max_score: student.otherMax + student.originalMax }], () => 20)
  const studentAnswer = type === 'mcq' ? answer.student_answer === 'MCQ:1' ? 'ข. 5' : 'ก. 4' : answer.student_answer
  return <div className="flex flex-col gap-1 py-2" data-testid={`score-${answer.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="text-sm font-medium">{student.name}</p>
      <p className="text-sm tabular-nums"><span className="text-muted-foreground">ก่อน {number(initial.total_score)}/{number(initial.max_score)}</span> → <strong>{number(visible.total_score)}/{number(visible.max_score)}</strong></p>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>คำตอบ: {studentAnswer}{type === 'written' ? ` · x = ${answer.random_values.x}` : ''}</span>
      <span>ข้อนี้ {number(answer.score)}/{number(answer.max_score)}</span>
      {answer.score_edited_by && <Badge variant="outline">ครูให้เอง</Badge>}
      {answer.is_void && <Badge variant="secondary">โมฆะ</Badge>}
      <span>ดิบ {number(raw.total_score)}/{number(raw.max_score)} · ตัดออก {number(raw.voided_max_score)} · ฐานเดิม {number(raw.max_score + raw.voided_max_score)}</span>
    </div>
  </div>
}

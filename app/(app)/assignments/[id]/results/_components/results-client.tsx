'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { ExportButton } from '@/components/assignments/export-button'
import { ScoreEditor } from '@/components/assignments/score-editor'
import { computePassed } from '@/lib/grading'
import { sortStudents, STUDENT_SORT_LABEL, type StudentSortKey, type StudentSortDir, type SortableStudentProfile } from '@/lib/student-sort'
import type { Question } from '@/lib/types'

export interface SubmittedRow {
  id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  attempt_number: number
  users: { full_name: string; email: string } | null
}

export interface AnswerRow {
  id: string
  submission_id: string
  question_id: string
  student_answer: string | null
  correct_answer: string
  is_correct: boolean | null
  score: number
  max_score: number
  option_order: number[] | null
  order_index: number
}

interface Props {
  assignmentId: string
  assignmentTitle: string
  classroomName: string | null
  passingType: 'score' | 'percent' | null
  passingValue: number | null
  questions: Question[]
  submitted: SubmittedRow[]
  answers: AnswerRow[]
  profiles: Record<string, SortableStudentProfile>
  inProgressCount: number
}

type ViewMode = 'individual' | 'question'

// Compact, single-line rendering of a student's answer for the per-question
// grid — the full rich review (with option highlighting, per-part work
// images, etc) lives at /submissions/[id]; this is meant for scanning a
// whole class at a glance, not a complete review.
function formatAnswerShort(q: Question | undefined, a: AnswerRow | undefined): string {
  if (!a || a.student_answer == null || a.student_answer === '') return '—'
  const studentAnswer = a.student_answer
  const correctAnswer = a.correct_answer ?? ''

  if (q?.question_type === 'mcq') return studentAnswer

  if (q?.question_type === 'file_upload') {
    try {
      const files = JSON.parse(studentAnswer)
      return Array.isArray(files) && files.length > 0 ? `ส่งไฟล์ ${files.length} ไฟล์` : 'ไม่ได้ส่งไฟล์'
    } catch { return '—' }
  }

  if (studentAnswer === 'true' || studentAnswer === 'false') return studentAnswer === 'true' ? 'จริง' : 'เท็จ'

  if (correctAnswer.startsWith('TF:')) {
    try {
      const parsed = JSON.parse(studentAnswer)
      const arr: string[] = parsed?.answers ?? []
      return arr.map(v => (v === 'true' ? 'จริง' : v === 'false' ? 'เท็จ' : '—')).join(', ')
    } catch { return studentAnswer }
  }

  if (correctAnswer.startsWith('FILL') || correctAnswer.startsWith('[') || correctAnswer.startsWith('ORDER:') || correctAnswer.startsWith('COMP:')) {
    try {
      const arr = JSON.parse(studentAnswer)
      return Array.isArray(arr) ? arr.map(v => (v === '' || v == null ? '—' : String(v))).join(', ') : studentAnswer
    } catch { return studentAnswer }
  }

  return studentAnswer
}

export function ResultsClient({
  assignmentId, assignmentTitle, classroomName, passingType, passingValue,
  questions, submitted, answers, profiles, inProgressCount,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('individual')
  const [sortKey, setSortKey] = useState<StudentSortKey>('name')
  const [sortDir, setSortDir] = useState<StudentSortDir>('asc')
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)

  const sortedRows = useMemo(() => {
    const sortable = submitted.map(s => ({ id: s.student_id, full_name: s.users?.full_name ?? '', row: s }))
    return sortStudents(sortable, profiles, sortKey, sortDir).map(s => s.row)
  }, [submitted, profiles, sortKey, sortDir])

  const answerMap = useMemo(() => {
    const map = new Map<string, AnswerRow>()
    for (const a of answers) map.set(`${a.submission_id}::${a.question_id}`, a)
    return map
  }, [answers])

  const avgScore = submitted.length > 0
    ? submitted.reduce((sum, s) => sum + (s.total_score ?? 0), 0) / submitted.length
    : null
  const maxScore = submitted[0]?.max_score ?? questions.length
  const hasPassingThreshold = passingType != null && passingValue != null
  const passCount = submitted.filter(
    s => computePassed(s.total_score, s.max_score, passingType, passingValue) === true
  ).length

  const activeQuestion = questions[activeQuestionIndex]

  function toggleSort(key: StudentSortKey) {
    setSortDir(d => (sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc'))
    setSortKey(key)
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link href={`/assignments/${assignmentId}`} className="text-sm text-gray-500 hover:text-blue-600">
            ← กลับ
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{assignmentTitle}</h1>
          <p className="text-sm text-gray-500">{classroomName}</p>
        </div>
        {viewMode === 'individual' && (
          <ExportButton submissions={sortedRows as any} title={assignmentTitle} />
        )}
      </div>

      {/* Summary cards */}
      <div className={`grid gap-3 ${hasPassingThreshold ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">ส่งแล้ว</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{submitted.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">คะแนนเฉลี่ย</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {avgScore !== null ? avgScore.toFixed(1) : '—'}/{maxScore}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">กำลังทำ</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{inProgressCount}</p>
        </div>
        {hasPassingThreshold && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500">
              ผ่านเกณฑ์ ({passingType === 'percent' ? `${passingValue}%` : `${passingValue} คะแนน`})
            </p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-600">{passCount}</span>
              <span className="text-gray-300"> / </span>
              <span className="text-red-500">{submitted.length - passCount}</span>
            </p>
          </div>
        )}
      </div>

      {/* Mode toggle + sort */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([
            { key: 'individual', label: 'รายคน' },
            { key: 'question', label: 'รายข้อ' },
          ] as { key: ViewMode; label: string }[]).map(m => (
            <button
              key={m.key}
              onClick={() => setViewMode(m.key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === m.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={sortKey}
            onChange={e => toggleSort(e.target.value as StudentSortKey)}
            className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 outline-none focus:border-blue-400"
          >
            {(Object.keys(STUDENT_SORT_LABEL) as StudentSortKey[]).map(k => (
              <option key={k} value={k}>{STUDENT_SORT_LABEL[k]}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            {sortDir === 'asc' ? 'น้อย→มาก' : 'มาก→น้อย'}
          </button>
        </div>
      </div>

      {viewMode === 'individual' ? (
        <IndividualTable rows={sortedRows} hasPassingThreshold={hasPassingThreshold} passingType={passingType} passingValue={passingValue} />
      ) : (
        <QuestionGrid
          questions={questions}
          activeQuestionIndex={activeQuestionIndex}
          activeQuestion={activeQuestion}
          onChangeIndex={setActiveQuestionIndex}
          rows={sortedRows}
          answerMap={answerMap}
        />
      )}
    </div>
  )
}

// ─── Individual mode ───────────────────────────────────────────────────────

function IndividualTable({ rows, hasPassingThreshold, passingType, passingValue }: {
  rows: SubmittedRow[]
  hasPassingThreshold: boolean
  passingType: 'score' | 'percent' | null
  passingValue: number | null
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">คะแนน</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">%</th>
            {hasPassingThreshold && (
              <th className="text-center px-4 py-3 font-medium text-gray-600">ผลเกณฑ์</th>
            )}
            <th className="text-left px-4 py-3 font-medium text-gray-600">เวลาส่ง</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={hasPassingThreshold ? 6 : 5} className="text-center py-10 text-gray-400">
                ยังไม่มีการส่งงาน
              </td>
            </tr>
          ) : (
            rows.map((s, i) => {
              const pct = s.max_score > 0 ? Math.round(((s.total_score ?? 0) / s.max_score) * 100) : 0
              const passed = computePassed(s.total_score, s.max_score, passingType, passingValue)
              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/submissions/${s.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                      {s.users?.full_name}
                    </Link>
                    <p className="text-xs text-gray-400">{s.users?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">
                    {s.total_score}/{s.max_score}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      pct >= 75 ? 'bg-green-100 text-green-700'
                      : pct >= 50 ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-600'
                    }`}>
                      {pct}%
                    </span>
                  </td>
                  {hasPassingThreshold && (
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {passed ? 'ผ่าน' : 'ไม่ผ่าน'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.submitted_at
                      ? new Date(s.submitted_at).toLocaleTimeString('th-TH', { timeStyle: 'short' })
                      : '—'}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Question mode ─────────────────────────────────────────────────────────

function QuestionGrid({ questions, activeQuestionIndex, activeQuestion, onChangeIndex, rows, answerMap }: {
  questions: Question[]
  activeQuestionIndex: number
  activeQuestion: Question | undefined
  onChangeIndex: (i: number) => void
  rows: SubmittedRow[]
  answerMap: Map<string, AnswerRow>
}) {
  if (questions.length === 0 || !activeQuestion) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
        ไม่พบโจทย์ในชุดข้อสอบนี้
      </div>
    )
  }

  const questionMaxScore = rows
    .map(r => answerMap.get(`${r.id}::${activeQuestion.id}`)?.max_score)
    .find((v): v is number => v != null) ?? 1

  return (
    <div className="space-y-3">
      {/* Question stepper */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => onChangeIndex(Math.max(0, activeQuestionIndex - 1))}
            disabled={activeQuestionIndex === 0}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-semibold text-gray-700">
            ข้อที่ {activeQuestionIndex + 1} / {questions.length} · เต็ม {questionMaxScore} คะแนน
          </p>
          <button
            onClick={() => onChangeIndex(Math.min(questions.length - 1, activeQuestionIndex + 1))}
            disabled={activeQuestionIndex === questions.length - 1}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {activeQuestion.title && <p className="text-sm font-medium text-gray-900">{activeQuestion.title}</p>}
        <QuestionText text={activeQuestion.question_text} />
      </div>

      {/* Per-student answer grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">คำตอบนักเรียน</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">ผล</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">คะแนน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">ยังไม่มีการส่งงาน</td>
              </tr>
            ) : (
              rows.map((s, i) => {
                const answer = answerMap.get(`${s.id}::${activeQuestion.id}`)
                const isPending = answer != null && answer.is_correct === null
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/submissions/${s.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                        {s.users?.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                      {formatAnswerShort(activeQuestion, answer)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!answer ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : isPending ? (
                        <Clock className="w-4 h-4 text-amber-500 inline" />
                      ) : answer.is_correct ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 inline" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {answer ? (
                        <ScoreEditor submissionAnswerId={answer.id} score={answer.score} maxScore={answer.max_score} />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QuestionText({ text }: { text: string }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(text)
  if (isHtml) {
    return <div className="rich-text-content text-sm text-gray-500" dangerouslySetInnerHTML={{ __html: text }} />
  }
  return <p className="whitespace-pre-line text-sm text-gray-500">{text}</p>
}

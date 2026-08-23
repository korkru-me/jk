'use client'

import { QRCodeSVG } from 'qrcode.react'
import { randomizeVariables, evaluateFormula } from '@/lib/math/evaluator'
import { sectionByQuestionId, type QuestionSetSection } from '@/lib/question-set-sections'
import type { Question, Variable, MCQOption, MatchingPair } from '@/lib/types'

interface StudentSheet {
  studentName: string
  studentId: string
}

interface Props {
  assignmentId: string
  assignmentTitle: string
  classroomName: string
  questions: Question[]
  students: StudentSheet[]
  /** แฟ้มย่อย printed as headings between questions. Empty = plain list. */
  sections?: QuestionSetSection[]
}

function substituteVars(text: string, values: Record<string, number>) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) return `{${name}}`
    return `${values[name]}`
  })
}

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

// Letters for the matching answer bank, so a student writes "ข" in the blank
// beside prompt 1 rather than copying the whole label out.
const RIGHT_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ']

function shuffleIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** "1-ข, 2-ก, ..." — prompt number to the letter of its answer in the bank. */
function matchingKey(pairs: MatchingPair[] | null, rightOrder: number[] | undefined): string {
  if (!pairs || pairs.length === 0) return '—'
  const order = rightOrder ?? pairs.map((_, i) => i)
  return pairs
    .map((_, promptIndex) => `${promptIndex + 1}-${RIGHT_LABELS[order.indexOf(promptIndex)] ?? '?'}`)
    .join(', ')
}

interface WorksheetPageProps {
  student: StudentSheet
  questions: Question[]
  assignmentId: string
  assignmentTitle: string
  classroomName: string
  seed: number
  sections: QuestionSetSection[]
}

function WorksheetPage({ student, questions, assignmentId, assignmentTitle, classroomName, seed, sections }: WorksheetPageProps) {
  // Headings come from the questions' own order on the sheet, so question
  // numbering stays a single run 1..n across แฟ้มย่อย — the number a student
  // writes on the answer sheet must not restart per แฟ้มย่อย.
  const sectionOwner = sectionByQuestionId(sections)
  // Generate deterministic-ish random values per student using seed concept
  const questionValues = questions.map(q => {
    const values = randomizeVariables(q.variables as Variable[])
    const answer = evaluateFormula(q.answer_formula, values)
    return { values, answer }
  })

  // One shuffle of the matching answer bank per question, reused by both the
  // worksheet and the answer key below so the letters agree.
  const shuffledIndices = questions.map(q =>
    q.question_type === 'matching' && q.mcq_options
      ? shuffleIndices((q.mcq_options as unknown as MatchingPair[]).length)
      : undefined
  )

  const qrUrl = `https://korkru.com/answer/${assignmentId}?student=${student.studentId}`

  return (
    <div className="worksheet-page print:break-after-page">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-3 border-b-2 border-gray-800">
        <div>
          <h1 className="text-xl font-bold">KorKru — กอครู</h1>
          <p className="text-sm text-gray-600">วิชา: ฟิสิกส์</p>
          <p className="text-sm font-semibold mt-1">{assignmentTitle}</p>
          <p className="text-xs text-gray-500">{classroomName}</p>
        </div>
        <div className="text-right space-y-2">
          <div className="text-sm">
            <span className="text-gray-500">ชื่อ-นามสกุล: </span>
            <span className="font-medium">{student.studentName}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">วันที่: </span>
            <span className="text-gray-400">_____________</span>
          </div>
          <QRCodeSVG value={qrUrl} size={80} />
          <p className="text-[10px] text-gray-400">สแกนเพื่อส่งคำตอบ</p>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {questions.map((q, i) => {
          const { values, answer } = questionValues[i]
          const renderedText = substituteVars(q.question_text, values)

          const section = sectionOwner.get(q.id)
          const isSectionStart = !!section?.title && sectionOwner.get(questions[i - 1]?.id)?.id !== section.id

          return (
            <div key={q.id} className="question print:break-inside-avoid">
              {isSectionStart && (
                <p className="font-bold text-sm border-b border-gray-400 pb-1 mb-3">{section!.title}</p>
              )}
              <p className="font-semibold mb-2">ข้อ {i + 1}. {renderedText}</p>

              {/* MCQ options */}
              {q.question_type === 'mcq' && q.mcq_options && (
                <div className="grid grid-cols-2 gap-1 ml-4 mt-2">
                  {(q.mcq_options as MCQOption[]).map((opt, j) => (
                    <p key={j} className="text-sm">
                      {['ก', 'ข', 'ค', 'ง'][j]}. {opt.text}
                    </p>
                  ))}
                </div>
              )}

              {/* Matching: prompts numbered on the left, the choices listed
                  once underneath with letters to write in the blanks. */}
              {q.question_type === 'matching' && q.mcq_options && (() => {
                const pairs = q.mcq_options as unknown as MatchingPair[]
                const rightOrder = shuffledIndices[i] ?? pairs.map((_, j) => j)
                return (
                  <div className="ml-4 mt-2 space-y-2">
                    {pairs.map((pair, j) => (
                      <p key={j} className="text-sm">
                        <span className="inline-block w-10 border-b border-gray-400 mr-2" />
                        {j + 1}. {pair.left_text}
                      </p>
                    ))}
                    <div className="grid grid-cols-2 gap-1 pt-1">
                      {rightOrder.filter(idx => pairs[idx]).map((idx, k) => (
                        <p key={k} className="text-sm">
                          {RIGHT_LABELS[k] ?? k + 1}. {pairs[idx].right_text}
                        </p>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Answer blank */}
              {q.question_type === 'written' && (
                <div className="ml-4 mt-2">
                  <span className="text-sm text-gray-500">คำตอบ: </span>
                  <span className="inline-block w-32 border-b border-gray-400 ml-1 text-sm">
                    {q.answer_unit ? `(${q.answer_unit})` : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Answer key (teacher copy only) */}
      <div className="mt-8 pt-4 border-t border-dashed border-gray-300 no-print hidden teacher-answer-key">
        <p className="text-xs font-bold text-gray-500 mb-2">เฉลย (ฉบับครู)</p>
        <div className="grid grid-cols-3 gap-2">
          {questions.map((q, i) => {
            const { values, answer } = questionValues[i]
            return (
              <div key={q.id} className="text-xs">
                <span className="font-medium">ข้อ {i + 1}: </span>
                {q.question_type === 'written'
                  ? <span className="font-mono">{typeof answer === 'number' ? formatAnswer(answer) : answer} {q.answer_unit}</span>
                  : q.question_type === 'matching'
                  ? <span>{matchingKey(q.mcq_options as unknown as MatchingPair[], shuffledIndices[i])}</span>
                  : <span>{(q.mcq_options as MCQOption[])?.find(o => o.is_correct)?.text ?? '—'}</span>
                }
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function PrintWorksheet({ assignmentId, assignmentTitle, classroomName, questions, students, sections = [] }: Props) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          nav, header, footer, .no-print { display: none !important; }
          .question { page-break-inside: avoid; }
          .worksheet-page { page-break-after: always; }
          body { font-size: 12pt; color: black; }
          .teacher-answer-key { display: block !important; }
        }
      `}</style>

      {students.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">ยังไม่มีนักเรียนในห้องเรียน</p>
          <p className="text-sm mt-1">เพิ่มนักเรียนก่อนพิมพ์ใบงาน</p>
        </div>
      ) : (
        students.map((student, i) => (
          <WorksheetPage
            key={student.studentId}
            student={student}
            questions={questions}
            assignmentId={assignmentId}
            assignmentTitle={assignmentTitle}
            classroomName={classroomName}
            seed={i}
            sections={sections}
          />
        ))
      )}
    </>
  )
}

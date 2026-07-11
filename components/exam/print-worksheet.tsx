'use client'

import { QRCodeSVG } from 'qrcode.react'
import { randomizeVariables, evaluateFormula } from '@/lib/math/evaluator'
import type { Question, Variable, MCQOption } from '@/lib/types'

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

interface WorksheetPageProps {
  student: StudentSheet
  questions: Question[]
  assignmentId: string
  assignmentTitle: string
  classroomName: string
  seed: number
}

function WorksheetPage({ student, questions, assignmentId, assignmentTitle, classroomName, seed }: WorksheetPageProps) {
  // Generate deterministic-ish random values per student using seed concept
  const questionValues = questions.map(q => {
    const values = randomizeVariables(q.variables as Variable[])
    const answer = evaluateFormula(q.answer_formula, values)
    return { values, answer }
  })

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

          return (
            <div key={q.id} className="question print:break-inside-avoid">
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

export function PrintWorksheet({ assignmentId, assignmentTitle, classroomName, questions, students }: Props) {
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
          />
        ))
      )}
    </>
  )
}

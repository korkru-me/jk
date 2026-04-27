'use client'

import { useState } from 'react'
import { randomizeVariables, evaluateFormula } from '@/lib/math/evaluator'
import type { Variable, MCQOption } from '@/lib/types'

interface QuestionPreviewProps {
  questionText: string
  variables: Variable[]
  answerFormula: string
  answerUnit: string
  isRandom: boolean
  questionType: 'written' | 'mcq'
  mcqOptions?: MCQOption[]
}

function substituteVars(text: string, values: Record<string, number>, variables: Variable[]) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) return `{${name}}`
    const def = variables.find((v) => v.name === name)
    return `${values[name]}${def?.unit ? ' ' + def.unit : ''}`
  })
}

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) {
    return n.toExponential(3)
  }
  const s = n.toPrecision(4)
  return parseFloat(s).toString()
}

export function QuestionPreview({
  questionText,
  variables,
  answerFormula,
  answerUnit,
  isRandom,
  questionType,
  mcqOptions = [],
}: QuestionPreviewProps) {
  const [values, setValues] = useState<Record<string, number> | null>(null)

  function generate() {
    setValues(randomizeVariables(variables))
  }

  const answer =
    values && answerFormula && questionType === 'written'
      ? evaluateFormula(answerFormula, values)
      : null

  const renderedText =
    questionText && values ? substituteVars(questionText, values, variables) : questionText

  const hasContent = questionText.trim().length > 0 || (questionType === 'mcq' && mcqOptions.length > 0)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-base font-semibold text-gray-900">ตัวอย่างที่นักเรียนเห็น</h2>
        <button
          type="button"
          onClick={generate}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          {values ? '🔄 สุ่มชุดใหม่' : '👁 ดูตัวอย่าง'}
        </button>
      </div>

      {values ? (
        <div className="border border-indigo-200 rounded-xl overflow-hidden shadow-sm">
          {/* Student view header */}
          <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex items-center gap-2">
            <span className="text-xs text-indigo-500 font-medium">มุมมองนักเรียน</span>
            {isRandom && (
              <span className="text-xs text-indigo-400">· ค่าถูกสุ่มแล้ว</span>
            )}
          </div>

          {/* Question body */}
          <div className="p-5 space-y-4 bg-white">
            {/* Question text */}
            <p className="text-gray-900 leading-relaxed whitespace-pre-line text-[15px]">
              {renderedText || <span className="text-gray-400 italic">ยังไม่มีเนื้อหาโจทย์</span>}
            </p>

            {/* Variable badges */}
            {isRandom && Object.keys(values).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(values).map(([k, v]) => {
                  const def = variables.find((vr) => vr.name === k)
                  return (
                    <span key={k} className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg text-sm font-mono">
                      {k} = {v}{def?.unit ? ` ${def.unit}` : ''}
                    </span>
                  )
                })}
              </div>
            )}

            {/* MCQ options */}
            {questionType === 'mcq' && mcqOptions.length > 0 && (
              <div className="space-y-2 pt-1">
                {mcqOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200">
                    <span className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0" />
                    <span className="text-sm text-gray-800">
                      {['ก', 'ข', 'ค', 'ง'][i]}. {opt.text || <span className="text-gray-400 italic">ยังไม่มีข้อความ</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Written answer box */}
            {questionType === 'written' && (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-400 mb-1">คำตอบ{answerUnit ? ` (${answerUnit})` : ''}:</p>
                <div className="h-8 bg-white border border-gray-300 rounded" />
              </div>
            )}
          </div>

          {/* Answer key (teacher only) */}
          {(answerFormula && questionType === 'written') || (questionType === 'mcq' && mcqOptions.some((o) => o.is_correct)) ? (
            <div className="border-t border-indigo-100 px-5 py-3 bg-indigo-50/50">
              <p className="text-xs text-indigo-400 font-medium mb-1">เฉลย (ครูเห็นเท่านั้น)</p>
              {questionType === 'written' && answer !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-lg font-bold text-indigo-700">
                    {typeof answer === 'number' ? formatAnswer(answer) : answer}
                  </span>
                  {answerUnit && <span className="text-indigo-500">{answerUnit}</span>}
                  <span className="font-mono text-xs text-indigo-300">= {answerFormula}</span>
                </div>
              ) : questionType === 'mcq' ? (
                <p className="text-sm text-indigo-700">
                  ข้อถูก: {mcqOptions.findIndex((o) => o.is_correct) >= 0
                    ? `${['ก', 'ข', 'ค', 'ง'][mcqOptions.findIndex((o) => o.is_correct)]}. ${mcqOptions.find((o) => o.is_correct)?.text}`
                    : '—'}
                </p>
              ) : (
                <p className="text-sm text-indigo-400">กรอกสูตรคำตอบก่อน</p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="py-8 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-3xl mb-2">👁</p>
          <p className="text-sm text-gray-400">กดปุ่ม "ดูตัวอย่าง" เพื่อดูว่านักเรียนจะเห็นโจทย์แบบไหน</p>
          {!hasContent && (
            <p className="text-xs text-gray-300 mt-1">กรอกเนื้อหาโจทย์ก่อนดูตัวอย่าง</p>
          )}
        </div>
      )}
    </section>
  )
}

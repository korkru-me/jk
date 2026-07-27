'use client'

import { useState } from 'react'
import { randomizeVariables, evaluateFormula } from '@/lib/math/evaluator'
import { RichText } from '@/components/ui/rich-text'
import { partLabels, type PartLabelStyle } from '@/lib/part-labels'
import { getBlankType } from '@/lib/fill-blank'
import type { Variable, MCQOption, AnswerPart, QuestionType, MatchingPair, TrueFalseConfig, FillBlankConfig, OrderingConfig, OrderingItem } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ']
const RIGHT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url)
}

interface QuestionPreviewProps {
  questionText: string
  variables: Variable[]
  answerParts: AnswerPart[]
  isRandom: boolean
  questionType: QuestionType
  mcqOptions?: MCQOption[]
  matchingPairs?: MatchingPair[]
  imageUrls?: string[]
  trueFalseConfig?: TrueFalseConfig
  fillBlankConfig?: FillBlankConfig
  orderingConfig?: OrderingConfig
  partLabelStyle?: PartLabelStyle
  attachmentUrls?: string[]
}

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function substituteVars(text: string, values: Record<string, number>) {
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in values ? `${values[name]}` : `{${name}}`))
}

function renderUnit(unit: string) {
  const isHtmlUnit = /<[a-z][\s\S]*>/i.test(unit)
  if (isHtmlUnit) return <span className="[&_p]:inline" dangerouslySetInnerHTML={{ __html: unit }} />
  return <span>{unit}</span>
}

function isHtml(text: string) {
  return /<[a-z][\s\S]*>/i.test(text)
}

const ANSWER_BLANK = '[คำตอบ]'

// Splitting the raw (possibly HTML) sub_text string on the placeholder by plain string
// slicing can cut a tag in half — e.g. "<p>...[คำตอบ]</p>" leaves a dangling "</p>"
// fragment — and stripping tags instead loses formatting like superscript/subscript.
// Use a DOM Range to split at the placeholder so each half keeps only its own
// (correctly closed) formatting tags.
function splitAtAnswerBlank(html: string): [string, string] | null {
  if (typeof document === 'undefined') return null
  const container = document.createElement('div')
  container.innerHTML = html

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let target: Text | null = null
  let idx = -1
  let node: Node | null
  while ((node = walker.nextNode())) {
    const i = (node as Text).data.indexOf(ANSWER_BLANK)
    if (i !== -1) { target = node as Text; idx = i; break }
  }
  if (!target) return null

  const beforeRange = document.createRange()
  beforeRange.setStart(container, 0)
  beforeRange.setEnd(target, idx)
  const beforeDiv = document.createElement('div')
  beforeDiv.appendChild(beforeRange.cloneContents())

  const afterRange = document.createRange()
  afterRange.setStart(target, idx + ANSWER_BLANK.length)
  afterRange.setEnd(container, container.childNodes.length)
  const afterDiv = document.createElement('div')
  afterDiv.appendChild(afterRange.cloneContents())

  return [beforeDiv.innerHTML, afterDiv.innerHTML]
}

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

function isClose(a: number, b: number): boolean {
  if (b === 0) return Math.abs(a) < 1e-6
  return Math.abs((a - b) / b) <= 0.01
}

function RenderText({ text }: { text: string }) {
  if (!text) return <p className="text-gray-400 italic text-[15px]">ยังไม่มีเนื้อหาโจทย์</p>
  if (isHtml(text)) return (
    <div className="text-gray-900 leading-relaxed text-[15px] rich-text-content"
      dangerouslySetInnerHTML={{ __html: text }} />
  )
  return <p className="text-gray-900 leading-relaxed whitespace-pre-line text-[15px]">{text}</p>
}

export function QuestionPreview({
  questionText,
  variables,
  answerParts,
  isRandom,
  questionType,
  mcqOptions = [],
  matchingPairs = [],
  imageUrls = [],
  trueFalseConfig,
  fillBlankConfig,
  orderingConfig,
  partLabelStyle,
  attachmentUrls = [],
}: QuestionPreviewProps) {
  const labels = partLabels(partLabelStyle)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, number>>({})
  const [shuffledRight, setShuffledRight] = useState<number[]>([])

  // written
  const [writtenInputs, setWrittenInputs] = useState<string[]>([])
  const [writtenResults, setWrittenResults] = useState<(boolean | null)[]>([])
  const [writtenChecked, setWrittenChecked] = useState(false)

  // mcq
  const [selectedMcq, setSelectedMcq] = useState<number | null>(null)
  const [mcqChecked, setMcqChecked] = useState(false)

  // matching
  const [matchingSelections, setMatchingSelections] = useState<string[]>([])
  const [matchingChecked, setMatchingChecked] = useState(false)

  // true_false
  const [tfAnswers, setTfAnswers] = useState<('true' | 'false' | null)[]>([null])
  const [tfExplanation, setTfExplanation] = useState('')
  const [tfChecked, setTfChecked] = useState(false)

  // fill_blank
  const [fillAnswers, setFillAnswers] = useState<string[]>([])
  const [fillChecked, setFillChecked] = useState(false)
  const [fillResults, setFillResults] = useState<boolean[]>([])

  // ordering
  const [shuffledItems, setShuffledItems] = useState<OrderingItem[]>([])
  const [orderSelections, setOrderSelections] = useState<Record<string, string>>({})
  const [orderChecked, setOrderChecked] = useState(false)

  function generate() {
    const newValues = randomizeVariables(variables)
    setValues(newValues)
    setShuffledRight(matchingPairs.length > 0 ? shuffleIndices(matchingPairs.length) : [])
    setWrittenInputs(answerParts.map(() => ''))
    setWrittenResults(answerParts.map(() => null))
    setWrittenChecked(false)
    setSelectedMcq(null)
    setMcqChecked(false)
    setMatchingSelections(matchingPairs.map(() => ''))
    setMatchingChecked(false)
    setTfAnswers(Array(1 + (trueFalseConfig?.statements?.length ?? 0)).fill(null))
    setTfExplanation('')
    setTfChecked(false)
    const blanks = fillBlankConfig?.blanks ?? []
    setFillAnswers(blanks.map(() => ''))
    setFillChecked(false)
    setFillResults([])
    if (orderingConfig?.items?.length) {
      const shuffled = [...orderingConfig.items].sort(() => Math.random() - 0.5)
      setShuffledItems(shuffled)
      setOrderSelections({})
      setOrderChecked(false)
    }
  }

  function handleOpen() {
    if (orderingConfig?.items?.length) {
      setShuffledItems([...orderingConfig.items].sort(() => Math.random() - 0.5))
    }
    generate()
    setOpen(true)
  }

  function checkWritten() {
    const results = answerParts.map((part, i) => {
      const correctAnswer = part.formula ? evaluateFormula(part.formula, values) : null
      if (correctAnswer === null || typeof correctAnswer !== 'number') return null
      const studentInput = parseFloat(writtenInputs[i])
      if (isNaN(studentInput)) return null
      return isClose(studentInput, correctAnswer)
    })
    setWrittenResults(results)
    setWrittenChecked(true)
  }

  const renderedText = questionText
    ? (Object.keys(values).length > 0 ? substituteVars(questionText, values) : questionText)
    : ''

  const correctOptions = mcqOptions.map((o, i) => ({ ...o, idx: i })).filter(o => o.is_correct)
  const allWrittenFilled = writtenInputs.length > 0 && writtenInputs.every(v => v !== '')
  const allMatchingFilled = matchingSelections.length > 0 && matchingSelections.every(v => v !== '')

  const matchingScore = matchingSelections.filter((s, i) => {
    const correctLabel = shuffledRight.length > 0 ? RIGHT_LABELS[shuffledRight.indexOf(i)] : RIGHT_LABELS[i]
    return s === correctLabel
  }).length

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
      >
        👁 ดูตัวอย่าง
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span className="flex items-center gap-2">
                <span>👁</span>
                <span>มุมมองนักเรียน</span>
                {isRandom && <span className="text-xs font-normal text-indigo-400">· ค่าถูกสุ่มแล้ว</span>}
              </span>
              <button
                type="button"
                onClick={generate}
                className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium"
              >
                🔄 โจทย์ใหม่
              </button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Variable badges (random only) */}
            {isRandom && Object.keys(values).length > 0 && (
              <div className="flex flex-wrap gap-1.5 bg-indigo-50 px-3 py-2 rounded-lg">
                {Object.entries(values).map(([k, v]) => (
                  <span key={k} className="bg-white text-indigo-700 px-2.5 py-1 rounded-lg text-sm font-mono border border-indigo-100">
                    {k} = {v}
                  </span>
                ))}
              </div>
            )}

            {/* Question text */}
            <RenderText text={renderedText} />

            {/* Question images */}
            {imageUrls.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="รูปประกอบโจทย์"
                    className="max-h-48 rounded-lg border border-gray-200 object-contain" />
                ))}
              </div>
            )}

            {/* File-upload reference attachments */}
            {questionType === 'file_upload' && attachmentUrls.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {attachmentUrls.map((url) => (
                  isPdfUrl(url) ? (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                      className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <span className="text-lg">📄</span>
                      <span className="text-[9px] text-gray-500">PDF</span>
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="ไฟล์อ้างอิงโจทย์"
                      className="max-h-32 rounded-lg border border-gray-200 object-contain" />
                  )
                ))}
              </div>
            )}

            {/* ── MCQ ── */}
            {questionType === 'mcq' && mcqOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">เลือกคำตอบที่ถูกต้อง:</p>
                {mcqOptions.map((opt, i) => {
                  const isSelected = selectedMcq === i
                  const isCorrect = opt.is_correct
                  let cls = 'border-gray-200 bg-white'
                  if (mcqChecked) {
                    if (isCorrect) cls = 'border-green-400 bg-green-50'
                    else if (isSelected) cls = 'border-red-400 bg-red-50'
                  } else if (isSelected) {
                    cls = 'border-indigo-400 bg-indigo-50'
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { if (!mcqChecked) setSelectedMcq(i) }}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 ${cls} text-left transition-colors ${!mcqChecked ? 'hover:border-indigo-300 cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center
                        ${isSelected && !mcqChecked ? 'border-indigo-500 bg-indigo-500' :
                          mcqChecked && isCorrect ? 'border-green-500 bg-green-500' :
                          mcqChecked && isSelected ? 'border-red-500 bg-red-500' :
                          'border-gray-300'}`}
                      >
                        {(isSelected || (mcqChecked && isCorrect)) && (
                          <span className="text-white text-[10px]">●</span>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-sm text-gray-800">
                          {PART_LABELS[i]}. {opt.text || <span className="text-gray-400 italic">ยังไม่มีข้อความ</span>}
                        </span>
                        {opt.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={opt.image_url} alt={`ตัวเลือก ${PART_LABELS[i]}`}
                            className="max-h-32 rounded border border-gray-200 object-contain" />
                        )}
                        {mcqChecked && isCorrect && (
                          <span className="text-xs text-green-600 font-medium block">✓ ถูกต้อง</span>
                        )}
                        {mcqChecked && isSelected && !isCorrect && (
                          <span className="text-xs text-red-500 font-medium block">✗ คำตอบของคุณ</span>
                        )}
                      </div>
                    </button>
                  )
                })}
                {!mcqChecked ? (
                  <button
                    type="button"
                    onClick={() => setMcqChecked(true)}
                    disabled={selectedMcq === null}
                    className="mt-1 px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    ตรวจคำตอบ
                  </button>
                ) : (
                  <div className={`p-3 rounded-lg text-sm font-medium border ${
                    selectedMcq !== null && mcqOptions[selectedMcq]?.is_correct
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {selectedMcq !== null && mcqOptions[selectedMcq]?.is_correct
                      ? '🎉 ถูกต้อง!'
                      : `❌ ผิด — เฉลยคือ: ${correctOptions.map(o => `${PART_LABELS[o.idx]}. ${o.text || '(ไม่มีข้อความ)'}`).join(', ')}`
                    }
                  </div>
                )}
              </div>
            )}

            {/* ── Matching ── */}
            {questionType === 'matching' && matchingPairs.length > 0 && (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-50">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left py-2 px-3 font-medium border-b border-gray-200 w-1/2">รายการ</th>
                        <th className="text-left py-2 px-3 font-medium border-b border-gray-200 w-1/2">คำตรงกัน (สุ่มลำดับแล้ว)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {matchingPairs.map((pair, i) => {
                        const rightIdx = shuffledRight[i] ?? i
                        const rightPair = matchingPairs[rightIdx]
                        return (
                          <tr key={i}>
                            <td className="py-2 px-3 align-top">
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 shrink-0 mt-0.5 font-medium">{i + 1}.</span>
                                <div>
                                  <span className="text-gray-800">{pair.left_text || `รายการ ${i + 1}`}</span>
                                  {pair.left_image && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={pair.left_image} alt="" className="mt-1 max-h-16 rounded border border-gray-200 object-contain" />
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3 align-top">
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-indigo-500 shrink-0 mt-0.5 font-medium">{RIGHT_LABELS[i]}.</span>
                                <div>
                                  <span className="text-gray-800">{rightPair?.right_text || `คำตรงกัน ${i + 1}`}</span>
                                  {rightPair?.right_image && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={rightPair.right_image} alt="" className="mt-1 max-h-16 rounded border border-gray-200 object-contain" />
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium">เลือกตัวอักษรที่ตรงกัน:</p>
                  {matchingPairs.map((pair, i) => {
                    const correctLabel = shuffledRight.length > 0
                      ? RIGHT_LABELS[shuffledRight.indexOf(i)]
                      : RIGHT_LABELS[i]
                    const studentSelected = matchingSelections[i] || ''
                    const isCorrect = matchingChecked && studentSelected === correctLabel
                    const isWrong = matchingChecked && studentSelected !== correctLabel
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 shrink-0 w-28 truncate">
                          {i + 1}. {pair.left_text || `รายการ ${i + 1}`}
                        </span>
                        <select
                          value={studentSelected}
                          onChange={(e) => {
                            if (matchingChecked) return
                            const next = [...matchingSelections]
                            next[i] = e.target.value
                            setMatchingSelections(next)
                          }}
                          disabled={matchingChecked}
                          className={`h-8 w-20 border rounded-lg px-2 text-sm text-center ${
                            isCorrect ? 'border-green-400 bg-green-50 text-green-700' :
                            isWrong ? 'border-red-400 bg-red-50 text-red-700' :
                            'border-gray-300 bg-white'
                          }`}
                        >
                          <option value="">—</option>
                          {RIGHT_LABELS.slice(0, matchingPairs.length).map(label => (
                            <option key={label} value={label}>{label}</option>
                          ))}
                        </select>
                        {isCorrect && <span className="text-xs text-green-600 font-medium">✓</span>}
                        {isWrong && <span className="text-xs text-red-500">✗ เฉลย: <strong>{correctLabel}</strong></span>}
                      </div>
                    )
                  })}
                </div>

                {!matchingChecked ? (
                  <button
                    type="button"
                    onClick={() => setMatchingChecked(true)}
                    disabled={!allMatchingFilled}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    ตรวจคำตอบ
                  </button>
                ) : (
                  <div className={`p-3 rounded-lg text-sm font-medium border ${
                    matchingScore === matchingPairs.length
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : matchingScore > 0
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {matchingScore === matchingPairs.length
                      ? '🎉 ถูกต้องทุกข้อ!'
                      : `✅ ถูก ${matchingScore}/${matchingPairs.length} ข้อ`}
                  </div>
                )}
              </div>
            )}

            {/* ── Written (fixed / random) ── */}
            {questionType === 'written' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">กรอกคำตอบ:</p>
                {answerParts.map((part, i) => {
                  const correctAnswer = part.formula ? evaluateFormula(part.formula, values) : null
                  const result = writtenResults[i]
                  const blankSplit = part.sub_text ? splitAtAnswerBlank(part.sub_text) : null

                  const inputEl = (
                    <input
                      type="number"
                      value={writtenInputs[i] ?? ''}
                      onChange={(e) => {
                        if (writtenChecked) return
                        const next = [...writtenInputs]
                        next[i] = e.target.value
                        setWrittenInputs(next)
                      }}
                      readOnly={writtenChecked}
                      placeholder="กรอกตัวเลข"
                      className={`h-9 w-36 border rounded-lg px-3 text-sm bg-white font-mono ${
                        result === true ? 'border-green-400' :
                        result === false ? 'border-red-400' :
                        'border-gray-300'
                      }`}
                    />
                  )

                  const feedback = (
                    <>
                      {result === true && (
                        <span className="text-green-600 text-sm font-medium">✓ ถูก!</span>
                      )}
                      {result === false && correctAnswer !== null && typeof correctAnswer === 'number' && (
                        <span className="text-red-500 text-sm">
                          ✗ เฉลย: <span className="font-mono font-bold">{formatAnswer(correctAnswer)}</span>
                        </span>
                      )}
                      {result === false && (correctAnswer === null || typeof correctAnswer !== 'number') && (
                        <span className="text-red-500 text-sm">✗ ผิด</span>
                      )}
                    </>
                  )

                  return (
                    <div key={part.id} className="space-y-1.5">
                      {blankSplit ? (
                        <div className={`flex flex-wrap items-center gap-2 p-3 rounded-lg border text-sm text-gray-800 ${
                          result === true ? 'bg-green-50 border-green-300' :
                          result === false ? 'bg-red-50 border-red-300' :
                          'bg-gray-50 border-gray-200'
                        }`}>
                          {answerParts.length > 1 && <span className="font-medium shrink-0">{labels[i] ?? i + 1})</span>}
                          {blankSplit[0] && <RichText text={blankSplit[0]} className="[&_p]:inline" />}
                          {inputEl}
                          {part.unit && <span className="text-gray-600">{renderUnit(part.unit)}</span>}
                          {blankSplit[1] && <RichText text={blankSplit[1]} className="[&_p]:inline" />}
                          {feedback}
                        </div>
                      ) : (
                        <>
                          {part.sub_text && (
                            <p className="text-sm font-medium text-gray-700">
                              {answerParts.length > 1 && <>{labels[i] ?? i + 1}) </>}
                              <RichText text={part.sub_text} className="font-normal text-gray-600" />
                            </p>
                          )}
                          <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                            result === true ? 'bg-green-50 border-green-300' :
                            result === false ? 'bg-red-50 border-red-300' :
                            'bg-gray-50 border-gray-200'
                          }`}>
                            {inputEl}
                            {part.unit && <span className="text-sm text-gray-600">{renderUnit(part.unit)}</span>}
                            {feedback}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
                {!writtenChecked ? (
                  <button
                    type="button"
                    onClick={checkWritten}
                    disabled={!allWrittenFilled}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    ตรวจคำตอบ
                  </button>
                ) : (
                  <div className={`p-3 rounded-lg text-sm font-medium border ${
                    writtenResults.every(r => r === true)
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : writtenResults.some(r => r === true)
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {writtenResults.every(r => r === true)
                      ? '🎉 ถูกต้องทุกข้อ!'
                      : writtenResults.some(r => r === true)
                        ? `✅ ถูก ${writtenResults.filter(r => r === true).length}/${answerParts.length} ข้อ`
                        : '❌ ผิดทุกข้อ — ดูเฉลยด้านบน'
                    }
                  </div>
                )}
              </div>
            )}

            {/* ── Essay ── */}
            {questionType === 'essay' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">กรอกคำตอบ (บรรยาย):</p>
                <textarea
                  rows={5}
                  placeholder="พิมพ์คำตอบที่นี่..."
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <p className="text-xs text-indigo-500 bg-indigo-50 px-3 py-2 rounded-lg">
                  * ครูจะเป็นผู้ตรวจและให้คะแนน — ระบบไม่ตรวจอัตโนมัติ
                </p>
              </div>
            )}

            {/* ── File upload ── */}
            {questionType === 'file_upload' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">แนบไฟล์คำตอบ (จำลอง):</p>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400">
                  📎 นักเรียนจะแนบไฟล์รูปภาพหรือ PDF ที่นี่
                </div>
                <p className="text-xs text-indigo-500 bg-indigo-50 px-3 py-2 rounded-lg">
                  * ระบบให้คะแนนเต็มอัตโนมัติเมื่อมีการแนบไฟล์อย่างน้อย 1 ไฟล์ — ไม่มีการตรวจเนื้อหาไฟล์
                </p>
              </div>
            )}

            {/* ── True/False ── */}
            {questionType === 'true_false' && trueFalseConfig && (() => {
              const subStatements = trueFalseConfig.statements ?? []
              const labels = partLabels(trueFalseConfig.part_label_style)
              const hasSubs = subStatements.length > 0
              const correctCount = subStatements.reduce((n, s, i) =>
                n + (tfAnswers[i + 1] === (s.correct_answer ? 'true' : 'false') ? 1 : 0),
                tfAnswers[0] === (trueFalseConfig.correct_answer ? 'true' : 'false') ? 1 : 0)
              const total = 1 + subStatements.length
              return (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 font-medium">ข้อความแต่ละข้อถูกหรือผิด?</p>
                  {[{ text: '', correct_answer: trueFalseConfig.correct_answer }, ...subStatements].map((st, i) => (
                    <div key={i} className="space-y-1.5">
                      {hasSubs && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-500">{labels[i] ?? i + 1})</span>
                          {i > 0 && <RenderText text={st.text} />}
                        </div>
                      )}
                      <div className="flex gap-3">
                        {([
                          { val: 'true' as const,  label: '✓ ถูก', cls: 'border-green-500 bg-green-50 text-green-700' },
                          { val: 'false' as const, label: '✗ ผิด', cls: 'border-red-500 bg-red-50 text-red-700' },
                        ]).map(({ val, label, cls }) => (
                          <button
                            key={val}
                            type="button"
                            disabled={tfChecked}
                            onClick={() => { if (!tfChecked) setTfAnswers(a => a.map((v, ai) => ai === i ? val : v)) }}
                            className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-colors ${
                              tfAnswers[i] === val && !tfChecked ? cls :
                              tfChecked && val === (st.correct_answer ? 'true' : 'false') ? 'border-green-500 bg-green-50 text-green-700' :
                              tfChecked && tfAnswers[i] === val ? 'border-red-400 bg-red-50 text-red-600' :
                              'border-gray-200 text-gray-500'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {trueFalseConfig.explanation_mode !== 'none' && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">
                        {trueFalseConfig.explanation_mode === 'wrong_only'
                          ? 'ให้เหตุผล (กรณีตอบผิด):'
                          : 'ให้เหตุผล:'}
                      </p>
                      <textarea
                        value={tfExplanation}
                        onChange={(e) => { if (!tfChecked) setTfExplanation(e.target.value) }}
                        readOnly={tfChecked}
                        rows={3}
                        placeholder="พิมพ์เหตุผลที่นี่..."
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg">
                        ครูจะตรวจเหตุผลและให้คะแนนด้วยมือ ({trueFalseConfig.score_explanation} คะแนน)
                      </p>
                    </div>
                  )}

                  {!tfChecked ? (
                    <button
                      type="button"
                      onClick={() => setTfChecked(true)}
                      disabled={tfAnswers.some(a => a === null)}
                      className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      ตรวจคำตอบ
                    </button>
                  ) : (
                    <div className={`p-3 rounded-lg text-sm font-medium border ${
                      correctCount === total
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {total > 1
                        ? `ถูก ${correctCount}/${total} ข้อ`
                        : correctCount === 1
                          ? `🎉 ถูกต้อง! ข้อความนี้${trueFalseConfig.correct_answer ? 'ถูก' : 'ผิด'}`
                          : `❌ ผิด — เฉลยคือ: ข้อความนี้${trueFalseConfig.correct_answer ? 'ถูก' : 'ผิด'}`
                      }
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── Fill Blank ── */}
            {questionType === 'fill_blank' && fillBlankConfig && (() => {
              const parts = questionText.split('[___]')
              const blanks = fillBlankConfig.blanks
              const types = blanks.map(b => getBlankType(fillBlankConfig, b))
              const autoIdx = types.reduce<number[]>((acc, t, i) => { if (t !== 'text') acc.push(i); return acc }, [])
              const hasManual = types.some(t => t === 'text')
              const hasAuto = autoIdx.length > 0
              return (
                <div className="space-y-4">
                  <div className="leading-loose text-gray-900 text-[15px]">
                    {parts.map((part, i) => {
                      const type = types[i]
                      return (
                        <span key={i}>
                          {part}
                          {type === 'dropdown' ? (
                            <select
                              value={fillAnswers[i] ?? ''}
                              onChange={(e) => {
                                if (fillChecked) return
                                const next = [...fillAnswers]
                                next[i] = e.target.value
                                setFillAnswers(next)
                              }}
                              disabled={fillChecked}
                              className={`inline-block mx-1 px-2 py-0.5 border-b-2 border-indigo-400 bg-indigo-50 rounded text-sm text-center focus:outline-none focus:border-indigo-600 ${
                                fillChecked ? (fillResults[i] ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50') : ''
                              }`}
                            >
                              <option value="">เลือกคำตอบ</option>
                              {(blanks[i]?.options ?? []).map((opt, oi) => (
                                <option key={oi} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : i < blanks.length ? (
                            <input
                              type="text"
                              value={fillAnswers[i] ?? ''}
                              onChange={(e) => {
                                if (fillChecked) return
                                const next = [...fillAnswers]
                                next[i] = e.target.value
                                setFillAnswers(next)
                              }}
                              readOnly={fillChecked}
                              className={`inline-block mx-1 px-2 py-0.5 w-28 border-b-2 border-indigo-400 bg-indigo-50 rounded text-sm text-center focus:outline-none focus:border-indigo-600 ${
                                fillChecked && type !== 'text'
                                  ? fillResults[i] ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'
                                  : ''
                              }`}
                            />
                          ) : null}
                        </span>
                      )
                    })}
                  </div>

                  {hasManual && (
                    <p className="text-xs text-orange-600 font-medium">
                      {hasAuto ? 'บางช่องครูผู้สอนจะเป็นผู้ตรวจและให้คะแนนเอง' : 'ครูผู้สอนจะเป็นผู้ตรวจและให้คะแนน'}
                    </p>
                  )}

                  {hasAuto && (
                    <>
                      {fillChecked && (
                        <div className="space-y-1">
                          {blanks.map((b, i) => types[i] === 'text' ? null : (
                            <p key={i} className={`text-xs px-2 py-1 rounded ${fillResults[i] ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                              {fillResults[i] ? `✓ ช่อง ${i + 1}: ถูกต้อง` : `✗ ช่อง ${i + 1}: เฉลยคือ "${b.answer}"`}
                            </p>
                          ))}
                        </div>
                      )}
                      {!fillChecked ? (
                        <button
                          type="button"
                          onClick={() => {
                            const results = blanks.map((b, i) => {
                              if (types[i] === 'text') return false
                              const sa = (fillAnswers[i] ?? '').trim()
                              const ca = b.answer.trim()
                              return types[i] === 'dropdown' ? sa === ca : (b.case_sensitive ? sa === ca : sa.toLowerCase() === ca.toLowerCase())
                            })
                            setFillResults(results)
                            setFillChecked(true)
                          }}
                          disabled={autoIdx.some(i => !fillAnswers[i]?.trim())}
                          className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                        >
                          ตรวจคำตอบ
                        </button>
                      ) : (
                        <div className={`p-3 rounded-lg text-sm font-medium border ${
                          autoIdx.every(i => fillResults[i])
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : autoIdx.some(i => fillResults[i])
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {autoIdx.every(i => fillResults[i])
                            ? '🎉 ถูกต้องทุกช่อง (ที่ตรวจอัตโนมัติ)!'
                            : `✅ ถูก ${autoIdx.filter(i => fillResults[i]).length}/${autoIdx.length} ช่อง (ที่ตรวจอัตโนมัติ)`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })()}

            {/* ── Ordering ── */}
            {questionType === 'ordering' && orderingConfig && shuffledItems.length > 0 && (() => {
              const n = shuffledItems.length
              const correctOrder = orderingConfig.items.map(i => i.id)
              const allSelected = shuffledItems.every(it => orderSelections[it.id])
              const selectedPositions = Object.values(orderSelections)
              const hasDuplicate = selectedPositions.length !== new Set(selectedPositions).size

              return (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 font-medium">เลือกลำดับสำหรับแต่ละรายการ:</p>
                  <div className="space-y-2">
                    {shuffledItems.map((item) => {
                      const sel = orderSelections[item.id] ?? ''
                      const correctPos = correctOrder.indexOf(item.id) + 1
                      const isCorrect = orderChecked && sel === String(correctPos)
                      const isWrong = orderChecked && sel !== String(correctPos)
                      return (
                        <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                          isCorrect ? 'border-green-300 bg-green-50' :
                          isWrong ? 'border-red-300 bg-red-50' :
                          'border-gray-200 bg-white'
                        }`}>
                          {item.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image_url} alt="" className="w-10 h-10 object-contain rounded border border-gray-200" />
                          )}
                          <span className="flex-1 text-sm text-gray-800">{item.text}</span>
                          <select
                            value={sel}
                            onChange={(e) => {
                              if (orderChecked) return
                              setOrderSelections(p => ({ ...p, [item.id]: e.target.value }))
                            }}
                            disabled={orderChecked}
                            className={`h-8 w-16 border rounded-lg px-1 text-sm text-center ${
                              isCorrect ? 'border-green-400 text-green-700' :
                              isWrong ? 'border-red-400 text-red-600' :
                              'border-gray-300'
                            }`}
                          >
                            <option value="">—</option>
                            {Array.from({ length: n }, (_, i) => (
                              <option key={i + 1} value={String(i + 1)}>ที่ {i + 1}</option>
                            ))}
                          </select>
                          {isCorrect && <span className="text-xs text-green-600 font-medium w-16">✓ ถูก</span>}
                          {isWrong && <span className="text-xs text-red-500 w-16">✗ ควรที่ {correctPos}</span>}
                        </div>
                      )
                    })}
                  </div>

                  {hasDuplicate && !orderChecked && (
                    <p className="text-xs text-orange-600">⚠️ มีลำดับซ้ำกัน กรุณาเลือกใหม่</p>
                  )}

                  {!orderChecked ? (
                    <button
                      type="button"
                      onClick={() => setOrderChecked(true)}
                      disabled={!allSelected || hasDuplicate}
                      className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      ตรวจคำตอบ
                    </button>
                  ) : (() => {
                    const correct = shuffledItems.filter(it => orderSelections[it.id] === String(correctOrder.indexOf(it.id) + 1)).length
                    return (
                      <div className={`p-3 rounded-lg text-sm font-medium border ${
                        correct === n ? 'bg-green-50 text-green-700 border-green-200' :
                        correct > 0 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {correct === n ? '🎉 ถูกต้องทุกรายการ!' : `✅ ถูก ${correct}/${n} รายการ`}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

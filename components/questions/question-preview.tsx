'use client'

import { useState } from 'react'
import { randomizeVariables, evaluateFormula, evaluateStudentAnswer } from '@/lib/math/evaluator'
import { RichText } from '@/components/ui/rich-text'

import { partLabels, type PartLabelStyle } from '@/lib/part-labels'
import { getBlankType, splitFillBlankHtml, extractBlankNumbers, acceptedAnswers, isBlankCorrect } from '@/lib/fill-blank'
import { splitAnswerBlankHtml, splitNumberedAnswerBlanks } from '@/lib/answer-blank'
import type { Variable, MCQOption, AnswerPart, QuestionType, MatchingPair, TrueFalseConfig, FillBlankConfig, OrderingConfig, OrderingItem, CompositeConfig, CompositePart } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
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
  compositeConfig?: CompositeConfig
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

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

function isClose(a: number, b: number): boolean {
  if (b === 0) return Math.abs(a) < 1e-6
  return Math.abs((a - b) / b) <= 0.01
}

function RenderText({ text }: { text: string }) {
  if (!text) return <p className="text-muted-foreground italic text-[15px]">ยังไม่มีเนื้อหาโจทย์</p>
  if (isHtml(text)) return (
    <div className="text-foreground leading-relaxed text-[15px] rich-text-content"
      dangerouslySetInnerHTML={{ __html: text }} />
  )
  return <p className="text-foreground leading-relaxed whitespace-pre-line text-[15px]">{text}</p>
}

// ── QuestionPreviewContent ──────────────────────────────────────────────────────
// The interactive "student view" itself — answerable, self-grading where the
// question type allows it. Self-contained (owns its own state, seeded fresh on
// mount) so it can be dropped anywhere, not just inside QuestionPreview's dialog.

export function QuestionPreviewContent({
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
  compositeConfig,
  partLabelStyle,
  attachmentUrls = [],
}: QuestionPreviewProps) {
  const labels = partLabels(partLabelStyle)
  const [values, setValues] = useState<Record<string, number>>(() => randomizeVariables(variables))
  const [shuffledRight, setShuffledRight] = useState<number[]>(() => matchingPairs.length > 0 ? shuffleIndices(matchingPairs.length) : [])

  // written
  const [writtenInputs, setWrittenInputs] = useState<string[]>(() => answerParts.map(() => ''))
  const [writtenResults, setWrittenResults] = useState<(boolean | null)[]>(() => answerParts.map(() => null))
  const [writtenChecked, setWrittenChecked] = useState(false)

  // mcq
  const [selectedMcq, setSelectedMcq] = useState<number | null>(null)
  const [mcqChecked, setMcqChecked] = useState(false)

  // matching
  const [matchingSelections, setMatchingSelections] = useState<string[]>(() => matchingPairs.map(() => ''))
  const [matchingChecked, setMatchingChecked] = useState(false)

  // true_false
  const [tfAnswers, setTfAnswers] = useState<('true' | 'false' | null)[]>(
    () => Array(1 + (trueFalseConfig?.statements?.length ?? 0)).fill(null)
  )
  const [tfExplanation, setTfExplanation] = useState('')
  const [tfChecked, setTfChecked] = useState(false)

  // fill_blank
  const [fillAnswers, setFillAnswers] = useState<string[]>(() => (fillBlankConfig?.blanks ?? []).map(() => ''))
  const [fillChecked, setFillChecked] = useState(false)
  const [fillResults, setFillResults] = useState<boolean[]>([])

  // ordering
  const [shuffledItems, setShuffledItems] = useState<OrderingItem[]>(
    () => orderingConfig?.items?.length ? [...orderingConfig.items].sort(() => Math.random() - 0.5) : []
  )
  const [orderSelections, setOrderSelections] = useState<Record<string, string>>({})
  const [orderChecked, setOrderChecked] = useState(false)

  // composite — one answer slot per part; ordering-type parts store their
  // per-item position selections as a JSON-encoded {itemId: position} object
  // (same shape as orderSelections above), everything else stores a plain string.
  const compositeParts = compositeConfig?.parts ?? []
  const [compositeAnswers, setCompositeAnswers] = useState<string[]>(() => compositeParts.map(() => ''))
  const [compositeShuffledItems, setCompositeShuffledItems] = useState<OrderingItem[][]>(
    () => compositeParts.map(p => p.items?.length ? [...p.items].sort(() => Math.random() - 0.5) : [])
  )
  const [compositeChecked, setCompositeChecked] = useState(false)
  const [compositeResults, setCompositeResults] = useState<(boolean | null)[]>([])

  function generate() {
    setValues(randomizeVariables(variables))
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
    setCompositeAnswers(compositeParts.map(() => ''))
    setCompositeShuffledItems(compositeParts.map(p => p.items?.length ? [...p.items].sort(() => Math.random() - 0.5) : []))
    setCompositeChecked(false)
    setCompositeResults([])
  }

  function checkCompositePart(part: CompositePart, i: number): boolean | null {
    if (part.type === 'true_false' && Array.isArray(part.choices) && part.choices.length > 0) {
      let ticks: string[] = []
      try { ticks = JSON.parse(compositeAnswers[i] || '[]') } catch { ticks = [] }
      const flip = part.select_target === 'wrong'
      return part.choices.every((c, ci) => (ticks[ci] === 'true') === (flip ? !c.correct_answer : c.correct_answer))
    }
    if (part.type === 'true_false') return compositeAnswers[i] === String(part.correct_answer ?? true)
    if (part.type === 'fill_blank') {
      const blank = part.blanks?.[0]
      if (!blank) return null
      if (getBlankType(undefined, blank) === 'text') return null
      return isBlankCorrect(compositeAnswers[i] ?? '', acceptedAnswers(blank), blank.type, blank.case_sensitive)
    }
    if (part.type === 'mcq') {
      const correct = part.options?.find(o => o.is_correct)
      return !!correct && compositeAnswers[i] === correct.text
    }
    if (part.type === 'ordering') {
      const items = part.items ?? []
      let sel: Record<string, string> = {}
      try { sel = JSON.parse(compositeAnswers[i] || '{}') } catch { sel = {} }
      return items.every((it, idx) => sel[it.id] === String(idx + 1))
    }
    return null
  }

  function checkComposite() {
    setCompositeResults(compositeParts.map((p, i) => checkCompositePart(p, i)))
    setCompositeChecked(true)
  }

  function checkWritten() {
    const results = answerParts.map((part, i) => {
      const correctAnswer = part.formula ? evaluateFormula(part.formula, values) : null
      if (correctAnswer === null || typeof correctAnswer !== 'number') return null
      const studentInput = evaluateStudentAnswer(writtenInputs[i])
      if (studentInput === null) return null
      return isClose(studentInput, correctAnswer)
    })
    setWrittenResults(results)
    setWrittenChecked(true)
  }

  const renderedText = questionText
    ? (Object.keys(values).length > 0 ? substituteVars(questionText, values) : questionText)
    : ''

  // "written" questions may embed one or more numbered answer inputs directly
  // in the main question text via [คำตอบ N] — same marker/mechanic as a
  // sub-question's own sub_text, just placed in the stem and supporting more
  // than one blank per block of text.
  const mainBlanks = questionType === 'written' ? splitNumberedAnswerBlanks(renderedText) : null
  const mainBlankCount = mainBlanks ? mainBlanks.numbers.length : 0

  const correctOptions = mcqOptions.map((o, i) => ({ ...o, idx: i })).filter(o => o.is_correct)
  const allWrittenFilled = writtenInputs.length > 0 && writtenInputs.every(v => v !== '')
  const allMatchingFilled = matchingSelections.length > 0 && matchingSelections.every(v => v !== '')

  const matchingScore = matchingSelections.filter((s, i) => {
    const correctLabel = shuffledRight.length > 0 ? RIGHT_LABELS[shuffledRight.indexOf(i)] : RIGHT_LABELS[i]
    return s === correctLabel
  }).length

  return (
    <div className="space-y-5">
      {/* Regenerate + variable badges (random only) */}
      <div className="flex items-center justify-between gap-3">
        {isRandom && Object.keys(values).length > 0 ? (
          <div className="flex flex-wrap gap-1.5 bg-primary/10 px-3 py-2 rounded-lg flex-1">
            {Object.entries(values).map(([k, v]) => (
              <span key={k} className="bg-card text-primary px-2.5 py-1 rounded-lg text-sm font-mono border border-primary/20">
                {k} = {v}
              </span>
            ))}
          </div>
        ) : <div />}
        <button
          type="button"
          onClick={generate}
          className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium shrink-0"
        >
          🔄 โจทย์ใหม่
        </button>
      </div>

      {/* Question text — fill_blank and single-part written-with-inline-blank render their own copy below, interleaved with the input(s) */}
      {questionType !== 'fill_blank' && mainBlankCount === 0 && <RenderText text={renderedText} />}

      {/* Question images */}
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {imageUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="รูปประกอบโจทย์"
              className="max-h-48 rounded-lg border border-border object-contain" />
          ))}
        </div>
      )}

      {/* File-upload reference attachments */}
      {questionType === 'file_upload' && attachmentUrls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {attachmentUrls.map((url) => (
            isPdfUrl(url) ? (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted hover:bg-accent transition-colors">
                <span className="text-lg">📄</span>
                <span className="text-[9px] text-muted-foreground">PDF</span>
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="ไฟล์อ้างอิงโจทย์"
                className="max-h-32 rounded-lg border border-border object-contain" />
            )
          ))}
        </div>
      )}

      {/* ── MCQ ── */}
      {questionType === 'mcq' && mcqOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">เลือกคำตอบที่ถูกต้อง:</p>
          {mcqOptions.map((opt, i) => {
            const isSelected = selectedMcq === i
            const isCorrect = opt.is_correct
            let cls = 'border-border bg-card'
            if (mcqChecked) {
              if (isCorrect) cls = 'border-success bg-success/10'
              else if (isSelected) cls = 'border-destructive bg-destructive/10'
            } else if (isSelected) {
              cls = 'border-primary bg-primary/10'
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => { if (!mcqChecked) setSelectedMcq(i) }}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 ${cls} text-left transition-colors ${!mcqChecked ? 'hover:border-primary/20 cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center
                  ${isSelected && !mcqChecked ? 'border-primary bg-primary' :
                    mcqChecked && isCorrect ? 'border-success bg-success' :
                    mcqChecked && isSelected ? 'border-destructive bg-destructive' :
                    'border-border'}`}
                >
                  {(isSelected || (mcqChecked && isCorrect)) && (
                    <span className="text-white text-[10px]">●</span>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-sm text-foreground">
                    {PART_LABELS[i]}. {opt.text || <span className="text-muted-foreground italic">ยังไม่มีข้อความ</span>}
                  </span>
                  {opt.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opt.image_url} alt={`ตัวเลือก ${PART_LABELS[i]}`}
                      className="max-h-32 rounded border border-border object-contain" />
                  )}
                  {mcqChecked && isCorrect && (
                    <span className="text-xs text-success font-medium block">✓ ถูกต้อง</span>
                  )}
                  {mcqChecked && isSelected && !isCorrect && (
                    <span className="text-xs text-destructive font-medium block">✗ คำตอบของคุณ</span>
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
              className="mt-1 px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              ตรวจคำตอบ
            </button>
          ) : (
            <div className={`p-3 rounded-lg text-sm font-medium border ${
              selectedMcq !== null && mcqOptions[selectedMcq]?.is_correct
                ? 'bg-success/10 text-success border-success/20'
                : 'bg-destructive/10 text-destructive border-destructive/20'
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium border-b border-border w-1/2">รายการ</th>
                  <th className="text-left py-2 px-3 font-medium border-b border-border w-1/2">คำตรงกัน (สุ่มลำดับแล้ว)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matchingPairs.map((pair, i) => {
                  const rightIdx = shuffledRight[i] ?? i
                  const rightPair = matchingPairs[rightIdx]
                  return (
                    <tr key={i}>
                      <td className="py-2 px-3 align-top">
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground shrink-0 mt-0.5 font-medium">{i + 1}.</span>
                          <div>
                            <span className="text-foreground">{pair.left_text || `รายการ ${i + 1}`}</span>
                            {pair.left_image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={pair.left_image} alt="" className="mt-1 max-h-16 rounded border border-border object-contain" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 align-top">
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-primary shrink-0 mt-0.5 font-medium">{RIGHT_LABELS[i]}.</span>
                          <div>
                            <span className="text-foreground">{rightPair?.right_text || `คำตรงกัน ${i + 1}`}</span>
                            {rightPair?.right_image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={rightPair.right_image} alt="" className="mt-1 max-h-16 rounded border border-border object-contain" />
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
            <p className="text-xs text-muted-foreground font-medium">เลือกตัวอักษรที่ตรงกัน:</p>
            {matchingPairs.map((pair, i) => {
              const correctLabel = shuffledRight.length > 0
                ? RIGHT_LABELS[shuffledRight.indexOf(i)]
                : RIGHT_LABELS[i]
              const studentSelected = matchingSelections[i] || ''
              const isCorrect = matchingChecked && studentSelected === correctLabel
              const isWrong = matchingChecked && studentSelected !== correctLabel
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground shrink-0 w-28 truncate">
                    {i + 1}. {pair.left_text || `รายการ ${i + 1}`}
                  </span>
                  <NativeSelect
                    value={studentSelected}
                    onChange={(e) => {
                      if (matchingChecked) return
                      const next = [...matchingSelections]
                      next[i] = e.target.value
                      setMatchingSelections(next)
                    }}
                    disabled={matchingChecked}
                    className={`h-8 w-20 border rounded-lg px-2 text-sm text-center ${
                      isCorrect ? 'border-success bg-success/10 text-success' :
                      isWrong ? 'border-destructive bg-destructive/10 text-destructive' :
                      'border-border bg-card'
                    }`}
                  >
                    <option value="">—</option>
                    {RIGHT_LABELS.slice(0, matchingPairs.length).map(label => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </NativeSelect>
                  {isCorrect && <span className="text-xs text-success font-medium">✓</span>}
                  {isWrong && <span className="text-xs text-destructive">✗ เฉลย: <strong>{correctLabel}</strong></span>}
                </div>
              )
            })}
          </div>

          {!matchingChecked ? (
            <button
              type="button"
              onClick={() => setMatchingChecked(true)}
              disabled={!allMatchingFilled}
              className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              ตรวจคำตอบ
            </button>
          ) : (
            <div className={`p-3 rounded-lg text-sm font-medium border ${
              matchingScore === matchingPairs.length
                ? 'bg-success/10 text-success border-success/20'
                : matchingScore > 0
                  ? 'bg-flag/10 text-flag border-flag/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}>
              {matchingScore === matchingPairs.length
                ? '🎉 ถูกต้องทุกข้อ!'
                : `✅ ถูก ${matchingScore}/${matchingPairs.length} ข้อ`}
            </div>
          )}
        </div>
      )}

      {/* ── Written (fixed / random) ── */}
      {questionType === 'written' && (() => {
        function renderInputAndFeedback(i: number, part: AnswerPart) {
          const correctAnswer = part.formula ? evaluateFormula(part.formula, values) : null
          const result = writtenResults[i]
          const inputEl = (
            <Input
              type="text"
              inputMode="text"
              value={writtenInputs[i] ?? ''}
              onChange={(e) => {
                if (writtenChecked) return
                const next = [...writtenInputs]
                next[i] = e.target.value
                setWrittenInputs(next)
              }}
              readOnly={writtenChecked}
              placeholder="เช่น 10, 9+1, sqrt(100) หรือ sin(30)"
              className={`h-9 w-36 border rounded-lg px-3 text-sm bg-card font-mono ${
                result === true ? 'border-success' :
                result === false ? 'border-destructive' :
                'border-border'
              }`}
            />
          )
          const feedback = (
            <>
              {result === true && (
                <span className="text-success text-sm font-medium">✓ ถูก!</span>
              )}
              {result === false && correctAnswer !== null && typeof correctAnswer === 'number' && (
                <span className="text-destructive text-sm">
                  ✗ เฉลย: <span className="font-mono font-bold">{formatAnswer(correctAnswer)}</span>
                </span>
              )}
              {result === false && (correctAnswer === null || typeof correctAnswer !== 'number') && (
                <span className="text-destructive text-sm">✗ ผิด</span>
              )}
            </>
          )
          return { inputEl, feedback }
        }

        const restParts = answerParts.slice(mainBlankCount)

        return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium">กรอกคำตอบ:</p>

          {mainBlankCount > 0 && mainBlanks && (
            <div className="leading-loose text-foreground text-[15px]">
              {mainBlanks.parts.map((frag, i) => {
                const num = mainBlanks.numbers[i]
                const part = answerParts[i]
                if (num === undefined || !part) return <RichText key={i} text={frag} className="[&_p]:inline" />
                const { inputEl, feedback } = renderInputAndFeedback(i, part)
                return (
                  <span key={i}>
                    {frag && <RichText text={frag} className="[&_p]:inline" />}
                    <span className="inline-flex items-center gap-1.5 mx-1 align-middle">
                      <span className="text-xs font-semibold text-muted-foreground shrink-0">{num})</span>
                      {inputEl}
                      {part.unit && <span className="text-muted-foreground">{renderUnit(part.unit)}</span>}
                      {feedback}
                    </span>
                  </span>
                )
              })}
            </div>
          )}

          {restParts.map((part, relI) => {
            const i = mainBlankCount + relI
            const { inputEl, feedback } = renderInputAndFeedback(i, part)
            const blankSplit = part.sub_text ? splitAnswerBlankHtml(part.sub_text) : null

            return (
              <div key={part.id} className="space-y-1.5">
                {blankSplit ? (
                  <div className={`flex flex-wrap items-center gap-2 p-3 rounded-lg border text-sm text-foreground ${
                    writtenResults[i] === true ? 'bg-success/10 border-success/20' :
                    writtenResults[i] === false ? 'bg-destructive/10 border-destructive/20' :
                    'bg-muted border-border'
                  }`}>
                    {answerParts.length > 1 && <span className="font-medium shrink-0">{labels[i] ?? i + 1})</span>}
                    {blankSplit[0] && <RichText text={blankSplit[0]} className="[&_p]:inline" />}
                    {inputEl}
                    {part.unit && <span className="text-muted-foreground">{renderUnit(part.unit)}</span>}
                    {blankSplit[1] && <RichText text={blankSplit[1]} className="[&_p]:inline" />}
                    {feedback}
                  </div>
                ) : (
                  <>
                    {part.sub_text && (
                      <p className="text-sm font-medium text-muted-foreground">
                        {answerParts.length > 1 && <>{labels[i] ?? i + 1}) </>}
                        <RichText text={part.sub_text} className="font-normal text-muted-foreground" />
                      </p>
                    )}
                    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                      writtenResults[i] === true ? 'bg-success/10 border-success/20' :
                      writtenResults[i] === false ? 'bg-destructive/10 border-destructive/20' :
                      'bg-muted border-border'
                    }`}>
                      {inputEl}
                      {part.unit && <span className="text-sm text-muted-foreground">{renderUnit(part.unit)}</span>}
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
              className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              ตรวจคำตอบ
            </button>
          ) : (
            <div className={`p-3 rounded-lg text-sm font-medium border ${
              writtenResults.every(r => r === true)
                ? 'bg-success/10 text-success border-success/20'
                : writtenResults.some(r => r === true)
                  ? 'bg-flag/10 text-flag border-flag/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
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
        )
      })()}

      {/* ── Essay ── */}
      {questionType === 'essay' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">กรอกคำตอบ (บรรยาย):</p>
          <Textarea
            rows={5}
            placeholder="พิมพ์คำตอบที่นี่..." className="w-full resize-none"
          />
          <p className="text-xs text-primary bg-primary/10 px-3 py-2 rounded-lg">
            * ครูจะเป็นผู้ตรวจและให้คะแนน — ระบบไม่ตรวจอัตโนมัติ
          </p>
        </div>
      )}

      {/* ── File upload ── */}
      {questionType === 'file_upload' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">แนบไฟล์คำตอบ (จำลอง):</p>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            📎 นักเรียนจะแนบไฟล์รูปภาพหรือ PDF ที่นี่
          </div>
          <p className="text-xs text-primary bg-primary/10 px-3 py-2 rounded-lg">
            * ระบบให้คะแนนเต็มอัตโนมัติเมื่อมีการแนบไฟล์อย่างน้อย 1 ไฟล์ — ไม่มีการตรวจเนื้อหาไฟล์
          </p>
        </div>
      )}

      {/* ── True/False ── */}
      {questionType === 'true_false' && trueFalseConfig && trueFalseConfig.answer_mode === 'select_matching' && (() => {
        const subStatements = trueFalseConfig.statements ?? []
        const labels = partLabels(trueFalseConfig.part_label_style)
        const items = [{ text: '', correct_answer: trueFalseConfig.correct_answer }, ...subStatements]
        const isTarget = (correct: boolean) => trueFalseConfig.select_target === 'wrong' ? !correct : correct
        const correctCount = items.reduce((n, st, i) => n + (((tfAnswers[i] === 'true') === isTarget(st.correct_answer)) ? 1 : 0), 0)
        const total = items.length
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground font-medium">
              ข้อใดต่อไปนี้{trueFalseConfig.select_target === 'wrong' ? 'ผิด' : 'ถูกต้อง'}? (เลือกได้มากกว่า 1 ข้อ)
            </p>
            <div className="space-y-2">
              {items.map((st, i) => {
                const ticked = tfAnswers[i] === 'true'
                let cls = 'border-border bg-card'
                if (tfChecked) {
                  cls = isTarget(st.correct_answer) ? 'border-success bg-success/10' : ticked ? 'border-destructive bg-destructive/10' : 'border-border bg-card'
                } else if (ticked) {
                  cls = 'border-primary bg-primary/10'
                }
                return (
                  <label key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border-2 ${cls} ${tfChecked ? 'cursor-default' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={ticked}
                      disabled={tfChecked}
                      onChange={() => { if (!tfChecked) setTfAnswers(a => a.map((v, ai) => ai === i ? (v === 'true' ? 'false' : 'true') : v)) }}
                      className="mt-0.5"
                    />
                    <span className="flex items-center gap-1.5 flex-wrap text-sm text-foreground">
                      <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>
                      {i > 0 && <RenderText text={st.text} />}
                    </span>
                  </label>
                )
              })}
            </div>

            {trueFalseConfig.explanation_mode !== 'none' && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {trueFalseConfig.explanation_mode === 'wrong_only'
                    ? 'ให้เหตุผล (กรณีตอบผิด):'
                    : 'ให้เหตุผล:'}
                </p>
                <Textarea
                  value={tfExplanation}
                  onChange={(e) => { if (!tfChecked) setTfExplanation(e.target.value) }}
                  readOnly={tfChecked}
                  rows={3}
                  placeholder="พิมพ์เหตุผลที่นี่..." className="w-full resize-none"
                />
                <p className="text-xs text-warning bg-warning/10 px-2 py-1.5 rounded-lg">
                  ครูจะตรวจเหตุผลและให้คะแนนด้วยมือ ({trueFalseConfig.score_explanation} คะแนน)
                </p>
              </div>
            )}

            {!tfChecked ? (
              <button
                type="button"
                onClick={() => setTfChecked(true)}
                className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 font-medium transition-colors"
              >
                ตรวจคำตอบ
              </button>
            ) : (
              <div className={`p-3 rounded-lg text-sm font-medium border ${
                correctCount === total
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
              }`}>
                {correctCount === total ? '🎉 ถูกต้องทุกข้อ!' : `ถูก ${correctCount}/${total} ข้อ`}
              </div>
            )}
          </div>
        )
      })()}

      {questionType === 'true_false' && trueFalseConfig && trueFalseConfig.answer_mode !== 'select_matching' && (() => {
        const subStatements = trueFalseConfig.statements ?? []
        const labels = partLabels(trueFalseConfig.part_label_style)
        const hasSubs = subStatements.length > 0
        const correctCount = subStatements.reduce((n, s, i) =>
          n + (tfAnswers[i + 1] === (s.correct_answer ? 'true' : 'false') ? 1 : 0),
          tfAnswers[0] === (trueFalseConfig.correct_answer ? 'true' : 'false') ? 1 : 0)
        const total = 1 + subStatements.length
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground font-medium">ข้อความแต่ละข้อถูกหรือผิด?</p>
            {[{ text: '', correct_answer: trueFalseConfig.correct_answer }, ...subStatements].map((st, i) => (
              <div key={i} className="space-y-1.5">
                {hasSubs && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground">{labels[i] ?? i + 1})</span>
                    {i > 0 && <RenderText text={st.text} />}
                  </div>
                )}
                <div className="flex gap-3">
                  {([
                    { val: 'true' as const,  label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' },
                    { val: 'false' as const, label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' },
                  ]).map(({ val, label, cls }) => (
                    <button
                      key={val}
                      type="button"
                      disabled={tfChecked}
                      onClick={() => { if (!tfChecked) setTfAnswers(a => a.map((v, ai) => ai === i ? val : v)) }}
                      className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-colors ${
                        tfAnswers[i] === val && !tfChecked ? cls :
                        tfChecked && val === (st.correct_answer ? 'true' : 'false') ? 'border-success bg-success/10 text-success' :
                        tfChecked && tfAnswers[i] === val ? 'border-destructive bg-destructive/10 text-destructive' :
                        'border-border text-muted-foreground'
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
                <p className="text-xs text-muted-foreground">
                  {trueFalseConfig.explanation_mode === 'wrong_only'
                    ? 'ให้เหตุผล (กรณีตอบผิด):'
                    : 'ให้เหตุผล:'}
                </p>
                <Textarea
                  value={tfExplanation}
                  onChange={(e) => { if (!tfChecked) setTfExplanation(e.target.value) }}
                  readOnly={tfChecked}
                  rows={3}
                  placeholder="พิมพ์เหตุผลที่นี่..." className="w-full resize-none"
                />
                <p className="text-xs text-warning bg-warning/10 px-2 py-1.5 rounded-lg">
                  ครูจะตรวจเหตุผลและให้คะแนนด้วยมือ ({trueFalseConfig.score_explanation} คะแนน)
                </p>
              </div>
            )}

            {!tfChecked ? (
              <button
                type="button"
                onClick={() => setTfChecked(true)}
                disabled={tfAnswers.some(a => a === null)}
                className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                ตรวจคำตอบ
              </button>
            ) : (
              <div className={`p-3 rounded-lg text-sm font-medium border ${
                correctCount === total
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
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
        const parts = splitFillBlankHtml(questionText)
        const blankNumbers = extractBlankNumbers(questionText)
        const blanks = fillBlankConfig.blanks
        const types = blanks.map(b => getBlankType(fillBlankConfig, b))
        const autoIdx = types.reduce<number[]>((acc, t, i) => { if (t !== 'text') acc.push(i); return acc }, [])
        const hasManual = types.some(t => t === 'text')
        const hasAuto = autoIdx.length > 0
        return (
          <div className="space-y-4">
            <div className="leading-loose text-foreground text-[15px]">
              {parts.map((part, i) => {
                const type = types[i]
                return (
                  <span key={i}>
                    <RichText text={part} />
                    {type === 'dropdown' ? (
                      <NativeSelect
                        value={fillAnswers[i] ?? ''}
                        onChange={(e) => {
                          if (fillChecked) return
                          const next = [...fillAnswers]
                          next[i] = e.target.value
                          setFillAnswers(next)
                        }}
                        disabled={fillChecked}
                        className={`inline-block mx-1 px-2 py-0.5 border-b-2 border-primary bg-primary/10 rounded text-sm text-center focus:outline-none focus:border-ring ${
                          fillChecked ? (fillResults[i] ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10') : ''
                        }`}
                      >
                        <option value="">เลือกคำตอบ</option>
                        {(blanks[i]?.options ?? []).map((opt, oi) => (
                          <option key={oi} value={opt}>{opt}</option>
                        ))}
                      </NativeSelect>
                    ) : i < blanks.length ? (
                      <Input
                        type="text"
                        value={fillAnswers[i] ?? ''}
                        onChange={(e) => {
                          if (fillChecked) return
                          const next = [...fillAnswers]
                          next[i] = e.target.value
                          setFillAnswers(next)
                        }}
                        readOnly={fillChecked}
                        className={`inline-block mx-1 px-2 py-0.5 w-28 border-b-2 border-primary bg-primary/10 rounded text-sm text-center focus:outline-none focus:border-ring ${
                          fillChecked && type !== 'text'
                            ? fillResults[i] ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'
                            : ''
                        }`}
                      />
                    ) : null}
                  </span>
                )
              })}
            </div>

            {hasManual && (
              <p className="text-xs text-flag font-medium">
                {hasAuto ? 'บางช่องครูผู้สอนจะเป็นผู้ตรวจและให้คะแนนเอง' : 'ครูผู้สอนจะเป็นผู้ตรวจและให้คะแนน'}
              </p>
            )}

            {hasAuto && (
              <>
                {fillChecked && (
                  <div className="space-y-1">
                    {blanks.map((b, i) => types[i] === 'text' ? null : (
                      <p key={i} className={`text-xs px-2 py-1 rounded ${fillResults[i] ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10'}`}>
                        {fillResults[i]
                          ? `✓ ช่อง ${blankNumbers[i] ?? i + 1}: ถูกต้อง`
                          : `✗ ช่อง ${blankNumbers[i] ?? i + 1}: เฉลยคือ "${acceptedAnswers(b).join(' หรือ ')}"`}
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
                        return isBlankCorrect(fillAnswers[i] ?? '', acceptedAnswers(b), types[i], b.case_sensitive)
                      })
                      setFillResults(results)
                      setFillChecked(true)
                    }}
                    disabled={autoIdx.some(i => !fillAnswers[i]?.trim())}
                    className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    ตรวจคำตอบ
                  </button>
                ) : (
                  <div className={`p-3 rounded-lg text-sm font-medium border ${
                    autoIdx.every(i => fillResults[i])
                      ? 'bg-success/10 text-success border-success/20'
                      : autoIdx.some(i => fillResults[i])
                        ? 'bg-flag/10 text-flag border-flag/20'
                        : 'bg-destructive/10 text-destructive border-destructive/20'
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
            <p className="text-xs text-muted-foreground font-medium">เลือกลำดับสำหรับแต่ละรายการ:</p>
            <div className="space-y-2">
              {shuffledItems.map((item) => {
                const sel = orderSelections[item.id] ?? ''
                const correctPos = correctOrder.indexOf(item.id) + 1
                const isCorrect = orderChecked && sel === String(correctPos)
                const isWrong = orderChecked && sel !== String(correctPos)
                return (
                  <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    isCorrect ? 'border-success/20 bg-success/10' :
                    isWrong ? 'border-destructive/20 bg-destructive/10' :
                    'border-border bg-card'
                  }`}>
                    {item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="w-10 h-10 object-contain rounded border border-border" />
                    )}
                    <span className="flex-1 text-sm text-foreground">{item.text}</span>
                    <NativeSelect
                      value={sel}
                      onChange={(e) => {
                        if (orderChecked) return
                        setOrderSelections(p => ({ ...p, [item.id]: e.target.value }))
                      }}
                      disabled={orderChecked}
                      className={`h-8 w-16 border rounded-lg px-1 text-sm text-center ${
                        isCorrect ? 'border-success text-success' :
                        isWrong ? 'border-destructive text-destructive' :
                        'border-border'
                      }`}
                    >
                      <option value="">—</option>
                      {Array.from({ length: n }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>ที่ {i + 1}</option>
                      ))}
                    </NativeSelect>
                    {isCorrect && <span className="text-xs text-success font-medium w-16">✓ ถูก</span>}
                    {isWrong && <span className="text-xs text-destructive w-16">✗ ควรที่ {correctPos}</span>}
                  </div>
                )
              })}
            </div>

            {hasDuplicate && !orderChecked && (
              <p className="text-xs text-flag">⚠️ มีลำดับซ้ำกัน กรุณาเลือกใหม่</p>
            )}

            {!orderChecked ? (
              <button
                type="button"
                onClick={() => setOrderChecked(true)}
                disabled={!allSelected || hasDuplicate}
                className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                ตรวจคำตอบ
              </button>
            ) : (() => {
              const correct = shuffledItems.filter(it => orderSelections[it.id] === String(correctOrder.indexOf(it.id) + 1)).length
              return (
                <div className={`p-3 rounded-lg text-sm font-medium border ${
                  correct === n ? 'bg-success/10 text-success border-success/20' :
                  correct > 0 ? 'bg-flag/10 text-flag border-flag/20' :
                  'bg-destructive/10 text-destructive border-destructive/20'
                }`}>
                  {correct === n ? '🎉 ถูกต้องทุกรายการ!' : `✅ ถูก ${correct}/${n} รายการ`}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── Composite ── */}
      {questionType === 'composite' && compositeParts.length > 0 && (() => {
        const labels = partLabels(compositeConfig?.part_label_style)
        const autoCount = compositeParts.filter(p => !(p.type === 'fill_blank' && getBlankType(undefined, p.blanks?.[0]) === 'text')).length
        return (
          <div className="space-y-4">
            {compositeParts.map((part, i) => {
              const result = compositeChecked ? compositeResults[i] : null
              const boxClass = result === true ? 'border-success/20 bg-success/10' : result === false ? 'border-destructive/20 bg-destructive/10' : 'border-border bg-card'
              function setAnswer(v: string) {
                setCompositeAnswers(prev => { const next = [...prev]; next[i] = v; return next })
              }
              return (
                <div key={part.id} className={`rounded-xl border p-3.5 space-y-2.5 ${boxClass}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center">{labels[i] ?? i + 1}</span>
                    {result === true && <span className="text-xs text-success font-medium">✓ ถูก</span>}
                    {result === false && <span className="text-xs text-destructive font-medium">✗ ผิด</span>}
                    {result === null && compositeChecked && <span className="text-xs text-warning font-medium">รอครูตรวจ</span>}
                  </div>

                  {part.type === 'true_false' && Array.isArray(part.choices) && part.choices.length > 0 && (() => {
                    let ticks: string[] = []
                    try { ticks = JSON.parse(compositeAnswers[i] || '[]') } catch { ticks = [] }
                    const flip = part.select_target === 'wrong'
                    function toggleChoice(ci: number) {
                      if (compositeChecked) return
                      const next = [...ticks]
                      next[ci] = next[ci] === 'true' ? 'false' : 'true'
                      setAnswer(JSON.stringify(next))
                    }
                    return (
                      <>
                        <RichText text={part.text} className="text-[15px] text-foreground" />
                        <p className="text-xs text-muted-foreground">ข้อใดต่อไปนี้{part.select_target === 'wrong' ? 'ผิด' : 'ถูกต้อง'}? (เลือกได้มากกว่า 1 ข้อ)</p>
                        <div className="space-y-1.5">
                          {part.choices!.map((c, ci) => {
                            const ticked = ticks[ci] === 'true'
                            const isTargetChoice = flip ? !c.correct_answer : c.correct_answer
                            let cls = 'border-border'
                            if (compositeChecked) cls = isTargetChoice ? 'border-success bg-success/10' : ticked ? 'border-destructive bg-destructive/10' : 'border-border'
                            else if (ticked) cls = 'border-primary bg-primary/10'
                            return (
                              <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${cls} ${compositeChecked ? 'cursor-not-allowed opacity-90' : ''}`}>
                                <input type="checkbox" checked={ticked} disabled={compositeChecked} onChange={() => toggleChoice(ci)} />
                                <RichText text={c.text} />
                              </label>
                            )
                          })}
                        </div>
                      </>
                    )
                  })()}

                  {part.type === 'true_false' && !(Array.isArray(part.choices) && part.choices.length > 0) && (
                    <>
                      <RichText text={part.text} className="text-[15px] text-foreground" />
                      <div className="flex gap-3">
                        {[{ val: true, label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' }, { val: false, label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' }].map(({ val, label, cls }) => (
                          <button key={String(val)} type="button" disabled={compositeChecked}
                            onClick={() => setAnswer(String(val))}
                            className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${compositeAnswers[i] === String(val) ? cls : 'border-border text-muted-foreground hover:border-ring'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {part.type === 'fill_blank' && part.blanks?.[0] && (() => {
                    const blank = part.blanks![0]
                    const split = splitAnswerBlankHtml(part.text)
                    const type = getBlankType(undefined, blank)
                    if (!split) return <RichText text={part.text} className="text-[15px] text-foreground" />
                    return (
                      <p className="leading-loose text-[15px] text-foreground">
                        <RichText text={split[0]} />
                        {type === 'dropdown' ? (
                          <NativeSelect value={compositeAnswers[i] ?? ''} disabled={compositeChecked}
                            onChange={e => setAnswer(e.target.value)} className="inline-block mx-1 border-b-2 border-primary bg-primary/10 text-center">
                            <option value="">เลือกคำตอบ</option>
                            {(blank.options ?? []).map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
                          </NativeSelect>
                        ) : (
                          <Input type="text" value={compositeAnswers[i] ?? ''} disabled={compositeChecked}
                            onChange={e => setAnswer(e.target.value)} className="inline-block mx-1 w-28 border-b-2 border-primary bg-primary/10 text-center" />
                        )}
                        <RichText text={split[1]} />
                      </p>
                    )
                  })()}

                  {part.type === 'mcq' && (
                    <>
                      <RichText text={part.text} className="text-[15px] text-foreground" />
                      <div className="space-y-1.5">
                        {(part.options ?? []).map((opt, oi) => (
                          <label key={oi} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${compositeAnswers[i] === opt.text ? 'border-tint-1 bg-tint-1/10' : 'border-border'} ${compositeChecked ? 'cursor-not-allowed opacity-80' : ''}`}>
                            <input type="radio" name={`composite-mcq-${part.id}`} disabled={compositeChecked}
                              checked={compositeAnswers[i] === opt.text}
                              onChange={() => setAnswer(opt.text)} />
                            <RichText text={opt.text} />
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  {part.type === 'ordering' && (() => {
                    const items = compositeShuffledItems[i] ?? []
                    const n = items.length
                    let sel: Record<string, string> = {}
                    try { sel = JSON.parse(compositeAnswers[i] || '{}') } catch { sel = {} }
                    function setSel(itemId: string, pos: string) {
                      const next = { ...sel, [itemId]: pos }
                      setAnswer(JSON.stringify(next))
                    }
                    return (
                      <>
                        <RichText text={part.text} className="text-[15px] text-foreground" />
                        <div className="space-y-2">
                          {items.map(item => (
                            <Card radius="sm" className="flex items-center gap-3 p-2" key={item.id}>
                              <RichText text={item.text} className="flex-1 text-sm text-foreground" />
                              <NativeSelect value={sel[item.id] ?? ''} disabled={compositeChecked}
                                onChange={e => setSel(item.id, e.target.value)} className="w-16 text-center">
                                <option value="">—</option>
                                {Array.from({ length: n }, (_, oi) => <option key={oi + 1} value={String(oi + 1)}>ที่ {oi + 1}</option>)}
                              </NativeSelect>
                            </Card>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )
            })}

            {!compositeChecked ? (
              <button type="button" onClick={checkComposite}
                className="px-5 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 font-medium transition-colors">
                ตรวจคำตอบ
              </button>
            ) : (() => {
              const gradable = compositeResults.filter(r => r !== null)
              const correctCount = gradable.filter(Boolean).length
              return (
                <div className={`p-3 rounded-lg text-sm font-medium border ${
                  correctCount === autoCount ? 'bg-success/10 text-success border-success/20' :
                  correctCount > 0 ? 'bg-flag/10 text-flag border-flag/20' :
                  'bg-destructive/10 text-destructive border-destructive/20'
                }`}>
                  {correctCount === autoCount ? '🎉 ถูกต้องทุกข้อ (ที่ตรวจอัตโนมัติ)!' : `✅ ถูก ${correctCount}/${autoCount} ข้อ (ที่ตรวจอัตโนมัติ)`}
                </div>
              )
            })()}
          </div>
        )
      })()}
    </div>
  )
}

// ── QuestionPreview ──────────────────────────────────────────────────────────────
// Button + dialog wrapper around QuestionPreviewContent, used inline in the
// question create/edit forms.

export function QuestionPreview(props: QuestionPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
      >
        👁 ดูตัวอย่าง
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>👁</span>
              <span>มุมมองนักเรียน</span>
              {props.isRandom && <span className="text-xs font-normal text-primary">· ค่าถูกสุ่มแล้ว</span>}
            </DialogTitle>
          </DialogHeader>

          {open && <QuestionPreviewContent {...props} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

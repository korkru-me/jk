'use client'

import { useState } from 'react'

import { ImageLabelInput } from '@/components/exam/image-label-input'
import { MathAnswerField } from '@/components/exam/math-answer-field'
import { MatchingDragInput, type MatchingOption } from '@/components/exam/matching-drag-input'
import { MatchingLineInput } from '@/components/exam/matching-line-input'
import { OrderingDragList } from '@/components/exam/ordering-drag-list'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { RichText } from '@/components/ui/rich-text'
import { CLASSIFY_UNSET } from '@/lib/classify'
import type {
  SafeClassifyConfig,
  SafeCompositeConfig,
  SafeFillBlankConfig,
  SafeImageLabelConfig,
  SafeMatchingConfig,
  SafeOrderingConfig,
  SafeTrueFalseConfig,
  SafeExamAnswer,
} from '@/lib/exam-safe'
import { extractBlankNumbers, splitFillBlankHtml } from '@/lib/fill-blank'
import { splitAnswerBlankHtml, splitNumberedAnswerBlanks } from '@/lib/answer-blank'
import { normalizeImageLabelMode } from '@/lib/image-label'
import { mathInputPartKey, readMathInputMode, type MathInputModes } from '@/lib/math/input-mode'
import {
  placementFromPracticeMatchingTokens,
  practiceMatchingTokensFromPlacement,
} from '@/lib/practice-matching'
import { partLabels } from '@/lib/part-labels'
import type { OrderingItem } from '@/lib/types'
import type { MathInputMode } from '@/lib/types'

interface PracticeAnswerInputProps {
  question: SafeExamAnswer
  value: string
  onChange: (value: string) => void
  mathInputModes: MathInputModes
  onMathInputModeChange: (partKey: string, mode: MathInputMode) => void
  disabled?: boolean
}

const CHOICE_LABELS = partLabels('thai')

function stringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed) && parsed.every(value => typeof value === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

function numberGrid(raw: string): number[][] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed)
      ? parsed.map(row => Array.isArray(row)
          ? row.map(value => Number.isInteger(value) ? Number(value) : CLASSIFY_UNSET)
          : [])
      : []
  } catch {
    return []
  }
}

function orderedItems(items: OrderingItem[], raw: string): OrderingItem[] {
  const ids = stringArray(raw)
  if (ids.length !== items.length || new Set(ids).size !== ids.length) return items
  const byId = new Map(items.map(item => [item.id, item]))
  const ordered = ids.map(id => byId.get(id)).filter((item): item is OrderingItem => Boolean(item))
  return ordered.length === items.length ? ordered : items
}

function QuestionImages({ urls, label = 'รูปประกอบโจทย์' }: { urls?: string[] | null; label?: string }) {
  if (!urls?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map(url => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt={label} className="max-h-48 max-w-full rounded-xl border border-border object-contain" />
      ))}
    </div>
  )
}

function WrittenInput({
  question,
  value,
  onChange,
  mathInputModes,
  onMathInputModeChange,
  disabled,
}: PracticeAnswerInputProps) {
  const [activeMathField, setActiveMathField] = useState<string | null>(null)
  const storedParts = question.questions.answer_parts ?? []
  const parts = storedParts.length > 0
    ? storedParts
    : [{ id: 'main', sub_text: '', unit: question.questions.answer_unit ?? '' }]
  const values = parts.length === 1 ? [value] : stringArray(value)
  const update = (index: number, next: string) => {
    const copy = Array.from({ length: parts.length }, (_, partIndex) => values[partIndex] ?? '')
    copy[index] = next
    onChange(parts.length === 1 ? next : JSON.stringify(copy))
  }
  const control = (index: number, visibleNumber?: number) => {
    const part = parts[index]
    const partKey = mathInputPartKey(part.id, index, parts.length)
    const fieldId = `practice-written-${question.question_id}-${partKey}`
    const unit = part.unit || (parts.length === 1 ? question.questions.answer_unit : '')
    return (
      <span className="inline-flex max-w-full items-center gap-2 align-middle">
        {visibleNumber !== undefined && (
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">{visibleNumber})</span>
        )}
        <MathAnswerField
          value={values[index] ?? ''}
          mode={readMathInputMode(mathInputModes, partKey)}
          active={!disabled && activeMathField === fieldId}
          onActivate={() => {
            if (!disabled) setActiveMathField(fieldId)
          }}
          onDeactivate={() => setActiveMathField(null)}
          onChange={next => update(index, next)}
          onModeChange={mode => onMathInputModeChange(partKey, mode)}
          placeholder="เช่น 10, 9+1 หรือ √100"
          ariaLabel={parts.length === 1 ? 'คำตอบตัวเลข' : `คำตอบช่อง ${visibleNumber ?? index + 1}`}
          disabled={disabled}
          unit={unit || undefined}
          className="w-full max-w-sm"
          inputClassName="min-h-11"
        />
      </span>
    )
  }
  const mainTemplate = splitNumberedAnswerBlanks(question.questions.question_text)
  const embeddedCount = Math.min(mainTemplate.numbers.length, parts.length)

  const renderPart = (part: (typeof parts)[number], index: number) => {
    const split = splitAnswerBlankHtml(part.sub_text)
    return (
      <div key={part.id} className="flex max-w-lg flex-col gap-1.5 text-sm">
        {split ? (
          <div className="flex flex-wrap items-center gap-2 leading-loose">
            {split[0] && <RichText text={split[0]} className="[&_p]:inline" />}
            {control(index)}
            {split[1] && <RichText text={split[1]} className="[&_p]:inline" />}
          </div>
        ) : (
          <>
            {part.sub_text && <RichText text={part.sub_text} className="font-medium" blocks />}
            {!part.sub_text && <span className="font-medium">{parts.length === 1 ? 'คำตอบ' : `คำตอบช่อง ${index + 1}`}</span>}
            {control(index)}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {embeddedCount > 0 && (
        <div className="text-sm leading-loose">
          {mainTemplate.parts.map((fragment, index) => (
            <span key={index}>
              {fragment && <RichText text={fragment} className="[&_p]:inline" />}
              {index < embeddedCount ? control(index, mainTemplate.numbers[index]) : null}
            </span>
          ))}
        </div>
      )}
      {parts.slice(embeddedCount).map((part, offset) => renderPart(part, embeddedCount + offset))}
    </div>
  )
}

function McqInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">เลือกคำตอบ</legend>
      {(question.questions.mcq_options ?? []).map((option, index) => {
        const answer = `MCQ:${option.index ?? index}`
        return (
          <label
            key={`${option.index ?? index}-${option.text ?? ''}`}
            className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${
              value === answer ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name={`practice-${question.question_id}`}
              value={answer}
              checked={value === answer}
              disabled={disabled}
              onChange={() => onChange(answer)}
            />
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {CHOICE_LABELS[index] ?? index + 1}
            </span>
            <span className="min-w-0 flex-1"><RichText text={option.text ?? ''} /></span>
            {option.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={option.image_url} alt="รูปตัวเลือก" className="max-h-20 max-w-28 rounded-lg border border-border object-contain" />
            )}
          </label>
        )
      })}
    </fieldset>
  )
}

function MatchingInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const prompts = (question.questions.mcq_options ?? []).map(prompt => ({
    text: prompt.left_text ?? '',
    imageUrl: prompt.left_image,
  }))
  const rawOptions = question.questions.matching_options ?? []
  const options = rawOptions.map((option, index) => ({
    id: String(index),
    text: option.right_text,
    imageUrl: option.right_image,
  })) satisfies MatchingOption[]
  const picked = stringArray(value)
  const placement = placementFromPracticeMatchingTokens(picked, rawOptions, prompts.length)
  const shared = {
    prompts,
    options,
    placement,
    disabled,
    onChange: (next: (string | null)[]) => onChange(JSON.stringify(
      practiceMatchingTokensFromPlacement(next, rawOptions),
    )),
  }
  const mode = (question.questions.extra_data as SafeMatchingConfig | null)?.answer_mode
  return mode === 'lines'
    ? <MatchingLineInput {...shared} />
    : <MatchingDragInput {...shared} />
}

function TrueFalseInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const config = (question.questions.extra_data ?? {}) as SafeTrueFalseConfig
  const statements = [
    { id: 'main', text: question.questions.question_text },
    ...(config.statements ?? []),
  ]
  const labels = partLabels(config.part_label_style)
  const selectMode = config.answer_mode === 'select_matching'
  const parsed = (() => {
    if (statements.length === 1 && !value.startsWith('{')) return [value]
    try {
      const object = JSON.parse(value || '{}') as { answers?: unknown }
      return Array.isArray(object.answers) ? object.answers.map(String) : []
    } catch {
      return []
    }
  })()
  const update = (index: number, nextValue: string) => {
    if (statements.length === 1) {
      onChange(nextValue)
      return
    }
    const next = Array.from({ length: statements.length }, (_, itemIndex) => (
      selectMode ? (parsed[itemIndex] === 'true' ? 'true' : 'false') : (parsed[itemIndex] ?? '')
    ))
    next[index] = nextValue
    onChange(JSON.stringify({ answers: next }))
  }
  const confirmNone = () => {
    if (statements.length === 1) onChange('false')
    else onChange(JSON.stringify({ answers: statements.map(() => 'false') }))
  }
  const explicitlyNone = value !== ''
    && parsed.length === statements.length
    && parsed.every(answer => answer === 'false')

  return (
    <div className="flex flex-col gap-3">
      {config.prompt && <RichText text={config.prompt} className="text-sm text-muted-foreground" blocks />}
      {selectMode && (
        <p className="text-sm text-muted-foreground">
          เลือกข้อความที่{config.select_target === 'wrong' ? 'ไม่ถูกต้อง' : 'ถูกต้อง'}
        </p>
      )}
      {statements.map((statement, index) => {
        const promptId = `practice-tf-prompt-${question.question_id}-${index}`
        return (
        <fieldset key={statement.id} aria-labelledby={promptId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <div id={promptId} className="flex items-start gap-2 text-sm">
            <span className="font-medium text-muted-foreground">{labels[index] ?? index + 1}.</span>
            <RichText text={statement.text} blocks />
          </div>
          {selectMode ? (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span id={`${promptId}-select`} className="order-2">เลือกข้อนี้</span>
              <input
                className="order-1"
                type="checkbox"
                checked={parsed[index] === 'true'}
                disabled={disabled}
                onChange={event => update(index, event.target.checked ? 'true' : 'false')}
                aria-labelledby={`${promptId} ${promptId}-select`}
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['true', 'false'] as const).map(option => {
                const optionId = `${promptId}-${option}`
                return (
                <label
                  key={option}
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    parsed[index] === option ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name={`practice-tf-${question.question_id}-${index}`}
                    checked={parsed[index] === option}
                    disabled={disabled}
                    onChange={() => update(index, option)}
                    aria-labelledby={`${promptId} ${optionId}`}
                  />
                  <span id={optionId}>{option === 'true' ? 'ถูก' : 'ผิด'}</span>
                </label>
                )
              })}
            </div>
          )}
        </fieldset>
        )
      })}
      {selectMode && (
        <Button
          type="button"
          variant={explicitlyNone ? 'secondary' : 'outline'}
          className="min-h-11 self-start"
          disabled={disabled}
          aria-pressed={explicitlyNone}
          onClick={confirmNone}
        >
          ไม่มีข้อความที่{config.select_target === 'wrong' ? 'ไม่ถูกต้อง' : 'ถูกต้อง'}
        </Button>
      )}
    </div>
  )
}

function FillBlankInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const config = (question.questions.extra_data ?? { blanks: [] }) as SafeFillBlankConfig
  const parts = splitFillBlankHtml(question.questions.question_text)
  const numbers = extractBlankNumbers(question.questions.question_text)
  const values = stringArray(value)
  const update = (index: number, nextValue: string) => {
    const next = Array.from({ length: config.blanks.length }, (_, itemIndex) => values[itemIndex] ?? '')
    next[index] = nextValue
    onChange(JSON.stringify(next))
  }
  const control = (index: number) => {
    const blank = config.blanks[index]
    if (!blank) return null
    return blank.type === 'dropdown' ? (
      <NativeSelect
        value={values[index] ?? ''}
        disabled={disabled}
        onChange={event => update(index, event.target.value)}
        className="mx-1 inline-block min-h-11 w-40 max-w-full min-w-0 border-b-2 border-primary bg-primary/10"
        aria-label={`คำตอบช่อง ${numbers[index] ?? index + 1}`}
      >
        <option value="">เลือกคำตอบ</option>
        {(blank.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
      </NativeSelect>
    ) : (
      <Input
        value={values[index] ?? ''}
        disabled={disabled}
        onChange={event => update(index, event.target.value)}
        className="mx-1 inline-block min-h-11 w-32 border-b-2 border-primary bg-primary/10"
        placeholder={`ช่อง ${numbers[index] ?? index + 1}`}
        aria-label={`คำตอบช่อง ${numbers[index] ?? index + 1}`}
      />
    )
  }

  if (parts.length <= 1) {
    return (
      <div className="flex flex-col gap-3">
        <RichText text={question.questions.question_text} blocks />
        {config.blanks.map((blank, index) => (
          <label key={blank.id} className="flex max-w-sm flex-col gap-1 text-sm font-medium">
            คำตอบช่อง {index + 1}
            {control(index)}
          </label>
        ))}
      </div>
    )
  }
  const inlineCount = Math.min(config.blanks.length, parts.length - 1)
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm leading-loose">
        {parts.map((part, index) => (
          <span key={index}>
            <RichText text={part} />
            {index < parts.length - 1 && index < config.blanks.length ? control(index) : null}
          </span>
        ))}
      </div>
      {config.blanks.slice(inlineCount).map((blank, offset) => {
        const index = inlineCount + offset
        return (
          <label key={blank.id} className="flex max-w-sm flex-col gap-1 text-sm font-medium">
            คำตอบช่อง {numbers[index] ?? index + 1}
            {control(index)}
          </label>
        )
      })}
    </div>
  )
}

function OrderingInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const config = (question.questions.extra_data ?? { items: [] }) as SafeOrderingConfig
  const items = orderedItems(config.items, value)
  return (
    <OrderingDragList
      items={items}
      answered={stringArray(value).length === config.items.length}
      disabled={disabled}
      onReorder={ids => onChange(JSON.stringify(ids))}
      onConfirm={() => onChange(JSON.stringify(items.map(item => item.id)))}
    />
  )
}

function CompositeInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const config = (question.questions.extra_data ?? { parts: [] }) as SafeCompositeConfig
  const answers = stringArray(value)
  const labels = partLabels(config.part_label_style)
  const update = (index: number, nextValue: string) => {
    const next = Array.from({ length: config.parts.length }, (_, itemIndex) => answers[itemIndex] ?? '')
    next[index] = nextValue
    onChange(JSON.stringify(next))
  }
  return (
    <div className="flex flex-col gap-4">
      {config.parts.map((part, index) => {
        const promptId = `practice-composite-prompt-${question.question_id}-${index}`
        const fillSplit = part.type === 'fill_blank' ? splitAnswerBlankHtml(part.text) : null
        const blank = part.type === 'fill_blank' ? part.blanks?.[0] : undefined
        const fillControl = part.type === 'fill_blank' && blank
          ? blank.type === 'dropdown'
            ? (
              <NativeSelect
                value={answers[index] ?? ''}
                disabled={disabled}
                onChange={event => update(index, event.target.value)}
                className="min-h-11 max-w-sm"
                aria-label={`ข้อย่อย ${labels[index] ?? index + 1} เลือกคำตอบ`}
              >
                <option value="">เลือกคำตอบ</option>
                {(blank.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
              </NativeSelect>
            )
            : (
              <Input
                value={answers[index] ?? ''}
                disabled={disabled}
                onChange={event => update(index, event.target.value)}
                className="min-h-11 max-w-sm"
                placeholder="พิมพ์คำตอบ"
                aria-label={`ข้อย่อย ${labels[index] ?? index + 1} พิมพ์คำตอบ`}
              />
            )
          : null

        return (
          <section
            key={part.id}
            aria-labelledby={promptId}
            className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
          >
            {part.type === 'fill_blank' ? (
              <div id={promptId} className="flex flex-wrap items-center gap-2 text-sm leading-loose">
                <span className="text-xs font-semibold text-muted-foreground">{labels[index] ?? index + 1}.</span>
                {fillSplit ? (
                  <>
                    {fillSplit[0] && <RichText text={fillSplit[0]} className="[&_p]:inline" />}
                    {fillControl}
                    {fillSplit[1] && <RichText text={fillSplit[1]} className="[&_p]:inline" />}
                  </>
                ) : (
                  <>
                    <RichText text={part.text} className="[&_p]:inline" />
                    {fillControl}
                  </>
                )}
              </div>
            ) : (
              <div id={promptId} className="flex items-start gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{labels[index] ?? index + 1}.</span>
                <RichText text={part.text} className="text-sm" blocks />
              </div>
            )}
            <QuestionImages urls={part.image_urls} label="รูปประกอบข้อย่อย" />
            {part.type === 'true_false' && part.choices?.length ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  เลือกข้อความที่{part.select_target === 'wrong' ? 'ไม่ถูกต้อง' : 'ถูกต้อง'}
                </p>
                {(() => {
                  const ticks = stringArray(answers[index] ?? '')
                  const explicitlyNone = Boolean(answers[index])
                    && ticks.length === part.choices.length
                    && ticks.every(answer => answer === 'false')
                  return <>
                  {part.choices.map((choice, choiceIndex) => {
                    const choiceId = `${promptId}-choice-${choiceIndex}`
                    return (
                      <label key={choice.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={ticks[choiceIndex] === 'true'}
                          disabled={disabled}
                          aria-labelledby={`${promptId} ${choiceId}`}
                          onChange={event => {
                            const next = Array.from({ length: part.choices?.length ?? 0 }, (_, tickIndex) => (
                              ticks[tickIndex] === 'true' ? 'true' : 'false'
                            ))
                            next[choiceIndex] = event.target.checked ? 'true' : 'false'
                            update(index, JSON.stringify(next))
                          }}
                        />
                        <span id={choiceId}><RichText text={choice.text} /></span>
                      </label>
                    )
                  })}
                  <Button
                    type="button"
                    variant={explicitlyNone ? 'secondary' : 'outline'}
                    className="min-h-11 self-start"
                    disabled={disabled}
                    aria-pressed={explicitlyNone}
                    onClick={() => update(index, JSON.stringify(part.choices?.map(() => 'false') ?? []))}
                  >
                    ไม่มีข้อความที่{part.select_target === 'wrong' ? 'ไม่ถูกต้อง' : 'ถูกต้อง'}
                  </Button>
                  </>
                })()}
              </div>
            ) : part.type === 'true_false' ? (
              <div className="grid grid-cols-2 gap-2">
                {(['true', 'false'] as const).map(option => {
                  const optionId = `${promptId}-${option}`
                  return (
                    <label key={option} className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${answers[index] === option ? 'border-primary bg-primary/10' : 'border-border'}`}>
                      <input type="radio" name={`practice-comp-${part.id}`} checked={answers[index] === option} disabled={disabled} onChange={() => update(index, option)} aria-labelledby={`${promptId} ${optionId}`} />
                      <span id={optionId}>{option === 'true' ? 'ถูก' : 'ผิด'}</span>
                    </label>
                  )
                })}
              </div>
            ) : part.type === 'mcq' ? (
              <div className="flex flex-col gap-1.5">
                {(part.options ?? []).map((option, optionIndex) => {
                  const encoded = `MCQ:${optionIndex}`
                  const optionId = `${promptId}-option-${optionIndex}`
                  return (
                    <label key={optionIndex} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${answers[index] === encoded ? 'border-primary bg-primary/10' : 'border-border'}`}>
                      <input type="radio" name={`practice-comp-${part.id}`} checked={answers[index] === encoded} disabled={disabled} onChange={() => update(index, encoded)} aria-labelledby={`${promptId} ${optionId}`} />
                      <span id={optionId}><RichText text={option.text} /></span>
                    </label>
                  )
                })}
              </div>
            ) : part.type === 'ordering' ? (
              <OrderingDragList
                items={orderedItems(part.items ?? [], answers[index] ?? '')}
                answered={stringArray(answers[index] ?? '').length === (part.items?.length ?? 0)}
                disabled={disabled}
                onReorder={ids => update(index, JSON.stringify(ids))}
                onConfirm={() => update(index, JSON.stringify((part.items ?? []).map(item => item.id)))}
              />
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function ClassifyInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const config = (question.questions.extra_data ?? { columns: [], rows: [] }) as SafeClassifyConfig
  const labels = partLabels(config.row_label_style)
  const stored = numberGrid(value)
  const grid = config.rows.map((_, rowIndex) => config.columns.map((_, columnIndex) => (
    stored[rowIndex]?.[columnIndex] ?? CLASSIFY_UNSET
  )))
  const choose = (row: number, column: number, option: number) => {
    const next = grid.map(values => [...values])
    next[row][column] = option
    onChange(JSON.stringify(next))
  }
  return (
    <div className="flex flex-col gap-3">
      {config.rows.map((row, rowIndex) => {
        const rowPromptId = `practice-classify-row-${question.question_id}-${row.id}`
        return (
        <section key={row.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <div id={rowPromptId} className="flex items-start gap-2">
            <span className="text-xs font-bold text-muted-foreground">{labels[rowIndex] ?? rowIndex + 1}.</span>
            <RichText text={row.text} className="text-sm font-medium" blocks />
          </div>
          <QuestionImages urls={row.image_urls} label="รูปประกอบรายการ" />
          <div className="grid gap-3 md:grid-cols-2">
            {config.columns.map((column, columnIndex) => {
              const columnTitleId = `${rowPromptId}-column-${column.id}`
              return (
              <fieldset key={column.id} aria-labelledby={`${rowPromptId} ${columnTitleId}`} className="flex flex-col gap-1.5">
                <legend id={columnTitleId} className="text-xs font-medium text-muted-foreground">{column.title}</legend>
                {column.options.map((option, optionIndex) => (
                  <label key={optionIndex} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${grid[rowIndex][columnIndex] === optionIndex ? 'border-primary bg-primary/10' : 'border-border'}`}>
                    <input
                      type="radio"
                      name={`practice-classify-${row.id}-${column.id}`}
                      checked={grid[rowIndex][columnIndex] === optionIndex}
                      disabled={disabled}
                      onChange={() => choose(rowIndex, columnIndex, optionIndex)}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
              )
            })}
          </div>
        </section>
        )
      })}
    </div>
  )
}

function ImageLabelAnswerInput({ question, value, onChange, disabled }: PracticeAnswerInputProps) {
  const config = (question.questions.extra_data ?? { image_url: '', answer_mode: 'typed', markers: [] }) as SafeImageLabelConfig
  const stored = stringArray(value)
  const answers = config.markers.map((_, index) => stored[index] ?? '')
  return (
    <ImageLabelInput
      imageUrl={config.image_url}
      mode={normalizeImageLabelMode(config.answer_mode)}
      markers={config.markers}
      bank={config.bank}
      value={answers}
      disabled={disabled}
      heading={<RichText text={question.questions.question_text} className="[&_p]:inline" />}
      onChange={next => onChange(JSON.stringify(next))}
    />
  )
}

export function PracticeAnswerInput(props: PracticeAnswerInputProps) {
  switch (props.question.questions.question_type) {
    case 'written': return <WrittenInput {...props} />
    case 'mcq': return <McqInput {...props} />
    case 'matching': return <MatchingInput {...props} />
    case 'true_false': return <TrueFalseInput {...props} />
    case 'fill_blank': return <FillBlankInput {...props} />
    case 'ordering': return <OrderingInput {...props} />
    case 'composite': return <CompositeInput {...props} />
    case 'classify': return <ClassifyInput {...props} />
    case 'image_label': return <ImageLabelAnswerInput {...props} />
    default: return <p className="text-sm text-destructive">โจทย์ชนิดนี้ยังไม่รองรับในคลังฝึก</p>
  }
}

export { QuestionImages }

'use client'

import { ArrowLeft, ArrowRight, Check, CircleAlert, Pencil, TriangleAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RichText } from '@/components/ui/rich-text'
import { McqForm } from '@/components/questions/mcq-form'
import { EssayForm } from '@/components/questions/essay-form'
import { RandomNumericForm } from '@/components/questions/random-numeric'
import { TYPE_LABEL } from '@/lib/question-display'
import { applyFormPayload, changeType, type DraftEntry, type ImportableType } from '@/lib/docx-import/to-question'
import type { DraftWarning } from '@/lib/docx-import'

/** Only the three a Word worksheet can produce; the rest are authored in the app. */
const IMPORTABLE_TYPES: { value: ImportableType; hint: string }[] = [
  { value: 'mcq', hint: 'มีตัวเลือก ระบบตรวจให้' },
  { value: 'written', hint: 'ตอบเป็นตัวเลข ระบบตรวจให้' },
  { value: 'essay', hint: 'ครูตรวจเอง' },
]

type Presets = React.ComponentProps<typeof RandomNumericForm>['presets']

interface Props {
  entry: DraftEntry
  /** Composed by the parent so the picture warnings track the teacher's edits. */
  warnings: DraftWarning[]
  /** Why this โจทย์ cannot be imported yet, if anything. */
  error: string | null
  allTags: string[]
  presets: Presets
  /** Only one โจทย์ is open at a time — an authoring form is a heavy thing to
   *  mount, and fifteen of them at once is a page nobody can use. */
  editing: boolean
  canMoveImageBack: boolean
  canMoveImageForward: boolean
  onChange: (next: DraftEntry) => void
  onStartEdit: () => void
  onCloseEdit: () => void
  onMoveImage: (url: string, direction: -1 | 1) => void
}

export function DraftQuestionCard({
  entry, warnings, error, allTags, presets, editing,
  canMoveImageBack, canMoveImageForward,
  onChange, onStartEdit, onCloseEdit, onMoveImage,
}: Props) {
  const { question } = entry

  /** Marks (or unmarks) one option correct, the same toggle the ปรนัย form has. */
  const toggleCorrect = (index: number) => onChange({
    ...entry,
    question: {
      ...question,
      mcq_options: (question.mcq_options ?? []).map((option, at) =>
        at === index ? { ...option, is_correct: !option.is_correct } : option
      ),
    },
  })

  const draft = {
    submitLabel: 'ตกลง',
    onSubmit: (payload: Parameters<typeof applyFormPayload>[1]) => {
      onChange(applyFormPayload(entry, payload))
      onCloseEdit()
    },
    onCancel: onCloseEdit,
  }

  return (
    <Card padding="md" className={entry.include ? undefined : 'opacity-60'}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={entry.include}
          onChange={event => onChange({ ...entry, include: event.target.checked })}
          className="mt-1 size-4 accent-primary"
          aria-label={`นำเข้าข้อ ${entry.number}`}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">ข้อ {entry.number}</span>
            <Badge variant="secondary">{TYPE_LABEL[question.question_type]}</Badge>
            {entry.reviewed && (
              <Badge variant="outline" className="gap-1 text-success">
                <Check aria-hidden /> ตรวจแล้ว
              </Badge>
            )}
            {error && entry.include && (
              <Badge variant="destructive" className="gap-1">
                <CircleAlert aria-hidden /> {error}
              </Badge>
            )}
            {!editing && (
              <div className="ml-auto">
                <Button type="button" variant="outline" size="sm" onClick={onStartEdit}>
                  <Pencil aria-hidden /> แก้ไข
                </Button>
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <ul className="space-y-1">
              {warnings.map(warning => (
                <li key={warning.code} className="flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{warning.message}</span>
                </li>
              ))}
            </ul>
          )}

          {editing ? (
            <div className="space-y-4">
              <fieldset className="space-y-2 rounded-lg bg-muted p-3">
                <legend className="sr-only">ชนิดโจทย์</legend>
                <p className="text-xs font-medium text-foreground">ข้อนี้เป็นโจทย์แบบไหน</p>
                <div className="flex flex-wrap gap-2">
                  {IMPORTABLE_TYPES.map(type => (
                    <Button
                      key={type.value}
                      type="button"
                      size="sm"
                      variant={question.question_type === type.value ? 'default' : 'outline'}
                      onClick={() => onChange(changeType(entry, type.value))}
                      aria-pressed={question.question_type === type.value}
                    >
                      {TYPE_LABEL[type.value]}
                      <span className="text-xs opacity-70">· {type.hint}</span>
                    </Button>
                  ))}
                </div>
              </fieldset>

              {/* Keyed on the type so switching rebuilds the form from the
                  โจทย์ as it now is, rather than keeping the old type's state. */}
              <div key={question.question_type}>
                {question.question_type === 'mcq' && (
                  <McqForm allTags={allTags} presets={presets} question={question} draft={draft} />
                )}
                {question.question_type === 'written' && (
                  <RandomNumericForm allTags={allTags} presets={presets} question={question} draft={draft} />
                )}
                {question.question_type === 'essay' && (
                  <EssayForm allTags={allTags} question={question} draft={draft} />
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-foreground">
                <RichText text={question.question_text} />
              </div>

              {question.image_urls.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {question.image_urls.map(url => (
                    <div key={url} className="space-y-1">
                      <div className="flex size-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`รูปในข้อ ${entry.number}`} className="size-full object-contain" />
                      </div>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button" variant="ghost" size="sm"
                          disabled={!canMoveImageBack}
                          onClick={() => onMoveImage(url, -1)}
                          aria-label="ย้ายรูปไปข้อก่อนหน้า"
                        >
                          <ArrowLeft aria-hidden />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="sm"
                          onClick={() => onChange({
                            ...entry,
                            question: { ...question, image_urls: question.image_urls.filter(u => u !== url) },
                          })}
                          aria-label="เอารูปออก"
                        >
                          <X aria-hidden />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="sm"
                          disabled={!canMoveImageForward}
                          onClick={() => onMoveImage(url, 1)}
                          aria-label="ย้ายรูปไปข้อถัดไป"
                        >
                          <ArrowRight aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {question.question_type === 'mcq' && (question.mcq_options?.length ?? 0) > 0 && (
                <fieldset className="space-y-1">
                  {/* Ticking the answer is the one edit a whole worksheet needs
                      over and over — a file where the teacher marked no colours
                      needs it on every ข้อ — so it stays one click here instead
                      of costing a trip through the full form. Same toggle the
                      ปรนัย form uses, including allowing more than one. */}
                  <legend className="mb-1 text-xs font-medium text-muted-foreground">
                    ข้อที่ถูก — ติ๊กได้เลยโดยไม่ต้องเปิดฟอร์ม
                  </legend>
                  {(question.mcq_options ?? []).map((option, index) => (
                    <label
                      key={index}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={option.is_correct}
                        onChange={() => toggleCorrect(index)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <span className="w-5 shrink-0 text-muted-foreground">{index + 1})</span>
                      <span className={option.is_correct ? 'font-medium text-success' : 'text-foreground'}>
                        <RichText text={option.text} />
                        {option.is_correct && <Check className="ml-1 inline size-3.5" aria-hidden />}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {(question.answer_parts?.length ?? 0) > 0 && (
                <ol className="space-y-1 border-l-2 border-border pl-3">
                  {(question.answer_parts ?? []).map(part => (
                    <li key={part.id} className="text-sm text-foreground">
                      <RichText text={part.sub_text} />
                      {part.formula
                        ? <span className="ml-2 text-xs text-muted-foreground">เฉลย {part.formula} {part.unit}</span>
                        : <span className="ml-2 text-xs text-warning">ยังไม่มีเฉลย</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

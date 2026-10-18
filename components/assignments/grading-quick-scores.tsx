'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { DEFAULT_GRADING_QUICK_SCORES, gradingQuickScore, gradingQuickScoresStorageKey, isGradingQuickScores, readGradingQuickScores, writeGradingQuickScores } from '@/lib/grading-quick-scores'
import { useGradingDisclosure } from './use-grading-disclosure'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface GradingQuickScoresContextValue {
  percentages: readonly number[]
  ready: boolean
  update: (percentages: number[]) => void
}
const GradingQuickScoresContext = createContext<GradingQuickScoresContextValue | null>(null)

/** Preferences are scoped to this assignment/viewer; score drafts stay in the
 * batch provider and are never persisted by this component. */
export function GradingQuickScoresProvider({ assignmentId, viewerId, children }: {
  assignmentId: string
  viewerId?: string
  children: ReactNode
}) {
  const key = gradingQuickScoresStorageKey(assignmentId, viewerId)
  const [stored, setStored] = useState<{ key: string; percentages: readonly number[] } | null>(null)
  useEffect(() => {
    let percentages: readonly number[] = DEFAULT_GRADING_QUICK_SCORES
    try { percentages = readGradingQuickScores(window.localStorage, key) } catch { /* Storage can be disabled by the browser. */ }
    setStored({ key, percentages })
  }, [key])
  const update = useCallback((percentages: number[]) => {
    if (!isGradingQuickScores(percentages)) return
    const next = [...percentages]
    setStored({ key, percentages: next })
    try { writeGradingQuickScores(window.localStorage, key, next) } catch { /* The current page can still use its in-memory preferences. */ }
  }, [key])
  const ready = stored?.key === key
  const percentages = ready ? stored.percentages : DEFAULT_GRADING_QUICK_SCORES
  const value = useMemo(() => ({ percentages, ready, update }), [percentages, ready, update])
  return <GradingQuickScoresContext.Provider value={value}>{children}</GradingQuickScoresContext.Provider>
}

export function GradingQuickScoreSettings() {
  const context = useContext(GradingQuickScoresContext)
  const { open, setOpen, root } = useGradingDisclosure()
  const [fields, setFields] = useState(() => DEFAULT_GRADING_QUICK_SCORES.map(String))
  const id = useId()
  const percentages = context?.percentages ?? DEFAULT_GRADING_QUICK_SCORES
  useEffect(() => { setFields(percentages.map(String)) }, [percentages])
  if (!context) return null
  const values = fields.map(value => value.trim() === '' ? NaN : Number(value))
  const valid = isGradingQuickScores(values)
  const invalidMessage = 'กรอกเปอร์เซ็นต์ 0–100 ให้ครบทั้ง 7 ปุ่ม'
  return <Collapsible ref={root} open={open} onOpenChange={setOpen} className="min-w-0">
    <CollapsibleTrigger render={<Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" />}>
      <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />ตั้งค่าปุ่มให้คะแนนเร็ว<ChevronDown data-icon="inline-end" aria-hidden="true" />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="flex min-w-0 flex-col gap-2 pt-2">
        <p className="text-xs text-muted-foreground">กำหนดเปอร์เซ็นต์ที่ใช้กับทุกช่องคะแนนในงานนี้</p>
        <FieldGroup className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {fields.map((value, index) => {
            const invalid = !Number.isFinite(values[index]) || values[index] < 0 || values[index] > 100
            return <Field key={index} className="min-w-0 gap-1" data-invalid={invalid} data-disabled={!context.ready}>
              <FieldLabel htmlFor={`${id}-${index}`} className="text-xs text-muted-foreground">ปุ่ม {index + 1} · %</FieldLabel>
              <Input id={`${id}-${index}`} type="number" min={0} max={100} step="any" inputMode="decimal" value={value}
                disabled={!context.ready} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
                onChange={event => {
                  const next = event.target.value
                  setFields(previous => previous.map((item, position) => position === index ? next : item))
                }}
                className="px-2 tabular-nums pointer-coarse:min-h-11" />
            </Field>
          })}
        </FieldGroup>
        {!valid && <Alert id={`${id}-error`} variant="destructive" className="py-1.5"><AlertDescription>{invalidMessage}</AlertDescription></Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!context.ready || !valid} className="pointer-coarse:min-h-11" onClick={() => context.update(values)}>ใช้ค่าชุดนี้</Button>
          <Button type="button" size="sm" variant="ghost" disabled={!context.ready} className="pointer-coarse:min-h-11" onClick={() => context.update([...DEFAULT_GRADING_QUICK_SCORES])}>คืนค่าเริ่มต้น</Button>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
}

export function GradingQuickScoreButtons({ maxScore, disabled = false, onPick, label = 'คะแนน' }: {
  maxScore: number
  disabled?: boolean
  onPick: (score: number) => void
  label?: string
}) {
  const context = useContext(GradingQuickScoresContext)
  const percentages = context?.percentages ?? DEFAULT_GRADING_QUICK_SCORES
  const blocked = disabled || context?.ready === false || !Number.isFinite(maxScore) || maxScore <= 0
  return <div className="flex w-full min-w-0 flex-wrap gap-1" role="group" aria-label={`ให้${label}ตามเปอร์เซ็นต์`}>
    {percentages.map((percentage, index) => {
      const score = gradingQuickScore(maxScore, percentage)
      const description = `${label} ${percentage}% · ${score?.toLocaleString('th-TH', { maximumFractionDigits: 6 }) ?? '—'} จาก ${maxScore.toLocaleString('th-TH', { maximumFractionDigits: 6 })}`
      return <Button key={index} type="button" size="sm" variant="outline" className="min-w-[44px] flex-1 basis-auto px-0.5 text-xs pointer-coarse:min-h-11" disabled={blocked || score === null}
        aria-label={description} title={description} onClick={() => { if (!blocked && score !== null) onPick(score) }}>
        <span className="tabular-nums">{percentage}%</span>
      </Button>
    })}
  </div>
}

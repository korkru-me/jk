'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { configureGradingParts } from '@/lib/actions/grading-review'
import type { GradingWorkspaceData } from '@/lib/grading-workspace'
import type { Question } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'

export interface GradingScoreAllocationProps {
  data: GradingWorkspaceData
  question: Question
  configure?: typeof configureGradingParts
  disabled?: boolean
}

export function GradingScoreAllocation({ data, question, configure = configureGradingParts, disabled = false }: GradingScoreAllocationProps) {
  const router = useRouter()
  const id = useId()
  const policy = data.gradingParts?.[question.id]
  const answer = data.answers.find(item => item.questionId === question.id)
  const total = data.questionMaxScores?.[question.id] ?? (answer ? answer.maxScore + (answer.voidOriginalMaxScore ?? 0) : 0)
  const [answerDraft, setAnswerDraft] = useState(String(Math.round(total * (1 - (policy?.workShare ?? 0)) * 1000000) / 1000000))
  const [workDraft, setWorkDraft] = useState(String(Math.round(total * (policy?.workShare ?? 0) * 1000000) / 1000000))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = useRef(false)
  const expectedRevision = useRef(policy?.updatedAt ?? null)
  const revision = JSON.stringify([question.id, policy?.workShare, policy?.updatedAt, total])
  useEffect(() => {
    if (!dirty.current) { setAnswerDraft(String(Math.round(total * (1 - (policy?.workShare ?? 0)) * 1000000) / 1000000)); setWorkDraft(String(Math.round(total * (policy?.workShare ?? 0) * 1000000) / 1000000)); expectedRevision.current = policy?.updatedAt ?? null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])
  if (question.question_type !== 'written' || !question.requires_work_image || data.voidedQuestionIds.includes(question.id)) return null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled || data.reviewAvailable === false) return
    const answerMaxScore = answerDraft.trim() ? Number(answerDraft) : NaN
    const workMaxScore = workDraft.trim() ? Number(workDraft) : NaN
    if (!Number.isFinite(answerMaxScore) || !Number.isFinite(workMaxScore) || answerMaxScore < 0 || workMaxScore < 0 || Math.abs(answerMaxScore + workMaxScore - total) > 0.000001) {
      setError(`คะแนนคำตอบและวิธีทำรวมกันต้องเท่ากับ ${total} คะแนน`)
      return
    }
    setError(''); setBusy(true)
    try {
      const result = await configure({ assignmentId: data.assignment.id, questionId: question.id, answerMaxScore, workMaxScore, expectedUpdatedAt: expectedRevision.current })
      if ('error' in result) { setError(result.error); return }
      dirty.current = false
      toast.success('บันทึกสัดส่วนคะแนนแล้ว')
      router.refresh()
    } catch { setError('บันทึกสัดส่วนไม่สำเร็จ ค่าที่กรอกยังอยู่ กรุณาลองใหม่') }
    finally { setBusy(false) }
  }

  function change(part: 'answer' | 'work', value: string) {
    if (!dirty.current) expectedRevision.current = policy?.updatedAt ?? null
    dirty.current = true; setError('')
    const other = value.trim() ? total - Number(value) : NaN
    if (part === 'answer') { setAnswerDraft(value); if (Number.isFinite(other) && other >= 0 && other <= total) setWorkDraft(String(Math.round(other * 1000000) / 1000000)) }
    else { setWorkDraft(value); if (Number.isFinite(other) && other >= 0 && other <= total) setAnswerDraft(String(Math.round(other * 1000000) / 1000000)) }
  }

  return <form onSubmit={submit} className="flex flex-col gap-2 border-t border-border px-3 py-2.5" aria-label="กำหนดสัดส่วนคะแนนคำตอบและวิธีทำ">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{policy ? 'สัดส่วนคะแนน' : 'ยังไม่ได้กำหนดสัดส่วนคะแนน'}{disabled && <span className="ml-2 font-normal text-muted-foreground">บันทึกคะแนนที่แก้ไขก่อนเปลี่ยนสัดส่วน</span>}</p><p className="text-xs text-muted-foreground">คะแนนเต็มรวม {total} คะแนน</p></div>
    <FieldGroup className="flex-row flex-wrap items-end gap-x-3 gap-y-2">
      {(['answer', 'work'] as const).map(part => <Field key={part} className="w-auto gap-1" data-invalid={!!error}><FieldLabel htmlFor={`${id}-${part}`} className="text-xs text-muted-foreground">{part === 'answer' ? 'คะแนนคำตอบ' : 'คะแนนวิธีทำ'}</FieldLabel><Input id={`${id}-${part}`} required type="number" step="any" min={0} max={total} value={part === 'answer' ? answerDraft : workDraft} onChange={event => change(part, event.target.value)} disabled={disabled || data.reviewAvailable === false || busy || total <= 0} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="w-20 text-center tabular-nums pointer-coarse:min-h-11" /></Field>)}
      <Button type="submit" variant="outline" disabled={disabled || data.reviewAvailable === false || busy || total <= 0} className="pointer-coarse:min-h-11">{busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{busy ? 'กำลังบันทึก' : 'บันทึกสัดส่วน'}</Button>
    </FieldGroup>
    {!policy && <p className="text-xs text-muted-foreground">กำหนดก่อนตรวจวิธีทำ คะแนนเต็มของข้อนี้คงเดิม และใช้กับนักเรียนทุกคนในงานนี้</p>}
    {error && <Alert id={`${id}-error`} variant="destructive" className="py-1.5"><AlertDescription>{error}</AlertDescription></Alert>}
  </form>
}

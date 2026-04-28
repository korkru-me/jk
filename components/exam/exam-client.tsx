'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveAnswer, submitSubmission } from '@/lib/actions/submissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface AnswerRow {
  id: string
  question_id: string
  random_values: Record<string, number>
  correct_answer: string
  student_answer: string | null
  questions: {
    title: string
    question_text: string
    question_type: string
    answer_unit: string | null
    mcq_options: Array<{ text: string; is_correct: boolean }> | null
    variables: Array<{ name: string; unit: string }>
  }
}

interface Props {
  submissionId: string
  answers: AnswerRow[]
  durationMinutes: number | null
  startedAt: string
}

export function ExamClient({ submissionId, answers, durationMinutes, startedAt }: Props) {
  const router = useRouter()
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>(
    Object.fromEntries(answers.map(a => [a.id, a.student_answer ?? '']))
  )
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  // Timer
  useEffect(() => {
    if (!durationMinutes) return
    const elapsedSeconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    const totalSeconds = durationMinutes * 60
    const remaining = Math.max(0, totalSeconds - elapsedSeconds)
    setSecondsLeft(remaining)

    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswerChange = useCallback(async (answerId: string, value: string) => {
    setLocalAnswers(prev => ({ ...prev, [answerId]: value }))
    setSaving(true)
    await saveAnswer(answerId, value)
    setSaving(false)
  }, [])

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    const result = await submitSubmission(submissionId)
    if (result?.error) {
      toast.error(result.error)
      setSubmitting(false)
      return
    }
    router.push(`/submissions/${submissionId}`)
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const current = answers[currentIndex]

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {answers.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                i === currentIndex
                  ? 'bg-blue-600 text-white'
                  : localAnswers[answers[i].id]
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-gray-400">กำลังบันทึก...</span>}
          {secondsLeft !== null && (
            <div className={`font-mono font-bold text-sm px-3 py-1 rounded-full ${
              secondsLeft < 300 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {formatTime(secondsLeft)}
            </div>
          )}
        </div>
      </div>

      {/* Question card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Badge variant="outline">ข้อ {currentIndex + 1}/{answers.length}</Badge>
        </div>

        <p className="text-gray-900 leading-relaxed whitespace-pre-line">
          {interpolateValues(current.questions.question_text, current.random_values, current.questions.variables)}
        </p>

        {/* Given values */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium mb-2">ค่าที่กำหนด</p>
          <div className="flex flex-wrap gap-2">
            {current.questions.variables
              .filter((v: any) => v.type !== 'reference')
              .map((v: any) => (
                <span key={v.name} className="text-sm font-mono bg-white border border-gray-200 rounded px-2 py-0.5">
                  {v.name} = {current.random_values[v.name]} {v.unit}
                </span>
              ))}
          </div>
        </div>

        {/* Answer input */}
        {current.questions.question_type === 'mcq' && current.questions.mcq_options ? (
          <div className="space-y-2">
            {current.questions.mcq_options.map((opt, i) => (
              <label key={i} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                localAnswers[current.id] === opt.text
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name={`answer-${current.id}`}
                  value={opt.text}
                  checked={localAnswers[current.id] === opt.text}
                  onChange={() => handleAnswerChange(current.id, opt.text)}
                />
                <span className="text-sm">{opt.text}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">คำตอบ</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="any"
                placeholder="ใส่คำตอบ..."
                value={localAnswers[current.id]}
                onChange={e => handleAnswerChange(current.id, e.target.value)}
                className="max-w-[200px]"
              />
              {current.questions.answer_unit && (
                <span className="text-sm text-gray-600">{current.questions.answer_unit}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          ← ก่อนหน้า
        </Button>

        {currentIndex < answers.length - 1 ? (
          <Button onClick={() => setCurrentIndex(i => i + 1)}>
            ถัดไป →
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งคำตอบ'}
          </Button>
        )}
      </div>
    </div>
  )
}

function interpolateValues(text: string, values: Record<string, number>, variables: Array<{ name: string; unit: string }>) {
  let result = text
  for (const v of variables) {
    const val = values[v.name]
    if (val !== undefined) {
      result = result.replace(new RegExp(`\\{${v.name}\\}`, 'g'), `${val}`)
    }
  }
  return result
}

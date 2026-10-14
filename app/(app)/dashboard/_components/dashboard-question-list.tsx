'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { QuestionCard, type QuestionCardRow } from '@/components/questions/question-card'
import type { QuestionDetailWithCategory } from '@/components/questions/preview-modal'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import { EMPTY_CARD_DATA, type QuestionCardData } from '@/lib/question-card-data'

export type QuestionPreviewLoader = typeof getQuestionClientDetail

const PreviewModal = dynamic(
  () => import('@/components/questions/preview-modal').then(mod => mod.PreviewModal),
  { loading: () => <PreviewLoading /> },
)

interface Props {
  questions: QuestionCardRow[]
  cardData?: QuestionCardData
  myTeams?: { id: string; name: string }[]
  /** The local lab supplies an in-memory loader instead of reading Supabase. */
  loadPreview?: QuestionPreviewLoader
}

export function DashboardQuestionList({
  questions, cardData = EMPTY_CARD_DATA, myTeams = [], loadPreview = getQuestionClientDetail,
}: Props) {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [previewQuestion, setPreviewQuestion] = useState<QuestionDetailWithCategory | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const allTags = useMemo(() => [...new Set(questions.flatMap(q => q.tags ?? []))], [questions])

  function toggleFlag(id: string) {
    setFlaggedIds(previous => {
      const next = new Set(previous)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function openPreview(id: string) {
    if (previewLoading) return
    setPreviewLoading(true)
    try {
      const result = await loadPreview(id)
      if ('error' in result) toast.error(result.error)
      else setPreviewQuestion(result.data)
    } catch {
      toast.error('โหลดตัวอย่างโจทย์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5" data-dashboard-question-list>
      {previewLoading && <PreviewLoading />}
      {questions.map(question => (
        <QuestionCard
          key={question.id}
          question={question}
          isFlagged={flaggedIds.has(question.id)}
          onPreview={() => void openPreview(question.id)}
          onToggleFlag={() => toggleFlag(question.id)}
          myTeams={myTeams}

          detailsLoaded={!!cardData.details[question.id]}
          allTags={allTags}
          duplicateCount={cardData.duplicateCounts[question.id] ?? 0}
          subQuestionCount={cardData.subQuestionCounts[question.id]}
          sets={cardData.setMemberships[question.id]}
          hasSolution={cardData.solutionPresence[question.id]}
          returnToDashboard
        />
      ))}
      {previewQuestion && (
        <PreviewModal
          question={previewQuestion}
          isFlagged={flaggedIds.has(previewQuestion.id)}
          onClose={() => setPreviewQuestion(null)}
          onToggleFlag={() => toggleFlag(previewQuestion.id)}

        />
      )}
    </div>
  )
}

function PreviewLoading() {
  return <p role="status" className="text-sm text-muted-foreground">กำลังโหลดตัวอย่างโจทย์…</p>
}

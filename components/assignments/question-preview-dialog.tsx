'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type {
  MCQOption, MatchingPair, TrueFalseConfig, FillBlankConfig,
  OrderingConfig, FileUploadConfig, RandomQuestionConfig, CompositeConfig,
} from '@/lib/types'

interface Props {
  /** The questions to page through, in the order the teacher arranged them. */
  ids: readonly string[]
  open: boolean
  /** Which question to open on — the row the teacher clicked. */
  startIndex?: number
  onOpenChange: (open: boolean) => void
}

/**
 * มุมมองนักเรียน for one question at a time, with ข้อก่อนหน้า/ข้อถัดไป across a
 * whole picked list.
 *
 * The pickers and score lists carry only the lightweight bank summary (see
 * `BankQuestion`), which has no options, variables or extra_data in it, so the
 * full row is fetched per question as it is opened — RLS still decides whether
 * this teacher may read it.
 */
export function QuestionPreviewDialog({ ids, open, startIndex = 0, onOpenChange }: Props) {
  const [index, setIndex] = useState(startIndex)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getQuestionClientDetail>> | null>(null)

  useEffect(() => {
    if (!open) return
    setIndex(startIndex)
  }, [open, startIndex])

  // Keyed on the id rather than on `ids`, so a caller that maps its list
  // inline — a new array every render — does not restart the fetch forever.
  const currentId = ids[index]

  useEffect(() => {
    if (!open || !currentId) return
    let active = true
    setDetail(null)
    getQuestionClientDetail(currentId).then(result => { if (active) setDetail(result) })
    return () => { active = false }
  }, [open, currentId])

  const question = detail && 'data' in detail ? detail.data : null
  const extraData = question?.extra_data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>มุมมองนักเรียน</DialogTitle>
          <DialogDescription>
            ตัวอย่างข้อ {ids.length === 0 ? 0 : index + 1} จาก {ids.length} · คำตอบในตัวอย่างจะไม่ถูกบันทึก
          </DialogDescription>
        </DialogHeader>
        {!detail && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
        {detail && 'error' in detail && <p className="py-12 text-center text-sm text-destructive">{detail.error}</p>}
        {question && (
          <QuestionPreviewContent
            key={question.id}
            questionText={question.question_text}
            variables={question.variables ?? []}
            answerParts={question.question_type === 'written' ? (question.answer_parts ?? []) : []}
            isRandom={question.is_random}
            questionType={question.question_type}
            mcqOptions={question.question_type === 'mcq' ? ((question.mcq_options ?? []) as MCQOption[]) : []}
            matchingPairs={question.question_type === 'matching' ? ((question.mcq_options ?? []) as unknown as MatchingPair[]) : []}
            imageUrls={question.image_urls ?? []}
            trueFalseConfig={question.question_type === 'true_false' ? (extraData as TrueFalseConfig) : undefined}
            fillBlankConfig={question.question_type === 'fill_blank' ? (extraData as FillBlankConfig) : undefined}
            orderingConfig={question.question_type === 'ordering' ? (extraData as OrderingConfig) : undefined}
            compositeConfig={question.question_type === 'composite' ? (extraData as CompositeConfig) : undefined}
            partLabelStyle={(extraData as RandomQuestionConfig)?.part_label_style}
            attachmentUrls={question.question_type === 'file_upload' ? ((extraData as FileUploadConfig)?.attachment_urls ?? []) : []}
          />
        )}
        <DialogFooter>
          <Button variant="outline" disabled={index === 0} onClick={() => setIndex(current => current - 1)}>
            <ArrowLeft aria-hidden="true" /> ข้อก่อนหน้า
          </Button>
          <Button disabled={index >= ids.length - 1} onClick={() => setIndex(current => current + 1)}>
            ข้อถัดไป <ArrowRight aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

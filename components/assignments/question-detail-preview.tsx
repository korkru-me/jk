'use client'

import { QuestionPreviewContent } from '@/components/questions/question-preview'
import type { QuestionPreviewDetail } from '@/lib/actions/question-previews'
import type {
  MCQOption, MatchingPair, TrueFalseConfig, FillBlankConfig, OrderingConfig,
  FileUploadConfig, RandomQuestionConfig, CompositeConfig,
} from '@/lib/types'

export function QuestionDetailPreview({ question }: { question: QuestionPreviewDetail }) {
  const extraData = question.extra_data
  return (
    <QuestionPreviewContent
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
  )
}

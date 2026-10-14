'use client'

import { useCallback, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Question } from '@/lib/types'
import type { QuestionSetSection } from '@/lib/question-set-sections'
import { QuestionCard } from '@/components/questions/question-card'
import { QuestionListPreviewDialog } from '@/components/assignments/question-list-preview-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { subQuestionCount } from '@/lib/question-parts'

export function AssignmentQuestionCards({ questions, sections, showSections }: {
  questions: Question[]
  sections: QuestionSetSection[]
  showSections: boolean
}) {
  const [open, setOpen] = useState(true)
  const [previewIds, setPreviewIds] = useState<string[]>([])
  // The teacher route already authorized assignment provenance, including
  // private co-teacher questions. Never replace it with a broader bank read.
  const loadQuestions = useCallback(async (ids: readonly string[]) => ({
    data: questions.filter(question => ids.includes(question.id)),
  }), [questions])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="flex min-w-0 flex-col gap-2" aria-labelledby="assignment-questions-heading" data-assignment-question-cards>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="assignment-questions-heading" className="font-semibold">โจทย์ <span className="text-xs font-normal text-muted-foreground">{questions.length} ข้อ</span></h2>
          <CollapsibleTrigger className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {open ? 'พับรายการ' : 'แสดงรายการ'}{open ? <ChevronUp /> : <ChevronDown />}
          </CollapsibleTrigger>
        </div>
        {!showSections && sections.length > 0 && <p className="text-xs text-muted-foreground">ชื่อแฟ้มย่อยในหน้านี้แสดงเฉพาะครู</p>}
        <CollapsibleContent>
          <div className="flex min-w-0 flex-col gap-2">
            {questions.length === 0 ? <Card padding="md" edge="dashed" className="text-center text-sm text-muted-foreground">ยังไม่มีโจทย์ที่เปิดดูได้</Card> : questions.map((question, index) => (
              <QuestionCard key={question.id} question={{ ...question, question_categories: null }}
                readOnly position={index + 1} isFlagged={false} onToggleFlag={() => {}}
                onPreview={() => setPreviewIds([question.id])} myTeams={[]} allTags={[]} duplicateCount={0}
                subQuestionCount={subQuestionCount(question) ?? undefined}
                sectionTitles={sections.length > 0 ? sections.filter(section => section.question_ids.includes(question.id)).map(section => section.title) : undefined}
              />
            ))}
          </div>
        </CollapsibleContent>
      </section>
      <QuestionListPreviewDialog ids={previewIds} open={previewIds.length > 0} onOpenChange={open => { if (!open) setPreviewIds([]) }} loadQuestions={loadQuestions} title="ตัวอย่างโจทย์ในงานนี้" />
    </Collapsible>
  )
}

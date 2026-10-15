'use client'

import { useCallback, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getPracticeQuestionPreviewDetails } from '@/app/(app)/practice/_actions'
import { QuestionCard, type QuestionCardRow } from '@/components/questions/question-card'
import { QuestionListPreviewDialog } from '@/components/assignments/question-list-preview-dialog'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export function PracticeManagementQuestions({ libraryId, questions, error, previewLoader }: {
  libraryId: string
  questions: QuestionCardRow[]
  error?: string | null
  previewLoader?: typeof getPracticeQuestionPreviewDetails
}) {
  const [open, setOpen] = useState(true)
  const [previewIds, setPreviewIds] = useState<string[]>([])
  const loadQuestions = useCallback((ids: readonly string[]) => (previewLoader ?? getPracticeQuestionPreviewDetails)(libraryId, ids), [libraryId, previewLoader])
  return <Collapsible open={open} onOpenChange={setOpen}>
    <section aria-labelledby="practice-questions-heading" className="flex min-w-0 flex-col gap-2 [&_.text-muted-foreground]:text-foreground/75 [&_.text-warning]:text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))] [&_.text-success]:text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))] [&_.text-destructive]:text-[color-mix(in_oklab,var(--destructive)_60%,var(--foreground))] [&_.text-tint-4]:text-[color-mix(in_oklab,var(--tint-4)_60%,var(--foreground))]" data-practice-management-questions>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="practice-questions-heading" className="font-semibold">โจทย์ <span className="text-xs font-normal text-muted-foreground">{questions.length} ข้อ</span></h2>
        <CollapsibleTrigger className={buttonVariants({ variant: 'ghost', size: 'sm' })}>{open ? 'พับรายการ' : 'แสดงรายการ'}{open ? <ChevronUp /> : <ChevronDown />}</CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="flex min-w-0 flex-col gap-2">
          {error ? <Card padding="md"><p role="alert" className="text-sm text-destructive">{error} กรุณาโหลดหน้าใหม่</p></Card>
            : questions.length === 0 ? <Card padding="md" edge="dashed" className="text-sm text-muted-foreground">ยังไม่มีโจทย์ เลือกโจทย์ในหน้าตั้งค่าคลังฝึก</Card>
              : questions.map((question, index) => <QuestionCard key={question.id} question={question} readOnly position={index + 1}
                isFlagged={false} onToggleFlag={() => {}} onPreview={() => setPreviewIds([question.id])} myTeams={[]} allTags={[]} duplicateCount={0} />)}
        </div>
      </CollapsibleContent>
    </section>
    <QuestionListPreviewDialog ids={previewIds} open={previewIds.length > 0} onOpenChange={open => { if (!open) setPreviewIds([]) }} loadQuestions={loadQuestions} title="ตัวอย่างโจทย์ในคลังฝึก" />
  </Collapsible>
}

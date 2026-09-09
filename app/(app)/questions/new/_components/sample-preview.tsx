'use client'

import { useState } from 'react'
import { Eye, Sparkles } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import type { SampleQuestion } from '../_data/sample-questions'

/**
 * "ดูตัวอย่าง" on a question-type card — opens the same student-facing renderer
 * the authoring forms preview with, so what a teacher sees here is what a
 * student would get, not a mock-up of it.
 *
 * The banner says the question is a written example that is not in the bank.
 * Nothing here is the teacher's own data, and an example left unlabelled would
 * read as if it were.
 */
export function SamplePreview({
  typeTitle, sample,
}: {
  typeTitle: string
  sample: SampleQuestion
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <IconButton
        size="sm"
        label={`ดูตัวอย่างโจทย์${typeTitle}`}
        onClick={() => setOpen(true)}
        className="opacity-70 hover:opacity-100"
      >
        <Eye />
      </IconButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> มุมมองนักเรียน · {typeTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              ตัวอย่างโจทย์ประเภท{typeTitle} แสดงด้วยหน้าตาเดียวกับที่นักเรียนเห็นตอนทำข้อสอบ
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              ตัวอย่างที่ระบบเตรียมไว้ — <span className="font-semibold">{sample.title}</span>
              {' '}ไม่ได้บันทึกอยู่ในคลังโจทย์ของคุณ
            </span>
          </div>

          {open && <QuestionPreviewContent {...sample.props} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

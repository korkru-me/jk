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
 * A type can carry more than one sample: จับคู่ shows both of its answering
 * layouts, one after the other, because which one a question uses is a choice
 * the teacher makes and the two are hard to picture from the description alone.
 *
 * The banner says these are written examples that are not in the bank. Nothing
 * here is the teacher's own data, and an example left unlabelled would read as
 * if it were.
 */
export function SamplePreview({
  typeTitle, samples,
}: {
  typeTitle: string
  samples: SampleQuestion[]
}) {
  const [open, setOpen] = useState(false)
  const many = samples.length > 1

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
              {many
                ? `ตัวอย่างที่ระบบเตรียมไว้ ${samples.length} แบบ — ไม่ได้บันทึกอยู่ในคลังโจทย์ของคุณ`
                : <>ตัวอย่างที่ระบบเตรียมไว้ — <span className="font-semibold">{samples[0]?.title}</span> ไม่ได้บันทึกอยู่ในคลังโจทย์ของคุณ</>}
            </span>
          </div>

          {open && samples.map((sample, i) => (
            <section key={i} className={i > 0 ? 'border-t border-border pt-5' : undefined}>
              {many && (
                <p className="mb-3 text-sm font-semibold">
                  แบบที่ {i + 1}
                  {sample.variantLabel && (
                    <span className="text-primary"> · {sample.variantLabel}</span>
                  )}
                  <span className="ml-2 font-normal text-muted-foreground">{sample.title}</span>
                </p>
              )}
              <QuestionPreviewContent {...sample.props} />
            </section>
          ))}
        </DialogContent>
      </Dialog>
    </>
  )
}

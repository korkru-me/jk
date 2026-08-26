'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { QuestionPreviewProps } from './question-preview-content'

export type { QuestionPreviewProps }

/**
 * Exported under the name the body used to have, so the assignment preview
 * dialog and the question bank's preview modal pick up the same lazy boundary
 * without changing their imports.
 *
 * The preview body carries the whole student-facing renderer — the maths
 * evaluator (mathjs) and the formula renderer (katex), ~895 KB between them.
 * Every question authoring route mounts this trigger, so a static import put
 * both in the first load of pages where a teacher may never open the preview
 * at all. The body already rendered only while the dialog was open; loading it
 * on the same condition simply stops paying for it up front.
 */
export const QuestionPreviewContent = dynamic(
  () => import('./question-preview-content').then(m => m.QuestionPreviewContent),
  {
    loading: () => (
      <p className="py-10 text-center text-sm text-muted-foreground">
        กำลังเตรียมตัวอย่าง...
      </p>
    ),
  }
)


// ── QuestionPreview ──────────────────────────────────────────────────────────────
// Button + dialog wrapper around QuestionPreviewContent, used inline in the
// question create/edit forms.

export function QuestionPreview(props: QuestionPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
      >
        👁 ดูตัวอย่าง
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>👁</span>
              <span>มุมมองนักเรียน</span>
              {props.isRandom && <span className="text-xs font-normal text-primary">· ค่าถูกสุ่มแล้ว</span>}
            </DialogTitle>
          </DialogHeader>

          {open && <QuestionPreviewContent {...props} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

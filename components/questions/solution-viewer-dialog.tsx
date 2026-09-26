'use client'

import { useEffect, useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { QuestionSolution } from '@/lib/question-solution'
import { useSolutionLoader } from './solution-loader'

type PartsModule = typeof import('./solution-parts')

let partsModule: Promise<PartsModule> | null = null

/**
 * The dialog's body, fetched once per page and shared by every card. A fetch
 * that fails is forgotten, so the next press tries again instead of failing
 * for the rest of the visit.
 */
function loadSolutionParts(): Promise<PartsModule> {
  partsModule ??= import('./solution-parts').catch(error => {
    partsModule = null
    throw error
  })
  return partsModule
}

/** Starts that fetch on hover or focus, so it is usually done by the click. */
export function preloadSolutionParts() {
  loadSolutionParts().catch(() => {
    // Nothing to tell anyone yet; the press that needs it will say so.
  })
}

type ViewState =
  | { solution: QuestionSolution; Parts: PartsModule['SolutionParts'] }
  | { error: string }

interface Props {
  questionId: string
  /** The card's title, shown while the เฉลย itself is still on its way. */
  questionTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * One โจทย์'s เฉลย on its own — typed text, pictures, board pictures and PDF
 * links, as the teacher attached them under "เฉลยวิธีทำ".
 *
 * The frame opens on the press; the เฉลย and the code that draws it arrive
 * together behind the skeleton. Loading the code by hand rather than through
 * `next/dynamic` means a dropped connection is a message in this dialog, not
 * an error thrown into the คลัง page around it.
 *
 * Read afresh each time it opens rather than kept from last time: the same
 * teacher may have just fixed the เฉลย in another tab, and the read is small.
 */
export function SolutionViewerDialog({ questionId, questionTitle, open, onOpenChange }: Props) {
  const load = useSolutionLoader()
  const [view, setView] = useState<ViewState | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setView(null)
    Promise.all([load(questionId), loadSolutionParts()])
      .then(([result, parts]) => {
        if (!active) return
        setView('error' in result ? result : { solution: result.data, Parts: parts.SolutionParts })
      })
      .catch(() => {
        if (active) setView({ error: 'โหลดเฉลยไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วกด “ดูเฉลย” อีกครั้ง' })
      })
    return () => { active = false }
  }, [open, questionId, load])

  const loaded = view && 'solution' in view ? view : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Only the เฉลย scrolls: a long one — a whole page of working, or a
          โจทย์หลายขั้นตอน step by step — keeps which โจทย์ it belongs to and
          the way out on screen the whole time. */}
      <DialogContent initialFocus={bodyRef} className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        {/* pr-8 keeps the title clear of the dialog's own close button. */}
        <DialogHeader className="flex-row items-start gap-3 pr-8">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Lightbulb className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <DialogTitle>เฉลยวิธีทำ</DialogTitle>
            <DialogDescription className="line-clamp-2">{loaded?.solution.title ?? questionTitle}</DialogDescription>
          </div>
        </DialogHeader>

        {/* -mx-4 px-4 puts the scrollbar on the dialog's edge, not in the text.
            Focused on open, so the arrow keys scroll the เฉลย straight away —
            the dialog itself no longer scrolls. */}
        <div
          ref={bodyRef}
          tabIndex={0}
          role="region"
          aria-label="เนื้อหาเฉลย"
          className="-mx-4 min-h-0 overflow-y-auto px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          {!view && (
            <div className="h-48 animate-pulse rounded-xl bg-muted" role="status" aria-label="กำลังโหลดเฉลย" />
          )}
          {view && 'error' in view && (
            <p role="alert" className="py-10 text-center text-sm text-destructive">{view.error}</p>
          )}
          {loaded && <loaded.Parts solution={loaded.solution} />}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>ปิด</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

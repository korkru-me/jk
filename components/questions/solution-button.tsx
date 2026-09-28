'use client'

import { useState } from 'react'
import { Lightbulb, LightbulbOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { preloadSolutionParts, SolutionViewerDialog } from './solution-viewer-dialog'

interface Props {
  questionId: string
  questionTitle: string
  /**
   * Whether the โจทย์ carries a เฉลย. Absent while that is not known — still
   * loading, or the read failed — and the button then stays off the card: a
   * greyed-out "ยังไม่แนบเฉลย" would be a claim about the โจทย์.
   */
  hasSolution?: boolean
  /** `xs` sits with the compact buttons of a teammate's card. */
  size?: 'xs' | 'sm'
  /** Whether this teacher may edit the โจทย์ — only then does the grey button
   *  point them at where a เฉลย is attached. */
  canAttach?: boolean
}

/**
 * ดูเฉลย on a คลังโจทย์ card: amber with the lightbulb of the "เฉลยวิธีทำ"
 * section it opens, or grey and inert when that section was left empty — so a
 * teacher can see down the list which โจทย์ still need a เฉลย without opening
 * any of them. The grey one says so in words as well as colour.
 */
export function SolutionButton({ questionId, questionTitle, hasSolution, size = 'sm', canAttach = true }: Props) {
  const [open, setOpen] = useState(false)
  // Kept mounted after the first press, so closing can animate out.
  const [opened, setOpened] = useState(false)

  if (hasSolution === undefined) return null

  if (!hasSolution) {
    return (
      // A disabled button takes no pointer events, so the tooltip and the
      // cursor hang on this wrapper instead.
      <span
        title={canAttach
          ? 'ข้อนี้ยังไม่ได้แนบเฉลย — แนบได้ที่ “เฉลยวิธีทำ” ในหน้าแก้ไขโจทย์'
          : 'ข้อนี้ยังไม่ได้แนบเฉลย'}
        className="inline-flex cursor-not-allowed"
      >
        {/* Dimmed less than the usual half: this label is information,
            not just a control that is off. */}
        <Button size={size} disabled className="bg-muted text-muted-foreground disabled:opacity-85">
          <LightbulbOff aria-hidden="true" /> ยังไม่แนบเฉลย
        </Button>
      </span>
    )
  }

  return (
    <>
      <Button
        size={size}
        onClick={() => { setOpened(true); setOpen(true) }}
        // The dialog's frame is already here; what draws a เฉลย (KaTeX
        // among it) is fetched on the way to the click.
        onPointerEnter={preloadSolutionParts}
        onFocus={preloadSolutionParts}
        className="bg-warning/10 text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))] hover:bg-warning/20"
      >
        <Lightbulb aria-hidden="true" /> ดูเฉลย
      </Button>
      {opened && (
        <SolutionViewerDialog
          questionId={questionId}
          questionTitle={questionTitle}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  )
}

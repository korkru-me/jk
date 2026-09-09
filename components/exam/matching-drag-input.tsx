'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { RichText } from '@/components/ui/rich-text'
import { cn } from '@/lib/utils'

export interface MatchingOption {
  /** Stable within one question; the caller decides what it means. */
  id: string
  text: string
  imageUrl?: string
}

export interface MatchingPrompt {
  text: string
  imageUrl?: string
}

export interface MatchingDragInputProps {
  prompts: MatchingPrompt[]
  /** The right-hand column, already shuffled by the caller. One per prompt. */
  options: MatchingOption[]
  /** Option id sitting in each prompt's slot, `null` when empty. Same length as `prompts`. */
  placement: (string | null)[]
  onChange: (next: (string | null)[]) => void
  disabled?: boolean
  /** Per-prompt verdict, once the answer has been checked. */
  results?: (boolean | null)[]
  /** The answer that belonged in a slot, shown beside a wrong one. */
  correctText?: (string | undefined)[]
}

/** Pointer travel that separates a tap from the start of a drag. */
const DRAG_THRESHOLD = 6

type DropTarget = number | 'bank' | null

/**
 * Matching answered by dragging: the choices sit in a bank underneath, and a
 * student drags each one into the slot beside the prompt it belongs to.
 *
 * Built on pointer events rather than HTML5 drag-and-drop, which does not fire
 * on touch at all — an iPad is a first-class way to sit an exam here, so a
 * drag that only works with a mouse would lock those students out. Chips carry
 * `touch-action: none` so a drag does not scroll the page out from under the
 * finger.
 *
 * **Dragging is never the only way to answer.** Tapping a chip picks it up and
 * tapping a slot drops it there, which is what keyboard users get (the chips
 * and slots are real buttons), what a student on a long question gets when the
 * bank and the slot cannot be on screen at once, and what anyone gets when a
 * drag misbehaves on hardware nobody here has tested. A drag-only answer input
 * on a graded exam is a way to lose a student's marks to their device.
 *
 * The component owns no answer state — the caller keeps `placement` and decides
 * what it serialises to, so the stored answer format of each surface (right_text
 * per prompt on the exam, option ids in the authoring preview) is unchanged.
 */
export function MatchingDragInput({
  prompts, options, placement, onChange,
  disabled = false, results, correctText,
}: MatchingDragInputProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<DropTarget>(null)
  const startRef = useRef<
    { id: string; from: number | null; x: number; y: number; moved: boolean } | null
  >(null)
  const moveRef = useRef<
    { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void } | null
  >(null)

  // A drag left running past unmount would keep listening on window forever.
  useEffect(() => () => {
    const handlers = moveRef.current
    if (!handlers) return
    window.removeEventListener('pointermove', handlers.move)
    window.removeEventListener('pointerup', handlers.up)
    window.removeEventListener('pointercancel', handlers.cancel)
  }, [])

  const byId = new Map(options.map(o => [o.id, o]))
  const placed = new Set(placement.filter((v): v is string => v !== null))
  const bank = options.filter(o => !placed.has(o.id))
  const checked = !!results

  function slotOf(id: string): number | null {
    const i = placement.indexOf(id)
    return i === -1 ? null : i
  }

  /** Move `id` into prompt `to`. Whatever sat there goes back where `id` came from. */
  function place(id: string, from: number | null, to: number) {
    if (from === to) return
    const next = [...placement]
    const displaced = next[to] ?? null
    if (from !== null) next[from] = displaced
    next[to] = id
    setSelected(null)
    onChange(next)
  }

  function clearSlot(index: number) {
    if (placement[index] == null) return
    const next = [...placement]
    next[index] = null
    setSelected(null)
    onChange(next)
  }

  /**
   * What is under the pointer. Read from the document rather than tracked
   * rectangles so it stays correct when the page scrolls or reflows mid-drag.
   */
  function targetAt(x: number, y: number): DropTarget {
    if (typeof document === 'undefined') return null
    const el = document.elementFromPoint(x, y)
    const slot = el?.closest('[data-match-slot]')
    if (slot) return Number(slot.getAttribute('data-match-slot'))
    if (el?.closest('[data-match-bank]')) return 'bank'
    return null
  }

  /**
   * A drag is tracked on `window`, not on the chip.
   *
   * Pointer capture would be the tidier route, but it is the single point of
   * failure in this whole interaction: where it is unavailable or throws, the
   * chip stops receiving moves the instant the pointer leaves it and the drag
   * dies halfway with no way to finish. Window listeners hold the gesture no
   * matter what the pointer travels over, and are torn down on the same event
   * that ends it.
   */
  function endGesture() {
    const handlers = moveRef.current
    if (handlers) {
      window.removeEventListener('pointermove', handlers.move)
      window.removeEventListener('pointerup', handlers.up)
      window.removeEventListener('pointercancel', handlers.cancel)
      moveRef.current = null
    }
    startRef.current = null
    setDrag(null)
    setHover(null)
  }

  function onChipPointerDown(e: React.PointerEvent<HTMLElement>, id: string, from: number | null) {
    if (disabled || e.button > 0) return
    endGesture()
    startRef.current = { id, from, x: e.clientX, y: e.clientY, moved: false }

    const move = (ev: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      if (!start.moved) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return
        start.moved = true
        setSelected(null)
      }
      setDrag({ id: start.id, x: ev.clientX, y: ev.clientY })
      setHover(targetAt(ev.clientX, ev.clientY))
    }
    const up = (ev: PointerEvent) => {
      const start = startRef.current
      const target = start?.moved ? targetAt(ev.clientX, ev.clientY) : null
      endGesture()
      if (!start) return
      // Never moved — treat it as a tap and let the chip carry the selection.
      if (!start.moved) {
        setSelected(prev => (prev === start.id ? null : start.id))
        return
      }
      if (target === 'bank') {
        if (start.from !== null) clearSlot(start.from)
      } else if (typeof target === 'number') {
        place(start.id, start.from, target)
      }
      // Dropped on nothing: leave the answer exactly as it was.
    }

    moveRef.current = { move, up, cancel: endGesture }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', endGesture)
  }

  /** Tapping a slot drops the chip a student is carrying, or empties the slot. */
  function onSlotActivate(index: number) {
    if (disabled) return
    if (selected) {
      place(selected, slotOf(selected), index)
      return
    }
    const current = placement[index]
    if (current) setSelected(current)
  }

  function chip(option: MatchingOption, from: number | null) {
    const isSelected = selected === option.id
    const isDragging = drag?.id === option.id
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-pressed={isSelected}
        aria-label={`ตัวเลือก ${option.text}`}
        onPointerDown={e => onChipPointerDown(e, option.id, from)}
        className={cn(
          'h-auto max-w-full touch-none select-none whitespace-normal px-3 py-1.5 text-left',
          !disabled && 'cursor-grab active:cursor-grabbing',
          isSelected && 'border-primary bg-primary/10 text-primary',
          isDragging && 'opacity-40'
        )}
      >
        {option.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.imageUrl} alt="" loading="lazy" decoding="async"
            className="h-7 w-7 shrink-0 rounded object-contain" />
        )}
        <span className="min-w-0">{option.text}</span>
      </Button>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">จับคู่แต่ละข้อกับคำตอบที่ถูกต้อง:</p>
      <p className="text-xs text-muted-foreground">
        {/* Not "ช่องด้านขวา": the slot sits under its prompt on a phone. */}
        ลากตัวเลือกจากด้านล่างไปวางในช่องของแต่ละข้อ หรือแตะตัวเลือกหนึ่งครั้งแล้วแตะช่องที่ต้องการก็ได้
      </p>

      <div className="space-y-2">
        {prompts.map((prompt, i) => {
          const current = placement[i] ? byId.get(placement[i]!) : undefined
          const verdict = results?.[i]
          const isHovered = hover === i && drag !== null
          return (
            <div
              key={i}
              className={cn(
                'flex flex-col gap-2 rounded-xl border p-2.5 transition-colors sm:flex-row sm:items-center sm:gap-3',
                verdict === true ? 'border-success/40 bg-success/10'
                  : verdict === false ? 'border-destructive/40 bg-destructive/10'
                  : 'border-border'
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">{i + 1}.</span>
                {prompt.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prompt.imageUrl} alt="" loading="lazy" decoding="async"
                    className="h-12 w-12 shrink-0 rounded border border-border object-contain" />
                )}
                <span className="min-w-0 flex-1 text-sm">
                  <RichText text={prompt.text} />
                </span>
              </div>

              {/* The drop target. `data-match-slot` is what a drag looks for
                  under the pointer, so it lives on the wrapper — the chip
                  inside must not swallow the hit. */}
              <div
                data-match-slot={i}
                className={cn(
                  'flex min-h-11 w-full shrink-0 items-center gap-1.5 rounded-lg border-2 border-dashed p-1 transition-colors sm:w-56',
                  isHovered ? 'border-primary bg-primary/10'
                    : current ? 'border-transparent'
                    : 'border-border'
                )}
              >
                {current ? (
                  <>
                    <span className="min-w-0 flex-1">{chip(current, i)}</span>
                    {!disabled && (
                      <IconButton
                        size="xs"
                        label={`เอาคำตอบของข้อ ${i + 1} ออก`}
                        onClick={() => clearSlot(i)}
                      >
                        <X />
                      </IconButton>
                    )}
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-label={`ช่องคำตอบของข้อ ${i + 1} ยังว่าง`}
                    onClick={() => onSlotActivate(i)}
                    className="h-auto w-full justify-start py-1.5 text-xs font-normal text-muted-foreground"
                  >
                    {selected ? 'แตะเพื่อวางตรงนี้' : 'ลากคำตอบมาวาง'}
                  </Button>
                )}
              </div>

              {verdict === false && correctText?.[i] && (
                <span className="shrink-0 text-xs text-destructive">
                  เฉลย: <strong>{correctText[i]}</strong>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Once the answer is locked the bank is only noise — an empty one told a
          student to "drag back here to change it" on a question they can no
          longer change. */}
      {(!disabled || bank.length > 0) && (
        <div
          data-match-bank
          className={cn(
            'rounded-xl border-2 border-dashed p-3 transition-colors',
            hover === 'bank' && drag !== null ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'
          )}
        >
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {bank.length > 0 ? 'ตัวเลือก'
              : 'วางครบทุกช่องแล้ว — ลากกลับมาที่นี่เพื่อแก้'}
          </p>
          <div className="flex flex-wrap gap-2">
            {bank.map(option => <span key={option.id}>{chip(option, null)}</span>)}
          </div>
        </div>
      )}

      {/* The chip under the finger. Portalled to <body> because a dialog
          centres itself with a transform, and a fixed element inside one is
          positioned against that transform instead of the viewport. */}
      {drag && typeof document !== 'undefined' && createPortal(
        <Card
          radius="sm"
          padding="none"
          elevation="lg"
          className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 border-primary px-3 py-1.5 text-sm"
          style={{ left: drag.x, top: drag.y }}
        >
          {byId.get(drag.id)?.text}
        </Card>,
        document.body
      )}

      {!checked && placement.length > 0 && placement.every(v => v !== null) && (
        <p className="text-xs text-success">✓ จับคู่ครบแล้ว</p>
      )}
    </div>
  )
}

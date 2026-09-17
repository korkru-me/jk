'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import type { ImageLabelAnswerMode } from '@/lib/types'

export interface ImageLabelPoint { x: number; y: number }

export interface ImageLabelInputMarker {
  id: string
  /** Percentages of the picture, 0–100. */
  point: ImageLabelPoint
  /** Reserved for the teacher-placed box of a later version; ignored for now. */
  box?: ImageLabelPoint
  /** Only in 'dropdown', and only when this point has a list of its own. */
  options?: string[]
}

export interface ImageLabelInputProps {
  imageUrl: string
  mode: ImageLabelAnswerMode
  markers: ImageLabelInputMarker[]
  /** The words to drag from, or the fallback list a dropdown point offers. */
  bank?: string[]
  /** One answer per marker, in the markers' own order. */
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** Per-point verdict, once the answer has been checked. */
  results?: (boolean | null)[]
  /** What belonged in a box, shown beside a wrong one. */
  correctText?: (string | undefined)[]
}

/** Pointer travel that separates a tap from the start of a drag. */
const DRAG_THRESHOLD = 6

/** A word that has been picked up, and where it came from (`null` = the bank). */
interface Held { word: string; from: number | null }

/**
 * ติดป้ายบนรูป — one diagram with answer boxes pointing into it.
 *
 * The boxes sit in the margins either side of the picture and each carries a
 * leader line to the place it is asking about, which is the layout of the paper
 * worksheet this type comes from. Which margin a box goes in is decided by
 * which half of the picture its point is in, and the boxes down each margin are
 * ordered by height, so the lines run roughly parallel and do not cross.
 *
 * **Every box is numbered, and so is every point.** The numbers are not
 * decoration for the line: they are what makes the pairing readable when two
 * points sit close together, and they are the whole basis of the phone layout,
 * where the boxes leave the margins and become a numbered list underneath.
 *
 * Lines are drawn in an SVG overlay measured from real element positions rather
 * than assumed heights, because a box holding a long Thai word is taller than
 * its neighbour and a line drawn to the wrong place is worse than no line. The
 * measurement re-runs on resize, on every answer, and when the picture finishes
 * loading — until then the image has no height and every line collapses onto
 * the top edge.
 *
 * Dragging is built on pointer events rather than HTML5 drag-and-drop, which
 * does not fire on touch at all, and **dragging is never the only way to
 * answer**: tapping a chip picks it up and tapping a box drops it there. That is
 * what a student gets when the bank and the box cannot be on screen at once,
 * and what anyone gets when a drag misbehaves on hardware nobody here has
 * tested. One `held` word covers both routes, so a tap and a drag cannot end up
 * disagreeing about what is in the student's hand.
 *
 * The component owns no answer state. The caller keeps `value` — one string per
 * marker in marker order — which is exactly what the 'IMGL:' branch in
 * lib/assignment-attempt.ts grades against.
 */
export function ImageLabelInput({
  imageUrl, mode, markers, bank = [], value, onChange,
  disabled = false, results, correctText,
}: ImageLabelInputProps) {
  const [held, setHeld] = useState<Held | null>(null)
  const [drag, setDrag] = useState<{ word: string; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [, setMeasureTick] = useState(0)

  const frameRef = useRef<HTMLDivElement | null>(null)
  const boxRefs = useRef<Array<HTMLElement | null>>([])
  const dotRefs = useRef<Array<HTMLElement | null>>([])
  const startRef = useRef<{ word: string; from: number | null; x: number; y: number; moved: boolean } | null>(null)
  const moveRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null)
  const suppressClick = useRef(false)

  const checked = !!results
  const locked = disabled || checked

  // Anything that can move an element has to force a re-measure: a resize, a
  // font swap, an answer that makes a box taller, or the picture arriving.
  const remeasure = useCallback(() => setMeasureTick(tick => tick + 1), [])
  useLayoutEffect(remeasure, [remeasure, value, markers.length, results])
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(remeasure)
    observer.observe(frame)
    for (const el of [...boxRefs.current, ...dotRefs.current]) if (el) observer.observe(el)
    window.addEventListener('resize', remeasure)
    return () => { observer.disconnect(); window.removeEventListener('resize', remeasure) }
  }, [remeasure, markers.length])

  // A drag left running past unmount would keep listening on window forever.
  useEffect(() => () => {
    const handlers = moveRef.current
    if (!handlers) return
    window.removeEventListener('pointermove', handlers.move)
    window.removeEventListener('pointerup', handlers.up)
    window.removeEventListener('pointercancel', handlers.up)
  }, [])

  // Which margin each box goes in, and in what order down it. Sorting by height
  // is what keeps the leader lines from crossing each other.
  const placed = markers.map((marker, index) => ({
    marker, index, side: marker.point.x < 50 ? 'left' as const : 'right' as const,
  }))
  const column = (side: 'left' | 'right') =>
    placed.filter(entry => entry.side === side).sort((a, b) => a.marker.point.y - b.marker.point.y)

  /**
   * Which bank chips are still on the table.
   *
   * Counted rather than matched by text: a bank may legitimately offer the same
   * word twice, and "has this word been used" would retire both chips the
   * moment one of them is placed.
   */
  const remaining = new Map<string, number>()
  for (const answer of value) if (answer) remaining.set(answer, (remaining.get(answer) ?? 0) + 1)
  const bankChips = bank.map((word, chipIndex) => {
    const left = remaining.get(word) ?? 0
    if (left > 0) { remaining.set(word, left - 1); return { word, chipIndex, used: true } }
    return { word, chipIndex, used: false }
  })

  /** Writes one or two boxes at once, so moving a word never leaves a copy behind. */
  function write(changes: Array<[number, string]>) {
    const next = [...value]
    while (next.length < markers.length) next.push('')
    for (const [index, answer] of changes) next[index] = answer
    onChange(next)
  }

  function place(word: string, from: number | null, to: number) {
    setHeld(null)
    if (from === to) return
    write(from === null ? [[to, word]] : [[from, ''], [to, word]])
  }

  /** What is under the pointer, read from the document so it stays right mid-scroll. */
  function slotAt(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)
    const slot = element?.closest('[data-image-label-slot]')
    if (!slot) return null
    const index = Number((slot as HTMLElement).dataset.imageLabelSlot)
    return Number.isInteger(index) ? index : null
  }

  /**
   * Pointer handling covers dragging and nothing else.
   *
   * Picking up and putting down is left entirely to `click`, which a browser
   * fires for a mouse tap and for Enter or Space on a focused button alike.
   * Handling the tap here instead would work for a finger and leave a keyboard
   * user with no way to answer at all, since Enter never produces a
   * `pointerdown`. A drag that actually moved sets `suppressClick`, because the
   * browser still delivers a click after it.
   */
  function startDrag(event: React.PointerEvent, word: string | null, from: number | null) {
    suppressClick.current = false
    if (locked || mode !== 'drag' || !word) return
    startRef.current = { word, from, x: event.clientX, y: event.clientY, moved: false }

    const move = (moveEvent: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      if (!start.moved && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < DRAG_THRESHOLD) return
      start.moved = true
      setDrag({ word: start.word, x: moveEvent.clientX, y: moveEvent.clientY })
      setHover(slotAt(moveEvent.clientX, moveEvent.clientY))
    }

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      moveRef.current = null
      const start = startRef.current
      startRef.current = null
      setDrag(null)
      setHover(null)
      if (!start?.moved) return

      suppressClick.current = true
      const target = slotAt(upEvent.clientX, upEvent.clientY)
      if (target !== null) place(start.word, start.from, target)
      // Dragged off the page: a word taken out of a box goes back to the bank,
      // a word taken out of the bank simply stays there.
      else if (start.from !== null) { setHeld(null); write([[start.from, '']]) }
      else setHeld(null)
    }

    moveRef.current = { move, up }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /** True once, right after a drag, to swallow the click the browser owes it. */
  function draggedJustNow(): boolean {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }

  // Both read `held` straight from this render rather than through a setState
  // updater. An updater that also writes the answer is a side effect inside a
  // function React is free to call twice, or to discard — and it silently did
  // nothing at all when two taps landed in one tick.
  function tapSlot(index: number) {
    if (draggedJustNow() || locked) return
    if (held) { place(held.word, held.from, index); return }
    const answer = value[index] ?? ''
    setHeld(answer ? { word: answer, from: index } : null)
  }

  function tapChip(word: string) {
    if (draggedJustNow() || locked) return
    setHeld(held && held.word === word && held.from === null ? null : { word, from: null })
  }

  /** The anchor a leader line starts from: the inner edge of a box, mid-height. */
  function boxAnchor(index: number, side: 'left' | 'right'): ImageLabelPoint | null {
    const frame = frameRef.current
    const element = boxRefs.current[index]
    if (!frame || !element) return null
    const box = element.getBoundingClientRect()
    const base = frame.getBoundingClientRect()
    return {
      x: (side === 'left' ? box.right : box.left) - base.left,
      y: box.top + box.height / 2 - base.top,
    }
  }

  function dotAnchor(index: number): ImageLabelPoint | null {
    const frame = frameRef.current
    const element = dotRefs.current[index]
    if (!frame || !element) return null
    const dot = element.getBoundingClientRect()
    const base = frame.getBoundingClientRect()
    return { x: dot.left + dot.width / 2 - base.left, y: dot.top + dot.height / 2 - base.top }
  }

  if (markers.length === 0 || !imageUrl) {
    return <p className="text-sm text-warning">โจทย์นี้ยังไม่มีรูปหรือจุดให้ตอบ — แจ้งครูผู้สอน</p>
  }

  const renderBox = (entry: { marker: ImageLabelInputMarker; index: number; side: 'left' | 'right' }) => {
    const { marker, index } = entry
    const verdict = results?.[index]
    const answer = value[index] ?? ''
    const choices = marker.options && marker.options.length > 0 ? marker.options : bank
    const inHand = held?.from === index

    return (
      <div key={marker.id || index} className="flex flex-col gap-1">
        <div
          ref={el => { boxRefs.current[index] = el }}
          className={cn(
            'flex min-h-11 items-center gap-2 rounded-lg border-2 bg-card px-2 py-1.5',
            verdict === true && 'border-success bg-success/10',
            verdict === false && 'border-destructive bg-destructive/10',
            verdict == null && (hover === index || inHand ? 'border-tint-1 bg-tint-1/10' : 'border-border'),
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {index + 1}
          </span>

          {mode === 'typed' && (
            <Input
              type="text"
              value={answer}
              disabled={locked}
              onChange={event => write([[index, event.target.value]])}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              placeholder={`จุดที่ ${index + 1}`}
              aria-label={`คำตอบของจุดที่ ${index + 1}`}
            />
          )}

          {mode === 'dropdown' && (
            <NativeSelect
              value={answer}
              disabled={locked}
              onChange={event => write([[index, event.target.value]])}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none"
              aria-label={`คำตอบของจุดที่ ${index + 1}`}
            >
              <option value="">เลือกคำตอบ</option>
              {choices.map((choice, choiceIndex) => (
                <option key={choiceIndex} value={choice}>{choice}</option>
              ))}
            </NativeSelect>
          )}

          {mode === 'drag' && (
            <>
              {/* A real button, not a styled div: this is the keyboard route and
                  the only thing in the accessibility tree that says the box can
                  be answered at all. `data-image-label-slot` lives here too, so
                  what a drag finds under the pointer is the same element. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-image-label-slot={index}
                disabled={locked}
                aria-label={answer
                  ? `จุดที่ ${index + 1} — ตอบว่า ${answer}`
                  : `จุดที่ ${index + 1} — ยังไม่มีคำตอบ`}
                onPointerDown={event => startDrag(event, answer || null, answer ? index : null)}
                onClick={() => tapSlot(index)}
                className={cn(
                  'h-auto min-w-0 flex-1 justify-start whitespace-normal px-1 py-1.5 text-left text-sm font-normal',
                  !locked && 'touch-none select-none',
                  !locked && answer && 'cursor-grab active:cursor-grabbing',
                  !answer && 'text-muted-foreground',
                  inHand && 'opacity-40',
                )}
              >
                {answer || (held ? 'แตะเพื่อวางที่นี่' : 'ลากคำมาวาง')}
              </Button>
              {answer && !locked && (
                <IconButton
                  size="xs"
                  label={`เอาคำตอบของจุดที่ ${index + 1} ออก`}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => { setHeld(null); write([[index, '']]) }}
                  className="shrink-0"
                >
                  <X size={14} />
                </IconButton>
              )}
            </>
          )}
        </div>

        {verdict === false && correctText?.[index] && (
          <span className="pl-8 text-xs text-muted-foreground">เฉลย: {correctText[index]}</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div ref={frameRef} className="relative">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)] gap-3">
          <div className="flex flex-col justify-around gap-2">{column('left').map(renderBox)}</div>

          <div className="relative self-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="รูปประกอบโจทย์"
              onLoad={remeasure}
              className="block w-full rounded-lg border object-contain"
            />
            {markers.map((marker, index) => (
              <span
                key={marker.id || index}
                ref={el => { dotRefs.current[index] = el }}
                style={{ left: `${marker.point.x}%`, top: `${marker.point.y}%` }}
                className={cn(
                  'absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold text-primary-foreground',
                  results?.[index] === true && 'bg-success',
                  results?.[index] === false && 'bg-destructive',
                  results?.[index] == null && 'bg-tint-1',
                )}
              >
                {index + 1}
              </span>
            ))}
          </div>

          <div className="flex flex-col justify-around gap-2">{column('right').map(renderBox)}</div>
        </div>

        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {placed.map(({ marker, index, side }) => {
            const from = boxAnchor(index, side)
            const to = dotAnchor(index)
            if (!from || !to) return null
            return (
              <line
                key={marker.id || index}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                // Stronger than the border token a box is drawn with: the line
                // is what says which box asks about which place, so it has to
                // be followable, not merely present.
                className="stroke-muted-foreground/60" strokeWidth={1.5}
              />
            )
          })}
        </svg>
      </div>

      {mode === 'drag' && (
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            คลังคำ — ลากไปวางในช่อง หรือแตะคำแล้วแตะช่อง
          </p>
          <div className="flex flex-wrap gap-2">
            {bankChips.map(({ word, chipIndex, used }) => {
              const inHand = !used && held?.word === word && held.from === null
              return (
                <Button
                  key={chipIndex}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked || used}
                  aria-pressed={inHand}
                  aria-label={`คำตอบ ${word}`}
                  onPointerDown={event => startDrag(event, word, null)}
                  onClick={() => tapChip(word)}
                  className={cn(
                    'h-auto min-h-11 max-w-full touch-none select-none whitespace-normal px-3 py-2 text-left',
                    !locked && !used && 'cursor-grab active:cursor-grabbing',
                    used && 'opacity-30',
                    inHand && 'border-primary bg-primary/10 text-primary',
                  )}
                >
                  {word}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {drag && (
        <span
          style={{ left: drag.x, top: drag.y }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-tint-1 bg-card px-3 py-2 text-sm shadow-lg"
        >
          {drag.word}
        </span>
      )}
    </div>
  )
}

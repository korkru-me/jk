'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RichText } from '@/components/ui/rich-text'
import { cn } from '@/lib/utils'
import type { MatchingOption, MatchingPrompt } from './matching-drag-input'

export interface MatchingLineInputProps {
  prompts: MatchingPrompt[]
  /** The right-hand column, already shuffled by the caller. One per prompt. */
  options: MatchingOption[]
  /** Option id joined to each prompt, `null` when that prompt has no line yet. */
  placement: (string | null)[]
  onChange: (next: (string | null)[]) => void
  disabled?: boolean
  results?: (boolean | null)[]
  correctText?: (string | undefined)[]
}

/** Pointer travel that separates a tap from the start of a drag. */
const DRAG_THRESHOLD = 6

interface Point { x: number; y: number }

/**
 * Matching answered by drawing a line between two columns.
 *
 * The same answer as the drag-into-slots layout — one option per prompt — with
 * the same `placement` contract, so a question can be switched between the two
 * without touching what is stored or how it is graded.
 *
 * Lines are drawn in an SVG overlay measured from the real element positions
 * rather than assumed row heights, because a prompt with an image or two lines
 * of text is taller than its neighbour and a line drawn to the wrong place is
 * worse than no line at all. The measurement re-runs on resize and on every
 * change to the connections.
 *
 * Only the connector dots carry `touch-action: none`, so dragging from a dot
 * never scrolls while the rest of the question scrolls normally — a student
 * must be able to scroll past a question they are working on. Tapping a prompt
 * and then an option connects them without any dragging at all, which is also
 * the keyboard route.
 */
export function MatchingLineInput({
  prompts, options, placement, onChange,
  disabled = false, results, correctText,
}: MatchingLineInputProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ from: number; at: Point } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [, setMeasureTick] = useState(0)

  const boxRef = useRef<HTMLDivElement | null>(null)
  const leftRefs = useRef<Array<HTMLElement | null>>([])
  const rightRefs = useRef<Array<HTMLElement | null>>([])
  const startRef = useRef<{ from: number; x: number; y: number; moved: boolean } | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const optionIndex = new Map(options.map((o, i) => [o.id, i]))
  const checked = !!results

  // Element positions decide where every line is drawn, so anything that can
  // move them has to force a re-measure: a resize, a font swap, an image
  // finishing loading, or simply another connection changing the layout.
  const remeasure = useCallback(() => setMeasureTick(t => t + 1), [])
  useLayoutEffect(remeasure, [remeasure, placement, prompts.length, options.length])
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(remeasure)
    observer.observe(box)
    for (const el of [...leftRefs.current, ...rightRefs.current]) if (el) observer.observe(el)
    window.addEventListener('resize', remeasure)
    return () => { observer.disconnect(); window.removeEventListener('resize', remeasure) }
  }, [remeasure, prompts.length, options.length])

  useEffect(() => () => { cleanupRef.current?.() }, [])

  /** The anchor point of a row's connector dot, in the overlay's coordinates. */
  function anchor(el: HTMLElement | null, side: 'left' | 'right'): Point | null {
    const box = boxRef.current
    if (!el || !box) return null
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return {
      x: (side === 'left' ? r.right : r.left) - b.left,
      y: r.top + r.height / 2 - b.top,
    }
  }

  function connect(from: number, to: number) {
    const next = [...placement]
    const id = options[to]?.id
    if (!id) return
    // One option belongs to one prompt: joining it here takes it off whatever
    // it was joined to before, rather than leaving two lines into one box.
    for (let i = 0; i < next.length; i++) if (next[i] === id) next[i] = null
    next[from] = id
    setSelected(null)
    onChange(next)
  }

  function disconnect(promptIndex: number) {
    if (placement[promptIndex] == null) return
    const next = [...placement]
    next[promptIndex] = null
    setSelected(null)
    onChange(next)
  }

  /** Which option row is under the pointer, read from the document. */
  function optionAt(x: number, y: number): number {
    if (typeof document === 'undefined') return -1
    const el = document.elementFromPoint(x, y)?.closest('[data-match-option]')
    return el ? Number(el.getAttribute('data-match-option')) : -1
  }

  function endGesture() {
    cleanupRef.current?.()
    cleanupRef.current = null
    startRef.current = null
    setDrag(null)
    setHover(null)
  }

  function onDotPointerDown(e: React.PointerEvent<HTMLElement>, from: number) {
    if (disabled || e.button > 0) return
    endGesture()
    startRef.current = { from, x: e.clientX, y: e.clientY, moved: false }

    const onMove = (ev: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      if (!start.moved) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return
        start.moved = true
        setSelected(null)
      }
      const box = boxRef.current
      if (!box) return
      const b = box.getBoundingClientRect()
      setDrag({ from: start.from, at: { x: ev.clientX - b.left, y: ev.clientY - b.top } })
      setHover(optionAt(ev.clientX, ev.clientY))
    }
    const onUp = (ev: PointerEvent) => {
      const start = startRef.current
      const target = start?.moved ? optionAt(ev.clientX, ev.clientY) : -1
      endGesture()
      if (!start) return
      if (!start.moved) {
        // A tap on the dot picks the prompt up (or puts it down again).
        setSelected(prev => (prev === start.from ? null : start.from))
        return
      }
      if (target >= 0) connect(start.from, target)
    }

    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', endGesture)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endGesture)
  }

  const lines = placement.map((id, i) => {
    if (id == null) return null
    const to = optionIndex.get(id)
    if (to == null) return null
    const a = anchor(leftRefs.current[i], 'left')
    const b = anchor(rightRefs.current[to], 'right')
    if (!a || !b) return null
    return { i, a, b, ok: results?.[i] }
  }).filter((v): v is { i: number; a: Point; b: Point; ok: boolean | null | undefined } => v !== null)

  const dragLine = (() => {
    if (!drag) return null
    const a = anchor(leftRefs.current[drag.from], 'left')
    return a ? { a, b: drag.at } : null
  })()

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">โยงเส้นจับคู่ให้ถูกต้อง:</p>
      <p className="text-xs text-muted-foreground">
        กดค้างที่จุดวงกลมด้านขวาของรายการฝั่งซ้าย แล้วลากไปปล่อยที่รายการฝั่งขวา
        หรือแตะจุดวงกลมฝั่งซ้ายหนึ่งครั้งแล้วแตะรายการฝั่งขวาก็ได้
      </p>

      <div ref={boxRef} className="relative grid grid-cols-2 gap-x-8 gap-y-2 sm:gap-x-16">
        {/* Under the rows so a line never covers the words it connects. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {lines.map(({ i, a, b, ok }) => (
            <line
              key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              strokeWidth={2} strokeLinecap="round"
              className={
                ok === true ? 'stroke-success'
                  : ok === false ? 'stroke-destructive'
                  : 'stroke-primary'
              }
            />
          ))}
          {dragLine && (
            <line
              x1={dragLine.a.x} y1={dragLine.a.y} x2={dragLine.b.x} y2={dragLine.b.y}
              strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4"
              className="stroke-primary"
            />
          )}
        </svg>

        <div className="col-start-1 space-y-2">
          {prompts.map((prompt, i) => {
            const verdict = results?.[i]
            const isSelected = selected === i
            const connected = placement[i] != null
            return (
              <div
                key={i}
                ref={el => { leftRefs.current[i] = el }}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl border bg-card p-2.5 transition-colors',
                  verdict === true ? 'border-success/40 bg-success/10'
                    : verdict === false ? 'border-destructive/40 bg-destructive/10'
                    : isSelected ? 'border-primary bg-primary/10'
                    : 'border-border'
                )}
              >
                <span className="shrink-0 text-xs font-medium text-muted-foreground">{i + 1}.</span>
                {prompt.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prompt.imageUrl} alt="" loading="lazy" decoding="async"
                    className="h-10 w-10 shrink-0 rounded border border-border object-contain" />
                )}
                <span className="min-w-0 flex-1 text-sm">
                  <RichText text={prompt.text} />
                </span>

                {/* Keep the visible connector small, but give a finger a 40px
                    hit area. The grid gap remains tappable and the line itself
                    is still measured from the card edge. */}
                <Button
                  variant="ghost"
                  disabled={disabled}
                  aria-label={
                    connected
                      ? `ยกเลิกเส้นของข้อ ${i + 1}`
                      : `เริ่มโยงเส้นจากข้อ ${i + 1}`
                  }
                  aria-pressed={isSelected}
                  onPointerDown={e => onDotPointerDown(e, i)}
                  onClick={event => {
                    if (connected && !drag) disconnect(i)
                    else if (event.detail === 0 && !drag) {
                      // Keyboard activation does not emit pointer events, so
                      // select the prompt here. Pointer taps are handled on
                      // pointer-up and must not be toggled a second time.
                      setSelected(previous => previous === i ? null : i)
                    }
                  }}
                  className="absolute -right-5 top-1/2 h-10 w-10 min-w-0 -translate-y-1/2 touch-none rounded-full border-0 bg-transparent p-0 hover:bg-transparent pointer-coarse:h-11 pointer-coarse:w-11"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-4 w-4 rounded-full border-2 transition-colors',
                      !disabled && 'cursor-grab',
                      verdict === true ? 'border-success bg-success'
                        : verdict === false ? 'border-destructive bg-destructive'
                        : connected || isSelected ? 'border-primary bg-primary'
                        : 'border-border bg-card'
                    )}
                  />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="col-start-2 space-y-2">
          {options.map((option, j) => {
            const takenBy = placement.indexOf(option.id)
            const verdict = takenBy >= 0 ? results?.[takenBy] : undefined
            const isHovered = hover === j && drag !== null
            return (
              <Button
                key={option.id}
                variant="outline"
                data-match-option={j}
                disabled={disabled}
                ref={el => { rightRefs.current[j] = el as HTMLElement | null }}
                aria-label={`ตัวเลือก ${option.text}`}
                onClick={() => { if (selected !== null) connect(selected, j) }}
                className={cn(
                  'relative flex h-auto min-h-10 w-full items-center justify-start gap-2 rounded-xl border p-2.5 text-left text-sm font-normal whitespace-normal transition-colors pointer-coarse:min-h-11',
                  isHovered ? 'border-primary bg-primary/10'
                    : verdict === true ? 'border-success/40 bg-success/10'
                    : verdict === false ? 'border-destructive/40 bg-destructive/10'
                    : takenBy >= 0 ? 'border-primary/40'
                    : 'border-border bg-card'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2',
                    verdict === true ? 'border-success bg-success'
                      : verdict === false ? 'border-destructive bg-destructive'
                      : takenBy >= 0 ? 'border-primary bg-primary'
                      : 'border-border bg-card'
                  )}
                />
                {option.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.imageUrl} alt="" loading="lazy" decoding="async"
                    className="ml-2 h-10 w-10 shrink-0 rounded border border-border object-contain" />
                )}
                <span className="ml-2 min-w-0 flex-1">{option.text}</span>
              </Button>
            )
          })}
        </div>
      </div>

      {checked && (
        <div className="space-y-1">
          {prompts.map((prompt, i) => (
            results?.[i] === false && correctText?.[i] ? (
              <p key={i} className="text-xs text-destructive">
                {i + 1}. {prompt.text} — เฉลย: <strong>{correctText[i]}</strong>
              </p>
            ) : null
          ))}
        </div>
      )}

      {!checked && placement.length > 0 && placement.every(v => v !== null) && (
        <p className="text-xs text-success">✓ โยงครบแล้ว</p>
      )}
    </div>
  )
}

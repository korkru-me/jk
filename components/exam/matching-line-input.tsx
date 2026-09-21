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
/** A stationary press should also pick up the card before the finger moves. */
const HOLD_TO_DRAG_MS = 180

interface Point { x: number; y: number }

/** A picked-up but not-yet-connected row, from either column. */
interface Selection { side: 'left' | 'right'; index: number }

interface GestureStart {
  source: Selection
  x: number
  y: number
  dragging: boolean
  holdTimer: ReturnType<typeof setTimeout> | null
}

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
 * Every card is a drag target in both directions. While answering, cards use
 * `touch-action: none` so iPadOS cannot turn a slightly diagonal line gesture
 * into page scrolling and cancel the pointer stream. The gaps around the cards
 * remain normal scroll areas. Tapping either column first, then the other,
 * remains the keyboard-accessible alternative — whichever row is tapped
 * second completes the pair.
 */
export function MatchingLineInput({
  prompts, options, placement, onChange,
  disabled = false, results, correctText,
}: MatchingLineInputProps) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const [drag, setDrag] = useState<{ source: Selection; at: Point } | null>(null)
  const [hover, setHover] = useState<Selection | null>(null)
  const [, setMeasureTick] = useState(0)

  const boxRef = useRef<HTMLDivElement | null>(null)
  const leftRefs = useRef<Array<HTMLElement | null>>([])
  const rightRefs = useRef<Array<HTMLElement | null>>([])
  const startRef = useRef<GestureStart | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  // Set when a pointer gesture ends as a real drag, so the click event the
  // browser fires right after (bubbling from the dot to the row) is ignored
  // instead of re-toggling the selection it just made via connect().
  const suppressClickUntilRef = useRef(0)

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

  /**
   * Tapping (or clicking) a prompt row: finish a connection started from an
   * option, pick this prompt up, put it down, or drop its line. Either
   * column can be tapped first — completing a pending selection from the
   * other side always wins over toggling this row's own selection.
   */
  function activatePrompt(i: number) {
    if (disabled) return
    if (Date.now() < suppressClickUntilRef.current) return
    if (selected?.side === 'right') { connect(i, selected.index); return }
    if (placement[i] != null) { disconnect(i); return }
    setSelected(prev => (prev?.side === 'left' && prev.index === i ? null : { side: 'left', index: i }))
  }

  /** The option-column mirror of {@link activatePrompt}. */
  function activateOption(j: number) {
    if (disabled) return
    if (Date.now() < suppressClickUntilRef.current) return
    if (selected?.side === 'left') { connect(selected.index, j); return }
    const id = options[j]?.id
    const owner = id ? placement.indexOf(id) : -1
    if (owner >= 0) { disconnect(owner); return }
    setSelected(prev => (prev?.side === 'right' && prev.index === j ? null : { side: 'right', index: j }))
  }

  /** Which option row is under the pointer, read from the document. */
  function optionAt(x: number, y: number): number {
    if (typeof document === 'undefined') return -1
    const el = document.elementFromPoint(x, y)?.closest('[data-match-option]')
    return el ? Number(el.getAttribute('data-match-option')) : -1
  }

  /** Which prompt row is under the pointer, read from the document. */
  function promptAt(x: number, y: number): number {
    if (typeof document === 'undefined') return -1
    const el = document.elementFromPoint(x, y)?.closest('[data-match-prompt]')
    return el ? Number(el.getAttribute('data-match-prompt')) : -1
  }

  function oppositeTargetAt(source: Selection, x: number, y: number): Selection | null {
    const side = source.side === 'left' ? 'right' : 'left'
    const index = side === 'right' ? optionAt(x, y) : promptAt(x, y)
    return index >= 0 ? { side, index } : null
  }

  function endGesture() {
    if (startRef.current?.holdTimer) clearTimeout(startRef.current.holdTimer)
    cleanupRef.current?.()
    cleanupRef.current = null
    startRef.current = null
    setDrag(null)
    setHover(null)
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLElement>, source: Selection) {
    if (disabled || e.button > 0) return
    endGesture()
    const start: GestureStart = {
      source,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      holdTimer: null,
    }
    startRef.current = start

    const beginDrag = (current: GestureStart, point: Point) => {
      if (current.dragging) return
      current.dragging = true
      if (current.holdTimer) clearTimeout(current.holdTimer)
      current.holdTimer = null
      setSelected(null)
      const box = boxRef.current
      if (!box) return
      const b = box.getBoundingClientRect()
      setDrag({ source: current.source, at: { x: point.x - b.left, y: point.y - b.top } })
      setHover(oppositeTargetAt(current.source, point.x, point.y))
    }

    start.holdTimer = setTimeout(() => {
      if (startRef.current === start) beginDrag(start, { x: start.x, y: start.y })
    }, HOLD_TO_DRAG_MS)

    const onMove = (ev: PointerEvent) => {
      const current = startRef.current
      if (!current) return
      if (!current.dragging) {
        const dx = ev.clientX - current.x
        const dy = ev.clientY - current.y
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        beginDrag(current, { x: ev.clientX, y: ev.clientY })
      }
      ev.preventDefault()
      const box = boxRef.current
      if (!box) return
      const b = box.getBoundingClientRect()
      setDrag({ source: current.source, at: { x: ev.clientX - b.left, y: ev.clientY - b.top } })
      setHover(oppositeTargetAt(current.source, ev.clientX, ev.clientY))
    }
    const onUp = (ev: PointerEvent) => {
      const current = startRef.current
      const target = current?.dragging
        ? oppositeTargetAt(current.source, ev.clientX, ev.clientY)
        : null
      endGesture()
      if (!current) return
      if (!current.dragging) {
        // No movement: let the browser's own click event (which bubbles from
        // the card) drive the tap-to-select behaviour.
        return
      }
      suppressClickUntilRef.current = Date.now() + 400
      if (!target) return
      if (current.source.side === 'left' && target.side === 'right') {
        connect(current.source.index, target.index)
      } else if (current.source.side === 'right' && target.side === 'left') {
        connect(target.index, current.source.index)
      }
    }
    const onCancel = () => endGesture()

    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
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
    const a = drag.source.side === 'left'
      ? anchor(leftRefs.current[drag.source.index], 'left')
      : anchor(rightRefs.current[drag.source.index], 'right')
    return a ? { a, b: drag.at } : null
  })()

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">โยงเส้นจับคู่ให้ถูกต้อง:</p>
      <p className="text-xs text-muted-foreground">
        กดค้างที่การ์ดฝั่งใดก็ได้ แล้วลากไปปล่อยที่การ์ดอีกฝั่ง
        หรือแตะการ์ดฝั่งใดก่อนก็ได้ แล้วแตะอีกฝั่งให้ครบคู่
        เลื่อนหน้าจากพื้นที่ว่างนอกการ์ด
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
            const isSelected = selected?.side === 'left' && selected.index === i
            const isHovered = hover?.side === 'left' && hover.index === i && drag !== null
            const isDragging = drag?.source.side === 'left' && drag.source.index === i
            const connected = placement[i] != null
            return (
              <Button
                key={i}
                type="button"
                variant="outline"
                disabled={disabled}
                ref={el => { leftRefs.current[i] = el as HTMLElement | null }}
                data-match-prompt={i}
                aria-label={
                  connected
                    ? `ยกเลิกเส้นของข้อ ${i + 1}`
                    : `เริ่มโยงเส้นจากข้อ ${i + 1}`
                }
                aria-pressed={isSelected}
                onPointerDown={e => onCardPointerDown(e, { side: 'left', index: i })}
                onClick={() => activatePrompt(i)}
                className={cn(
                  'relative flex h-auto min-h-10 w-full select-none items-center justify-start gap-2 rounded-xl border p-2.5 text-left font-normal whitespace-normal transition-all pointer-coarse:min-h-11',
                  disabled ? 'touch-pan-y' : 'touch-none',
                  !disabled && 'cursor-grab active:cursor-grabbing',
                  isHovered ? 'border-primary bg-primary/10'
                    : verdict === true ? 'border-success/40 bg-success/10'
                    : verdict === false ? 'border-destructive/40 bg-destructive/10'
                    : isSelected ? 'border-primary bg-primary/10'
                    : 'border-border bg-card',
                  isDragging && 'translate-y-px ring-2 ring-primary/30'
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

                {/* Decorative connector only. The whole card is the target, so
                    students never have to aim for this small circle. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 transition-colors',
                    verdict === true ? 'border-success bg-success'
                      : verdict === false ? 'border-destructive bg-destructive'
                      : connected || isSelected ? 'border-primary bg-primary'
                      : 'border-border bg-card'
                  )}
                />
              </Button>
            )
          })}
        </div>

        <div className="col-start-2 space-y-2">
          {options.map((option, j) => {
            const takenBy = placement.indexOf(option.id)
            const verdict = takenBy >= 0 ? results?.[takenBy] : undefined
            const isHovered = hover?.side === 'right' && hover.index === j && drag !== null
            const isSelected = selected?.side === 'right' && selected.index === j
            const isDragging = drag?.source.side === 'right' && drag.source.index === j
            return (
              <Button
                key={option.id}
                variant="outline"
                data-match-option={j}
                disabled={disabled}
                ref={el => { rightRefs.current[j] = el as HTMLElement | null }}
                aria-label={`ตัวเลือก ${option.text}`}
                aria-pressed={isSelected}
                onPointerDown={e => onCardPointerDown(e, { side: 'right', index: j })}
                onClick={() => activateOption(j)}
                className={cn(
                  'relative flex h-auto min-h-10 w-full select-none items-center justify-start gap-2 rounded-xl border p-2.5 text-left text-sm font-normal whitespace-normal transition-all pointer-coarse:min-h-11',
                  disabled ? 'touch-pan-y' : 'touch-none',
                  !disabled && 'cursor-grab active:cursor-grabbing',
                  isHovered ? 'border-primary bg-primary/10'
                    : verdict === true ? 'border-success/40 bg-success/10'
                    : verdict === false ? 'border-destructive/40 bg-destructive/10'
                    : isSelected ? 'border-primary bg-primary/10'
                    : takenBy >= 0 ? 'border-primary/40'
                    : 'border-border bg-card',
                  isDragging && 'translate-y-px ring-2 ring-primary/30'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2',
                    verdict === true ? 'border-success bg-success'
                      : verdict === false ? 'border-destructive bg-destructive'
                      : takenBy >= 0 || isSelected ? 'border-primary bg-primary'
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

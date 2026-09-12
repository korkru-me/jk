'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { RichText } from '@/components/ui/rich-text'
import { shouldDelayOrderingDrag, startOrderingHandleDrag } from '@/lib/ordering-pointer'
import { cn } from '@/lib/utils'
import type { OrderingItem } from '@/lib/types'

export interface OrderingDragListProps {
  /** The items in the order they are currently shown to the student. */
  items: OrderingItem[]
  /** The new order, as item ids. Called once a move finishes, not during it. */
  onReorder: (ids: string[]) => void
  /**
   * Whether an answer is on record. A drag list has no blank state — it always
   * shows *some* order — so the caller has to say whether that order was ever
   * the student's choice.
   */
  answered: boolean
  /** Accept the order on screen as the answer, having moved nothing. */
  onConfirm: () => void
  disabled?: boolean
  /** 1-based position each item belongs in. Present only once checked. */
  correctPosition?: Record<string, number>
}

/** How long a finger must rest on a row before it becomes a drag instead of a scroll. */
const LONG_PRESS_MS = 300
/** Pointer travel that starts a mouse drag, and that cancels a pending long press. */
const MOVE_THRESHOLD = 6

/**
 * Ordering answered by dragging the rows into place, numbered down the left.
 *
 * A finger or pen needs a long press first. `touch-action: none` would make dragging
 * work immediately, but it also takes vertical scrolling away from whatever it
 * covers — on a phone a five-row list can fill the screen, and a student who
 * cannot scroll past the question cannot finish the exam. Holding for a moment
 * says "this is a drag, not a scroll" and is the same gesture the phone's own
 * reorderable lists use. A mouse never scrolls by dragging, so it starts on
 * the first movement. The dedicated handle starts immediately for every pointer.
 *
 * The ↑/↓ buttons are not decoration: they are the keyboard route, and the one
 * that still works if a drag misbehaves on hardware nobody here has tested.
 */
export function OrderingDragList({
  items, onReorder, answered, onConfirm, disabled = false, correctPosition,
}: OrderingDragListProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [previewIds, setPreviewIds] = useState<string[] | null>(null)

  const startRef = useRef<
    { id: string; x: number; y: number; touch: boolean; armed: boolean; dragging: boolean } | null
  >(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  /** The order being previewed mid-drag, read by the move handler between renders. */
  useEffect(() => () => { cleanupRef.current?.() }, [])

  const byId = new Map(items.map(i => [i.id, i]))
  const orderIds = previewIds ?? items.map(i => i.id)
  const rows = orderIds.map(id => byId.get(id)).filter((i): i is OrderingItem => !!i)
  const checked = !!correctPosition

  function commit(ids: string[]) {
    onReorder(ids)
  }

  function move(index: number, delta: number) {
    const ids = items.map(i => i.id)
    const to = index + delta
    if (to < 0 || to >= ids.length) return
    const next = [...ids]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  /** Which row the pointer is over, read from the document so it survives reflow. */
  function rowAt(x: number, y: number): number {
    if (typeof document === 'undefined') return -1
    const row = document.elementFromPoint(x, y)?.closest('[data-order-row]')
    return row ? Number(row.getAttribute('data-order-row')) : -1
  }

  function endGesture() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    cleanupRef.current?.()
    cleanupRef.current = null
    startRef.current = null
    setDragId(null)
    setArmedId(null)
    setPreviewIds(null)
  }

  function onRowPointerDown(e: React.PointerEvent<HTMLElement>, id: string, viaHandle = false) {
    if (disabled || e.button > 0) return
    endGesture()
    // The handle carries touch-action:none, so a touch that starts there can
    // never have been a scroll and needs no hold to prove it.
    const touch = shouldDelayOrderingDrag(e.pointerType, viaHandle)
    startRef.current = { id, x: e.clientX, y: e.clientY, touch, armed: !touch, dragging: false }

    // Non-passive so it can cancel the scroll once the hold has been recognised.
    // Added up front because a listener attached mid-gesture is too late.
    const blockScroll = (ev: TouchEvent) => {
      if (startRef.current?.armed) ev.preventDefault()
    }
    const onMove = (ev: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      const travelled = Math.hypot(ev.clientX - start.x, ev.clientY - start.y)

      // Moved before the hold was recognised — the student is scrolling.
      if (!start.armed) {
        if (travelled > MOVE_THRESHOLD) endGesture()
        return
      }
      if (!start.dragging) {
        if (!start.touch && travelled < MOVE_THRESHOLD) return
        start.dragging = true
        setDragId(start.id)
      }
      const over = rowAt(ev.clientX, ev.clientY)
      if (over < 0) return
      const ids = startRef.current === null ? [] : (previewRef.current ?? items.map(i => i.id))
      const from = ids.indexOf(start.id)
      if (from < 0 || over === from) return
      const next = [...ids]
      const [moved] = next.splice(from, 1)
      next.splice(over, 0, moved)
      previewRef.current = next
      setPreviewIds(next)
    }
    const onUp = () => {
      const dragged = startRef.current?.dragging
      const result = previewRef.current
      endGesture()
      if (dragged && result) commit(result)
    }

    previewRef.current = null
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', endGesture)
      window.removeEventListener('touchmove', blockScroll)
      previewRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endGesture)
    window.addEventListener('touchmove', blockScroll, { passive: false })

    if (touch) {
      timerRef.current = setTimeout(() => {
        if (!startRef.current) return
        startRef.current.armed = true
        setArmedId(startRef.current.id)
      }, LONG_PRESS_MS)
    } else {
      setArmedId(id)
    }
  }

  const previewRef = useRef<string[] | null>(null)

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        เรียงรายการให้ถูกลำดับ — ใช้นิ้วหรือปากกากดค้างแล้วลาก จับไอคอนลากได้ทันที หรือใช้ปุ่มลูกศรก็ได้
      </p>

      <div className="space-y-2">
        {rows.map((item, i) => {
          const should = correctPosition?.[item.id]
          const isRight = checked && should === i + 1
          const isDragging = dragId === item.id
          const isArmed = armedId === item.id && !isDragging
          return (
            <div
              key={item.id}
              data-order-row={i}
              onPointerDown={e => onRowPointerDown(e, item.id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                !disabled && 'cursor-grab',
                isDragging && 'cursor-grabbing opacity-60 shadow-lg',
                isArmed && 'ring-2 ring-ring',
                checked
                  ? isRight ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10'
                  : 'border-border'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  checked
                    ? isRight ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'
                    : 'bg-primary/10 text-primary'
                )}
              >
                {i + 1}
              </span>

              {item.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" loading="lazy" decoding="async" draggable={false}
                  className="h-10 w-10 shrink-0 rounded border border-border object-contain" />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <RichText text={item.text} />
              </span>

              {checked && !isRight && should != null && (
                <span className="shrink-0 text-xs text-destructive">ควรอยู่ที่ {should}</span>
              )}

              {!disabled && (
                <span className="flex shrink-0 items-center">
                  <IconButton
                    size="xs"
                    label={`เลื่อน "${item.text}" ขึ้น`}
                    className="h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11"
                    disabled={i === 0}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => move(i, -1)}
                  >
                    <ChevronUp />
                  </IconButton>
                  <IconButton
                    size="xs"
                    label={`เลื่อน "${item.text}" ลง`}
                    className="h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11"
                    disabled={i === rows.length - 1}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown />
                  </IconButton>
                  {/* touch-action:none so a drag started here never becomes a
                      scroll — the handle is the one spot that does not need
                      the long press first. */}
                  <span
                    aria-hidden
                    onPointerDown={e => startOrderingHandleDrag(
                      e,
                      () => onRowPointerDown(e, item.id, true),
                    )}
                    className="flex h-11 w-11 touch-none cursor-grab items-center justify-center text-muted-foreground"
                  >
                    <GripVertical className="h-5 w-5" />
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* A drag list always shows an order, so "I have not answered yet" is
          invisible unless it is said out loud. Without this a student who
          believes the order on screen is already right leaves the question
          scored zero and never sees why. */}
      {!answered && !disabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-3 py-2">
          <span className="text-xs text-warning">ยังไม่ได้บันทึกคำตอบข้อนี้</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="min-h-10 pointer-coarse:min-h-11"
            onClick={onConfirm}
          >
            ใช้ลำดับนี้เป็นคำตอบ
          </Button>
        </div>
      )}
    </div>
  )
}

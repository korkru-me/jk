'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactEventHandler } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Popup edge to viewport edge, and the bar under the picture when it offers a choice. */
const VIEWPORT_MARGIN = 16
const SELECT_BAR_HEIGHT = 60
/** A tiny choice picture may grow this much to fill the screen — further is only blur. */
const MAX_UPSCALE = 4

type Size = { width: number; height: number }

type SelectAction = {
  /** e.g. "เลือกข้อ ก" */
  label: string
  onSelect: () => void
  disabled?: boolean
}

type ZoomableImageProps = {
  src: string
  alt: string
  /** Classes for the thumbnail <img> exactly as the caller styled it before. */
  className?: string
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'auto' | 'sync'
  onError?: ReactEventHandler<HTMLImageElement>
  /**
   * The thumbnail sits inside a radio <label> or a choice <button>: it cannot be
   * a button of its own, so it opens the popup on click and keeps that click
   * from also picking the choice. Picking stays one tap away in the popup.
   */
  insideChoice?: boolean
  selectAction?: SelectAction
}

function fitSize(natural: Size, reservedHeight: number): Size {
  const maxW = Math.max(window.innerWidth - VIEWPORT_MARGIN * 2, 1)
  const maxH = Math.max(window.innerHeight - VIEWPORT_MARGIN * 2 - reservedHeight, 1)
  const scale = Math.min(maxW / natural.width, maxH / natural.height, MAX_UPSCALE)
  return { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) }
}

/**
 * A question/choice picture that opens large on tap. The popup is view-only,
 * so the backdrop, Esc and the X all close it straight away (overlay rule:
 * nothing to lose). Inside, tapping the picture toggles a 2× view that scrolls.
 */
export function ZoomableImage({
  src, alt, className, loading, decoding, onError, insideChoice = false, selectAction,
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false)

  const openPopup = (event: MouseEvent) => {
    // Inside a <label>, cancelling the click is what stops the radio flipping;
    // stopping propagation keeps a parent <button>'s onClick from firing.
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  const thumbnail = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading={loading} decoding={decoding} onError={onError} className={className} />
  )
  const badge = (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm ring-1 ring-border"
    >
      <ZoomIn className="size-3" />
    </span>
  )

  return (
    <>
      {insideChoice ? (
        <span
          onClick={openPopup}
          title="แตะเพื่อขยายรูป"
          className="relative inline-flex max-w-full shrink-0 cursor-zoom-in align-top"
        >
          {thumbnail}
          {badge}
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={openPopup}
          aria-label={`ขยายรูป: ${alt}`}
          className="relative h-auto max-w-full shrink-0 cursor-zoom-in p-0 align-top hover:bg-transparent"
        >
          {thumbnail}
          {badge}
        </Button>
      )}
      {open && (
        // The popup is portalled out of the DOM but React still bubbles its
        // clicks up the component tree — to the choice <button> we sit in.
        <span className="contents" onClick={event => event.stopPropagation()}>
          <ImageZoomDialog
            src={src}
            alt={alt}
            selectAction={selectAction}
            onOpenChange={setOpen}
          />
        </span>
      )}
    </>
  )
}

function ImageZoomDialog({
  src, alt, selectAction, onOpenChange,
}: {
  src: string
  alt: string
  selectAction?: SelectAction
  onOpenChange: (open: boolean) => void
}) {
  const [natural, setNatural] = useState<Size | null>(null)
  const [fit, setFit] = useState<Size | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [failed, setFailed] = useState(false)
  /** Where (0–1 of the picture) the 2× view should open centred. */
  const focusPoint = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })
  const scroller = useRef<HTMLDivElement>(null)
  const reservedHeight = selectAction ? SELECT_BAR_HEIGHT : 0

  const refit = useCallback(() => {
    if (natural) setFit(fitSize(natural, reservedHeight))
  }, [natural, reservedHeight])

  useEffect(() => {
    refit()
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [refit])

  // Bring the tapped spot to the middle of the scroll box once 2× has laid out.
  useLayoutEffect(() => {
    const box = scroller.current
    if (!zoomed || !box) return
    box.scrollLeft = focusPoint.current.x * box.scrollWidth - box.clientWidth / 2
    box.scrollTop = focusPoint.current.y * box.scrollHeight - box.clientHeight / 2
  }, [zoomed])

  const toggleZoom = (event?: MouseEvent<HTMLImageElement>) => {
    if (!zoomed && event) {
      const rect = event.currentTarget.getBoundingClientRect()
      focusPoint.current = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      }
    } else if (!zoomed) {
      focusPoint.current = { x: 0.5, y: 0.5 }
    }
    setZoomed(z => !z)
  }

  // 2× the fitted size, but never smaller than the file itself.
  const shown = fit && natural
    ? zoomed
      ? { width: Math.max(fit.width * 2, natural.width), height: Math.max(fit.height * 2, natural.height) }
      : fit
    : null
  const boxStyle = {
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    maxHeight: `calc(100dvh - ${VIEWPORT_MARGIN * 2 + reservedHeight}px)`,
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        forceRenderOverlay
        // left-1/2 + translate would cap a w-fit popup at half the screen (its
        // shrink-to-fit width only counts the space right of `left`), so centre
        // it with left/right 0 and auto margins instead.
        className="right-0 left-0 mx-auto w-fit max-w-[calc(100vw-2rem)] translate-x-0 gap-0 overflow-hidden bg-background p-0 sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <DialogDescription className="sr-only">
          รูปขยาย แตะที่รูปหรือปุ่มแว่นขยายเพื่อซูมเพิ่ม กดพื้นที่นอกรูป ปุ่มปิด หรือ Esc เพื่อปิด
        </DialogDescription>
        {failed ? (
          <p role="alert" className="max-w-sm px-6 py-12 text-center text-muted-foreground">
            โหลดรูปไม่สำเร็จ กรุณาปิดแล้วลองเปิดอีกครั้ง
          </p>
        ) : (
          <div ref={scroller} style={boxStyle} className={cn('overscroll-contain', zoomed ? 'overflow-auto' : 'overflow-hidden')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              onLoad={event => setNatural({
                width: event.currentTarget.naturalWidth || 1,
                height: event.currentTarget.naturalHeight || 1,
              })}
              onError={() => setFailed(true)}
              onClick={toggleZoom}
              style={shown ? { width: shown.width, height: shown.height } : boxStyle}
              className={cn(
                'block max-w-none object-contain',
                !shown && 'h-auto w-auto',
                zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
              )}
            />
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1.5">
          {!failed && (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11 bg-background/90"
              aria-label={zoomed ? 'ย่อรูปให้พอดีจอ' : 'ซูมรูปเพิ่ม'}
              aria-pressed={zoomed}
              onClick={() => toggleZoom()}
            >
              {zoomed ? <ZoomOut aria-hidden="true" /> : <ZoomIn aria-hidden="true" />}
            </Button>
          )}
          <DialogClose
            render={
              <Button type="button" variant="outline" size="icon-lg" className="size-11 bg-background/90" aria-label="ปิดรูปขยาย" />
            }
          >
            <X aria-hidden="true" />
          </DialogClose>
        </div>
        {selectAction && (
          <div className="flex items-center justify-center border-t border-border bg-muted/40 px-3 py-2" style={{ height: SELECT_BAR_HEIGHT }}>
            <Button
              type="button"
              size="lg"
              disabled={selectAction.disabled}
              onClick={() => {
                selectAction.onSelect()
                onOpenChange(false)
              }}
            >
              {selectAction.label}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

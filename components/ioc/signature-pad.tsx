'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * A box to sign in with a finger or a mouse, which hands back a PNG data URL.
 *
 * Shared by the expert's own signature and the teacher's, so the two cannot
 * drift into behaving differently on the same phone.
 *
 * Drawn at the element's device pixel ratio so a signature made on a phone is
 * not a blurred smear when it is printed on A4. `touch-action: none` is set on
 * the canvas alone, so the page still scrolls everywhere around it.
 */
export function SignaturePad({
  onChange,
  label = 'เซ็นในกรอบนี้',
}: {
  onChange: (dataUrl: string | null) => void
  label?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  // Whether anything has been drawn is read back inside the same gesture, and a
  // quick stroke can put pointerdown, move and up in one React batch — so the
  // state value would still be false when the stroke ends and the signature
  // would be handed back as null. The ref is the truth; the state only paints.
  const inked = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)

    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.lineJoin = 'round'
    // Black ink on transparency, so the same file sits on a white page or a
    // dark preview without a grey box around it.
    context.strokeStyle = '#111111'
  }, [])

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const { x, y } = positionOf(event)
    context.beginPath()
    context.moveTo(x, y)
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const { x, y } = positionOf(event)
    context.lineTo(x, y)
    context.stroke()
    if (!inked.current) {
      inked.current = true
      setHasInk(true)
    }
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(inked.current ? canvas.toDataURL('image/png') : null)
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    inked.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border border-dashed bg-muted">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="h-36 w-full touch-none"
          aria-label={label}
          role="img"
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b" aria-hidden="true" />
        {!hasInk ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-muted-foreground">
            {label}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={clear} disabled={!hasInk}>
          ลบแล้วเซ็นใหม่
        </Button>
      </div>
    </div>
  )
}

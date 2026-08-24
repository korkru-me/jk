'use client'

import { useEffect, useState } from 'react'

const WATERMARK_TILES = Array.from({ length: 16 }, (_, index) => index)

/**
 * A visible attribution layer for screenshots/photos of an active exam.
 * It is intentionally only a deterrent: a student who controls the browser
 * can hide DOM elements, and an operating system can still capture the screen.
 */
export function ExamWatermark({ text }: { text: string }) {
  const [timeLabel, setTimeLabel] = useState('')

  useEffect(() => {
    const updateTime = () => {
      setTimeLabel(new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      }))
    }
    updateTime()
    const interval = window.setInterval(updateTime, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const label = timeLabel ? `${text} • ${timeLabel}` : text

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] grid grid-cols-2 grid-rows-8 overflow-hidden select-none sm:grid-cols-3 sm:grid-rows-6"
    >
      {WATERMARK_TILES.map((tile) => (
        <div key={tile} className="flex items-center justify-center overflow-hidden px-3">
          <span
            className="-rotate-12 whitespace-nowrap text-xs font-semibold tracking-wide text-foreground"
            style={{ opacity: 0.075 }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

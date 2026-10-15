'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { solutionWatermarkLines, type SolutionWatermarkData } from '@/lib/solution-watermark'
import { cn } from '@/lib/utils'

const TILES = Array.from({ length: 12 }, (_, i) => i)

/** Always present on released answers. Independent of the teacher's optional
 * exam-taking watermark; the portal keeps solution dialogs covered as well. */
export function SolutionWatermark({ data, layer = 'page', active = true, viewer = 'student' }: { data: SolutionWatermarkData; layer?: 'page' | 'dialog'; active?: boolean; viewer?: 'student' | 'teacher' }) {
  const [mounted, setMounted] = useState(false)
  const [at, setAt] = useState(data.issuedAt)
  useEffect(() => {
    setMounted(true)
    const origin = performance.now()
    const serverTime = Date.parse(data.issuedAt)
    setAt(data.issuedAt)
    const timer = window.setInterval(() => setAt(new Date(serverTime + performance.now() - origin).toISOString()), 30_000)
    return () => window.clearInterval(timer)
  }, [data.issuedAt])
  if (!active) return null
  const lines = solutionWatermarkLines(data, at)
  if (viewer === 'teacher') {
    lines[0] = `ผลงานของ ${lines[0]}`
    lines[2] += ' · มุมมองผู้สอน'
  }
  const overlay = (
    <div aria-hidden="true" data-solution-watermark className={cn('pointer-events-none fixed inset-0 grid grid-cols-1 grid-rows-4 overflow-hidden select-none sm:grid-cols-2 lg:grid-cols-3', layer === 'dialog' ? 'z-[150]' : 'z-40')}>
      {TILES.map(i => (
        <div key={i} className={cn('flex min-h-0 items-center justify-center px-5', i >= 4 && 'hidden sm:flex', i >= 8 && 'sm:hidden lg:flex')}>
          <div className="w-full max-w-xs -rotate-12 break-words text-center text-[10px] font-semibold leading-relaxed text-foreground opacity-[0.13]">
            {lines.map((line, n) => <p key={n}>{line}</p>)}
          </div>
        </div>
      ))}
    </div>
  )
  return mounted ? createPortal(overlay, document.body) : overlay
}

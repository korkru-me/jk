'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

/**
 * The order number, typed rather than only nudged.
 *
 * The arrows next to it move one place at a time, which is nineteen clicks to
 * lift ข้อ 20 to the front. This takes the destination directly: type it and
 * press Enter, or leave the field. An out-of-range number clamps rather than
 * doing nothing, and anything unparseable snaps back to where the question
 * actually is.
 *
 * Shared by the งาน wizard's คะแนน step and the edit page's โจทย์และคะแนน list.
 */
export function OrderNumberInput({ position, total, onMove }: {
  position: number
  total: number
  onMove: (to: number) => void
}) {
  const [draft, setDraft] = useState(String(position))

  // The list reorders under this field whenever any row moves, so the draft
  // has to follow the row's real position rather than whatever was typed last.
  useEffect(() => { setDraft(String(position)) }, [position])

  function commit() {
    const parsed = Number.parseInt(draft, 10)
    if (!Number.isFinite(parsed) || parsed === position) { setDraft(String(position)); return }
    onMove(Math.max(1, Math.min(total, parsed)))
  }

  return (
    <Input
      type="number"
      min={1}
      max={total}
      value={draft}
      aria-label={`ลำดับข้อ (ตอนนี้อยู่ข้อ ${position} จาก ${total})`}
      title="พิมพ์เลขข้อที่ต้องการแล้วกด Enter"
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') setDraft(String(position))
      }}
      className="w-12 shrink-0 px-1 text-center text-xs font-semibold"
    />
  )
}

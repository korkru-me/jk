'use client'

import { useEffect, useRef, useState } from 'react'

/** Compact grading settings are temporary disclosures; another trigger opens
 * in the same click after this one closes. No unsaved scores live here. */
export function useGradingDisclosure() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function outside(event: MouseEvent) {
      if (event.target instanceof Node && root.current && !event.composedPath().includes(root.current) && !root.current.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false) }
    // Closing on pointerdown moves the second trigger before its click lands.
    document.addEventListener('click', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return { open, setOpen, root }
}

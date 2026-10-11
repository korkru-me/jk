'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Closes a transient control after a complete click outside its boundary.
 * Use this for custom dropdowns; dialogs and persistent disclosure panels
 * should keep their own dismissal policy.
 */
export function useDismissOnOutsideClick<T extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<T | null>,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!open) return

    function handleDocumentClick(event: MouseEvent) {
      const container = containerRef.current
      const target = event.target
      if (!container || !(target instanceof Node)) return
      if (container.contains(target) || event.composedPath().includes(container)) return

      onDismissRef.current()
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [containerRef, open])
}

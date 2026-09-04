'use client'

import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { clampMathCaret, resolveMathCaret, type MathCaretRange } from '@/lib/math/input-edit'

/** A phone or a bare tablet: no mouse, so focusing a field opens a keyboard. */
function isTouchOnly() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export interface MathCaret {
  /** Spread on the field so it records the caret while it still owns it. */
  inputProps: { onSelect: () => void; onFocus: () => void }
  /** Call after the field's own value changed, so the caret stays recorded. */
  remember: () => void
  /** Where the next keypad edit belongs, even if the field lost focus. */
  read: (value: string) => MathCaretRange
  /** Call after a keypad edit with the cursor the edit asked for. */
  restore: (cursor: number) => void
  /** Spread on a keypad container so tapping a key does not blur the field. */
  keypadProps: { onMouseDown: (event: MouseEvent) => void }
}

/**
 * Tracks the caret of a math input so an on-screen keypad can edit at it.
 *
 * Tapping a keypad key blurs the field, and iOS resets a blurred input's
 * selection to 0 — so reading `selectionStart` at tap time puts every key at
 * the front of the expression (tap 1, 2, 3 on an iPad and you get "321").
 * Desktop browsers keep the selection, which is why this only shows up on
 * iPad and iPhone. The remembered caret is the source of truth whenever the
 * field is not focused, so the keys land in the right place either way.
 */
export function useMathCaret(inputRef: RefObject<HTMLInputElement | null>): MathCaret {
  const caretRef = useRef<MathCaretRange | null>(null)

  const remember = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const { selectionStart, selectionEnd } = input
    if (selectionStart === null || selectionEnd === null) return
    caretRef.current = { start: selectionStart, end: selectionEnd }
  }, [inputRef])

  // `select` alone misses a plain caret move — a tap or an arrow key that
  // selects nothing — so follow the document's selection while the field owns it.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const followSelection = () => {
      const input = inputRef.current
      if (input && input.ownerDocument.activeElement === input) remember()
    }
    document.addEventListener('selectionchange', followSelection)
    return () => document.removeEventListener('selectionchange', followSelection)
  }, [inputRef, remember])

  const read = useCallback((value: string) => {
    const input = inputRef.current
    const focused = !!input && input.ownerDocument.activeElement === input
    const live = focused && input ? { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 } : null
    return resolveMathCaret(value.length, live, caretRef.current)
  }, [inputRef])

  const restore = useCallback((cursor: number) => {
    caretRef.current = { start: cursor, end: cursor }
    const input = inputRef.current
    if (!input) return
    // Pulling focus back on a touch-only screen raises the software keyboard
    // over the keypad, so only reach for the field where a hardware keyboard
    // is likely. Elsewhere the remembered caret carries the position instead.
    const refocus = !isTouchOnly() || input.ownerDocument.activeElement === input
    if (!refocus) return
    requestAnimationFrame(() => {
      const current = inputRef.current
      if (!current) return
      current.focus()
      const range = clampMathCaret(current.value.length, cursor, cursor)
      current.setSelectionRange(range.start, range.end)
    })
  }, [inputRef])

  const keypadProps = {
    onMouseDown: (event: MouseEvent) => {
      // Swallowing the default keeps focus — and with it the caret — in the
      // field while a key is tapped, instead of dropping it on the body.
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return
      event.preventDefault()
    },
  }

  return { inputProps: { onSelect: remember, onFocus: remember }, remember, read, restore, keypadProps }
}

'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronUp, Delete, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  backspaceMathInput,
  insertMathFraction,
  insertMathFunction,
  insertMathText,
  type MathInputEditResult,
} from '@/lib/math/input-edit'
import { useMathCaret } from '@/hooks/use-math-caret'
import { cn } from '@/lib/utils'
import type { MathInputMode } from '@/lib/types'

type KeyAction =
  | { kind: 'insert'; value: string; cursorOffset?: number }
  | { kind: 'function'; value: string }
  | { kind: 'fraction' | 'backspace' | 'clear' }

interface MathKey {
  label: string
  ariaLabel?: string
  action: KeyAction
}

const key = (label: string, value = label, ariaLabel?: string): MathKey => ({
  label,
  ariaLabel,
  action: { kind: 'insert', value },
})

const fn = (label: string, value: string, ariaLabel?: string): MathKey => ({
  label,
  ariaLabel,
  action: { kind: 'function', value },
})

const CORE_KEYS: MathKey[][] = [
  [key('7'), key('8'), key('9'), key('÷', '÷', 'หาร'), key('('), key(')')],
  [key('4'), key('5'), key('6'), key('×', '×', 'คูณ'), key('π', 'π', 'พาย'), key('e')],
  [key('1'), key('2'), key('3'), key('−', '−', 'ลบ'), key('+', '+', 'บวก'), { label: 'xʸ', ariaLabel: 'ยกกำลัง', action: { kind: 'insert', value: '^()', cursorOffset: 2 } }],
  [key('0'), key('.'), { label: '√', ariaLabel: 'รากที่สอง', action: { kind: 'insert', value: '√()', cursorOffset: 2 } }, fn('sin', 'sin'), fn('cos', 'cos'), fn('tan', 'tan')],
  [
    { label: 'a⁄b', ariaLabel: 'เศษส่วน', action: { kind: 'fraction' } },
    fn('log', 'log'),
    fn('ln', 'ln'),
    fn('|x|', 'abs', 'ค่าสัมบูรณ์'),
    { label: 'ล้าง', action: { kind: 'clear' } },
    { label: '⌫', ariaLabel: 'ลบหนึ่งตัว', action: { kind: 'backspace' } },
  ],
]

const ADVANCED_KEYS: MathKey[] = [
  fn('sin⁻¹', 'asin', 'อาร์กไซน์'),
  fn('cos⁻¹', 'acos', 'อาร์กโคไซน์'),
  fn('tan⁻¹', 'atan', 'อาร์กแทนเจนต์'),
  key('x²', '²', 'ยกกำลังสอง'),
  key('x³', '³', 'ยกกำลังสาม'),
  key('x!', '!', 'แฟกทอเรียล'),
  fn('∛', 'cbrt', 'รากที่สาม'),
  { label: 'ⁿ√', ariaLabel: 'รากลำดับที่เอ็น', action: { kind: 'insert', value: 'root(,)', cursorOffset: 5 } },
  fn('eˣ', 'exp', 'เอ็กซ์โพเนนเชียล'),
  { label: '×10ⁿ', ariaLabel: 'สัญกรณ์วิทยาศาสตร์', action: { kind: 'insert', value: '×10^()', cursorOffset: 5 } },
  fn('round', 'round', 'ปัดเศษ'),
  key(',', ',', 'จุลภาค'),
  fn('sinh', 'sinh'),
  fn('cosh', 'cosh'),
  fn('tanh', 'tanh'),
  fn('⌊x⌋', 'floor', 'ปัดลง'),
  fn('⌈x⌉', 'ceil', 'ปัดขึ้น'),
  fn('sign', 'sign', 'เครื่องหมายของจำนวน'),
]

export interface MathAnswerFieldProps {
  value: string
  mode: MathInputMode
  active: boolean
  onActivate: () => void
  onDeactivate: () => void
  onChange: (value: string) => void
  onModeChange: (mode: MathInputMode) => void
  ariaLabel: string
  disabled?: boolean
  unit?: ReactNode
  placeholder?: string
  className?: string
  inputClassName?: string
}

function findAnswerScroller(input: HTMLInputElement) {
  let candidate: HTMLElement | null = null
  for (let parent = input.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'hidden' || overflowY === 'clip') break
    if (!/^(auto|scroll|overlay)$/.test(overflowY)) continue
    if (parent.scrollHeight > parent.clientHeight) return parent
    candidate = parent
  }
  return candidate
}

/** Numeric answer field with a cursor-aware, touch-friendly math keypad. */
export function MathAnswerField({
  value,
  mode,
  active,
  onActivate,
  onDeactivate,
  onChange,
  onModeChange,
  ariaLabel,
  disabled = false,
  unit,
  placeholder = 'เช่น 10, 9+1, √100 หรือ sin(30)',
  className,
  inputClassName,
}: MathAnswerFieldProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleButtonRef = useRef<HTMLButtonElement>(null)
  const caret = useMathCaret(inputRef)
  const panelId = useId()
  const [advanced, setAdvanced] = useState(false)

  const closeKeypad = useCallback(() => {
    onDeactivate()
    requestAnimationFrame(() => toggleButtonRef.current?.focus({ preventScroll: true }))
  }, [onDeactivate])

  useEffect(() => {
    if (!active) return
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      // Let the new field take over before releasing the scroll space; running
      // cleanup on pointerdown can move that field out from under the tap.
      if (target instanceof Element && target.closest('[data-math-answer-field] :is(input, button:not(:disabled))')) return

      // An outside interaction should keep its own focus. The explicit close
      // button and Escape return focus to the keypad toggle, but doing that
      // here would steal focus back from the control the student just chose.
      onDeactivate()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
  }, [active, onDeactivate])

  useEffect(() => {
    if (!active) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      closeKeypad()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [active, closeKeypad])

  useEffect(() => {
    const input = inputRef.current
    const panel = panelRef.current
    if (!active || !input || !panel) return

    const scroller = findAnswerScroller(input)
    const scrollContent = scroller ?? document.body
    const scrollSpace = '--math-keypad-scroll-space'
    const dock = input.closest('[data-exam-normal-stage]')?.querySelector('[data-exam-toolbar-dock]')
    const stickyDock = dock && scroller?.contains(dock) ? dock : null
    const gap = 12
    let frame = 0
    scrollContent.setAttribute('data-math-keypad-scroll-space', '')

    const revealInput = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const inputBounds = input.getBoundingClientRect()
        const scrollBounds = scroller?.getBoundingClientRect()
        const scrollTop = Math.max(0, scrollBounds?.top ?? 0)
        const stickyHeight = stickyDock && scroller
          ? stickyDock.getBoundingClientRect().height + (Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0)
          : 0
        // Leave room for the whole answer between the sticky exam tools and
        // the keypad, even when a phone is rotated into a short viewport.
        const available = panel.getBoundingClientRect().bottom - scrollTop - stickyHeight - inputBounds.height - 2 * gap
        panel.style.setProperty('--math-keypad-available-height', `${Math.max(96, Math.floor(available))}px`)
        const panelBounds = panel.getBoundingClientRect()
        const overlaps = inputBounds.left < panelBounds.right && inputBounds.right > panelBounds.left
        const scrollBottom = Math.min(scrollBounds?.bottom ?? Infinity, window.innerHeight)
        const targetBottom = Math.min(scrollBottom, panelBounds.top) - gap
        // Reserve a scroll tail even after the last answer. Without it the
        // browser clamps scrollTop at the end of the page, under the keypad.
        const reserve = overlaps ? Math.max(0, Math.ceil(scrollBottom - targetBottom)) : 0
        scrollContent.style.setProperty(scrollSpace, `${reserve}px`)
        if (!overlaps) return

        const coveredBy = input.getBoundingClientRect().bottom - targetBottom
        if (coveredBy <= 0) return
        if (scroller) scroller.scrollTop += Math.ceil(coveredBy)
        else window.scrollBy(0, Math.ceil(coveredBy))
      })
    }

    revealInput()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealInput)
    observer?.observe(panel)
    if (scroller) observer?.observe(scroller)
    if (stickyDock) observer?.observe(stickyDock)
    const viewport = window.visualViewport
    window.addEventListener('resize', revealInput)
    viewport?.addEventListener('resize', revealInput)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', revealInput)
      viewport?.removeEventListener('resize', revealInput)
      panel.style.removeProperty('--math-keypad-available-height')
      scrollContent.style.removeProperty(scrollSpace)
      scrollContent.removeAttribute('data-math-keypad-scroll-space')
    }
  }, [active])

  const apply = (edit: MathInputEditResult) => {
    onChange(edit.value)
    caret.restore(edit.cursor)
  }

  const runAction = (action: KeyAction) => {
    const { start, end } = caret.read(value)
    if (action.kind === 'insert') {
      apply(insertMathText(value, start, end, action.value, action.cursorOffset))
    } else if (action.kind === 'function') {
      apply(insertMathFunction(value, start, end, action.value))
    } else if (action.kind === 'fraction') {
      apply(insertMathFraction(value, start, end))
    } else if (action.kind === 'backspace') {
      apply(backspaceMathInput(value, start, end))
    } else {
      apply({ value: '', cursor: 0 })
    }
  }

  const focusInput = () => {
    onActivate()
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  return (
    <span ref={rootRef} data-math-answer-field className={cn('inline-flex min-w-0 flex-col gap-1.5 align-middle', className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Input
          ref={inputRef}
          type="text"
          // This field already opens the complete math keypad below. Asking
          // for a second software keyboard leaves almost no usable viewport
          // on iPhone/iPad; `none` suppresses that keyboard without blocking
          // a physical keyboard on desktop or a paired keyboard on a tablet.
          inputMode="none"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-controls={active ? panelId : undefined}
          placeholder={placeholder}
          value={value}
          {...caret.inputProps}
          onFocus={() => {
            caret.remember()
            onActivate()
          }}
          onKeyDown={event => {
            if (!active || event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            event.stopPropagation()
            closeKeypad()
          }}
          onChange={event => {
            onChange(event.target.value)
            caret.remember()
          }}
          className={cn('min-w-[9rem]', inputClassName)}
        />
        {unit && (
          <span data-math-answer-unit className="shrink-0 whitespace-nowrap">
            {unit}
          </span>
        )}
        <Button
          ref={toggleButtonRef}
          type="button"
          variant={active ? 'secondary' : 'outline'}
          size="icon"
          aria-label={active ? 'ปิดแป้นคณิตศาสตร์' : 'เปิดแป้นคณิตศาสตร์'}
          aria-expanded={active}
          aria-controls={panelId}
          disabled={disabled}
          className="pointer-coarse:size-11"
          onClick={() => active ? closeKeypad() : focusInput()}
        >
          <Keyboard />
        </Button>
      </span>

      <span className="flex items-center gap-1 text-[11px] text-muted-foreground" role="group" aria-label="หน่วยมุม">
        <span className="mr-0.5">มุม</span>
        {(['deg', 'rad'] as const).map(option => (
          <Button
            key={option}
            type="button"
            variant={mode === option ? 'secondary' : 'outline'}
            size="xs"
            aria-pressed={mode === option}
            disabled={disabled}
            onClick={() => {
              onActivate()
              onModeChange(option)
            }}
            className={cn('pointer-coarse:min-h-11', mode === option && 'border-primary bg-primary/10 text-primary')}
          >
            {option.toUpperCase()}
          </Button>
        ))}
      </span>

      {active && typeof document !== 'undefined' && createPortal((
        <div
          data-math-keypad-overlay
          className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex h-[var(--app-height,100dvh)] items-end justify-center p-2"
        >
          <Card
            ref={panelRef}
            id={panelId}
            data-math-keypad-panel
            role="group"
            aria-label="แป้นคณิตศาสตร์"
            padding="sm"
            className="pointer-events-auto flex max-h-[min(70%,var(--math-keypad-available-height,100%))] w-full max-w-2xl flex-col gap-2 overflow-hidden shadow-xl pointer-coarse:max-h-[min(60%,var(--math-keypad-available-height,100%))]"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            {...caret.keypadProps}
          >
            <div
              data-math-keypad-toolbar
              className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2"
            >
              <div data-math-keypad-title>
                <p className="text-sm font-semibold">แป้นคณิตศาสตร์</p>
                <p data-math-keypad-subtitle className="text-[11px] text-muted-foreground pointer-coarse:hidden">ใส่ที่ตำแหน่งเคอร์เซอร์ · กด Esc เพื่อปิด</p>
              </div>
              <Button
                data-math-keypad-close
                type="button"
                size="sm"
                className="gap-1.5 whitespace-nowrap pointer-coarse:min-h-11"
                onClick={closeKeypad}
              >
                <Check aria-hidden />
                พิมพ์เสร็จ
              </Button>

              <div data-math-keypad-controls className="col-span-2 flex items-center gap-1">
                <span className="mr-1 text-[11px] text-muted-foreground">หน่วยมุม</span>
                {(['deg', 'rad'] as const).map(option => (
                  <Button
                    key={option}
                    type="button"
                    variant={mode === option ? 'secondary' : 'outline'}
                    size="xs"
                    aria-pressed={mode === option}
                    disabled={disabled}
                    onClick={() => onModeChange(option)}
                    className={cn('pointer-coarse:min-h-11', mode === option && 'border-primary bg-primary/10 text-primary')}
                  >
                    {option.toUpperCase()}
                  </Button>
                ))}
                <Button type="button" variant="ghost" size="sm" disabled={disabled} className="ml-auto pointer-coarse:min-h-11" onClick={() => setAdvanced(show => !show)}>
                  {advanced ? <ChevronUp /> : <ChevronDown />}
                  ขั้นสูง
                </Button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <div data-math-keypad-core className="grid grid-cols-6 gap-1.5">
                {CORE_KEYS.flatMap((row, rowIndex) => row.map((mathKey, keyIndex) => (
                  <Button
                    key={`${mathKey.label}-${rowIndex}-${keyIndex}`}
                    type="button"
                    variant="outline"
                    className="h-9 min-w-0 px-1 font-mono pointer-coarse:h-11"
                    aria-label={mathKey.ariaLabel ?? mathKey.label}
                    disabled={disabled}
                    onClick={() => runAction(mathKey.action)}
                  >
                    {mathKey.action.kind === 'backspace' ? <Delete /> : mathKey.label}
                  </Button>
                )))}
              </div>

              {advanced && (
                <div data-math-keypad-advanced className="mt-2 grid grid-cols-6 gap-1.5 border-t border-border pt-2">
                  {ADVANCED_KEYS.map((mathKey, index) => (
                    <Button
                      key={`${mathKey.label}-${index}`}
                      type="button"
                      variant="secondary"
                      className="h-9 min-w-0 px-1 font-mono text-xs pointer-coarse:h-11"
                      aria-label={mathKey.ariaLabel ?? mathKey.label}
                      disabled={disabled}
                      onClick={() => runAction(mathKey.action)}
                    >
                      {mathKey.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      ), document.body)}
    </span>
  )
}

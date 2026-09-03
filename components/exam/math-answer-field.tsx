'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Delete, Keyboard, X } from 'lucide-react'
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
  placeholder?: string
  className?: string
  inputClassName?: string
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
  placeholder = 'เช่น 10, 9+1, √100 หรือ sin(30)',
  className,
  inputClassName,
}: MathAnswerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    if (!active) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDeactivate()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [active, onDeactivate])

  const apply = (edit: MathInputEditResult) => {
    onChange(edit.value)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(edit.cursor, edit.cursor)
    })
  }

  const runAction = (action: KeyAction) => {
    const start = inputRef.current?.selectionStart ?? value.length
    const end = inputRef.current?.selectionEnd ?? start
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
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <span className={cn('inline-flex min-w-0 flex-col gap-1.5 align-middle', className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-controls={active ? panelId : undefined}
          aria-expanded={active}
          placeholder={placeholder}
          value={value}
          onFocus={onActivate}
          onChange={event => onChange(event.target.value)}
          className={cn('min-w-[9rem]', inputClassName)}
        />
        <Button
          type="button"
          variant={active ? 'secondary' : 'outline'}
          size="icon"
          aria-label={active ? 'ปิดแป้นคณิตศาสตร์' : 'เปิดแป้นคณิตศาสตร์'}
          aria-expanded={active}
          aria-controls={panelId}
          onClick={() => active ? onDeactivate() : focusInput()}
        >
          <Keyboard />
        </Button>
      </span>

      <span className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-label="หน่วยมุม">
        <span className="mr-0.5">มุม</span>
        {(['deg', 'rad'] as const).map(option => (
          <Button
            key={option}
            type="button"
            variant={mode === option ? 'secondary' : 'outline'}
            size="xs"
            aria-pressed={mode === option}
            onClick={() => {
              onActivate()
              onModeChange(option)
            }}
            className={cn(mode === option && 'border-primary bg-primary/10 text-primary')}
          >
            {option.toUpperCase()}
          </Button>
        ))}
      </span>

      {active && typeof document !== 'undefined' && createPortal((
        <Card
          id={panelId}
          role="group"
          aria-label="แป้นคณิตศาสตร์"
          padding="sm"
          className="fixed inset-x-2 bottom-2 z-[70] mx-auto max-w-2xl space-y-2 shadow-xl"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          onMouseDown={event => event.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm font-semibold">แป้นคณิตศาสตร์</p>
              <p className="text-[11px] text-muted-foreground">ใส่ที่ตำแหน่งเคอร์เซอร์ · กด Esc เพื่อปิด</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={onDeactivate} aria-label="ปิดแป้นคณิตศาสตร์">
              <X />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] text-muted-foreground">หน่วยมุม</span>
            {(['deg', 'rad'] as const).map(option => (
              <Button
                key={option}
                type="button"
                variant={mode === option ? 'secondary' : 'outline'}
                size="xs"
                aria-pressed={mode === option}
                onClick={() => onModeChange(option)}
                className={cn(mode === option && 'border-primary bg-primary/10 text-primary')}
              >
                {option.toUpperCase()}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setAdvanced(show => !show)}>
              {advanced ? <ChevronUp /> : <ChevronDown />}
              ขั้นสูง
            </Button>
          </div>

          <div className="space-y-1.5">
            {CORE_KEYS.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-6 gap-1.5">
                {row.map((mathKey, keyIndex) => (
                  <Button
                    key={`${mathKey.label}-${keyIndex}`}
                    type="button"
                    variant="outline"
                    className="h-9 min-w-0 px-1 font-mono"
                    aria-label={mathKey.ariaLabel ?? mathKey.label}
                    onClick={() => runAction(mathKey.action)}
                  >
                    {mathKey.action.kind === 'backspace' ? <Delete /> : mathKey.label}
                  </Button>
                ))}
              </div>
            ))}
          </div>

          {advanced && (
            <div className="grid grid-cols-6 gap-1.5 border-t border-border pt-2">
              {ADVANCED_KEYS.map((mathKey, index) => (
                <Button
                  key={`${mathKey.label}-${index}`}
                  type="button"
                  variant="secondary"
                  className="h-9 min-w-0 px-1 font-mono text-xs"
                  aria-label={mathKey.ariaLabel ?? mathKey.label}
                  onClick={() => runAction(mathKey.action)}
                >
                  {mathKey.label}
                </Button>
              ))}
            </div>
          )}
        </Card>
      ), document.body)}
    </span>
  )
}

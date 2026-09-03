'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, Delete, History, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  backspaceMathInput,
  insertMathFunction,
  insertMathText,
  type MathInputEditResult,
} from '@/lib/math/input-edit'
import {
  evaluateCalculatorExpression,
  type CalculatorEvaluation,
} from '@/lib/math/calculator'
import type { MathInputMode } from '@/lib/types'

interface HistoryEntry {
  expression: string
  result: string
  mode: MathInputMode
}

export interface ScientificCalculatorProps {
  open: boolean
  mode: MathInputMode
  targetLabel: string | null
  onModeChange: (mode: MathInputMode) => void
  onInsertResult: (result: string) => void
  onClose: () => void
}

/** Lazy-loaded calculator. Its state stays in memory only for this page/attempt. */
export default function ScientificCalculator({
  open,
  mode,
  targetLabel,
  onModeChange,
  onInsertResult,
  onClose,
}: ScientificCalculatorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [expression, setExpression] = useState('')
  const [evaluation, setEvaluation] = useState<CalculatorEvaluation | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [inverse, setInverse] = useState(false)
  const [justEvaluated, setJustEvaluated] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open || typeof document === 'undefined') return null

  const selection = () => {
    const start = inputRef.current?.selectionStart ?? expression.length
    const end = inputRef.current?.selectionEnd ?? start
    return { start, end }
  }

  const apply = (edit: MathInputEditResult) => {
    setExpression(edit.value)
    setEvaluation(null)
    setJustEvaluated(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(edit.cursor, edit.cursor)
    })
  }

  const insert = (text: string, kind: 'number' | 'operator' | 'constant' = 'number', cursorOffset?: number) => {
    if (justEvaluated && evaluation?.ok) {
      const base = kind === 'operator' ? evaluation.display : ''
      apply(insertMathText(base, base.length, base.length, text, cursorOffset))
      return
    }
    const range = selection()
    apply(insertMathText(expression, range.start, range.end, text, cursorOffset))
  }

  const insertFunction = (name: string) => {
    if (justEvaluated && evaluation?.ok) {
      apply(insertMathFunction(evaluation.display, 0, evaluation.display.length, name))
      return
    }
    const range = selection()
    apply(insertMathFunction(expression, range.start, range.end, name))
  }

  const insertReciprocal = () => {
    if (justEvaluated && evaluation?.ok) {
      apply({ value: `1/(${evaluation.display})`, cursor: evaluation.display.length + 4 })
      return
    }
    const range = selection()
    const selected = expression.slice(range.start, range.end)
    if (selected) {
      apply(insertMathText(expression, range.start, range.end, `1/(${selected})`))
    } else if (expression) {
      apply({ value: `1/(${expression})`, cursor: expression.length + 4 })
    } else {
      apply({ value: '1/()', cursor: 3 })
    }
  }

  const negate = () => {
    if (justEvaluated && evaluation?.ok) {
      apply({ value: `-(${evaluation.display})`, cursor: evaluation.display.length + 3 })
      return
    }
    const range = selection()
    const selected = expression.slice(range.start, range.end)
    if (selected) {
      apply(insertMathText(expression, range.start, range.end, `-(${selected})`))
    } else if (expression) {
      apply({ value: `-(${expression})`, cursor: expression.length + 3 })
    } else {
      insert('−', 'operator')
    }
  }

  const backspace = () => {
    const range = selection()
    apply(backspaceMathInput(expression, range.start, range.end))
  }

  const clear = () => {
    setExpression('')
    setEvaluation(null)
    setJustEvaluated(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const evaluate = () => {
    if (!expression.trim()) return
    const next = evaluateCalculatorExpression(expression, mode)
    setEvaluation(next)
    setJustEvaluated(next.ok)
    if (next.ok) {
      setHistory(previous => [
        { expression, result: next.display, mode },
        ...previous.filter(entry => entry.expression !== expression || entry.mode !== mode).slice(0, 19),
      ])
    }
  }

  const recall = (entry: HistoryEntry) => {
    setExpression(entry.expression)
    setEvaluation({ ok: true, value: Number(entry.result), display: entry.result })
    setJustEvaluated(true)
    setShowHistory(false)
    onModeChange(entry.mode)
  }

  const trig = inverse
    ? [
        { label: 'sin⁻¹', name: 'asin', aria: 'อาร์กไซน์' },
        { label: 'cos⁻¹', name: 'acos', aria: 'อาร์กโคไซน์' },
        { label: 'tan⁻¹', name: 'atan', aria: 'อาร์กแทนเจนต์' },
      ]
    : [
        { label: 'sin', name: 'sin', aria: 'ไซน์' },
        { label: 'cos', name: 'cos', aria: 'โคไซน์' },
        { label: 'tan', name: 'tan', aria: 'แทนเจนต์' },
      ]

  const keyClass = 'h-9 min-w-0 px-1 font-mono text-sm'
  const functionClass = 'h-8 min-w-0 px-1 font-mono text-xs'

  return createPortal((
    <Card
      role="dialog"
      aria-label="เครื่องคิดเลขวิทยาศาสตร์"
      elevation="xl"
      className="fixed inset-x-2 bottom-2 z-[80] max-h-[calc(100dvh-1rem)] overflow-y-auto sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[23rem]"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Calculator className="size-4 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">เครื่องคิดเลขวิทยาศาสตร์</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {targetLabel ? `เชื่อมกับ ${targetLabel}` : 'เลือกช่องคำตอบเพื่อใส่ผลลัพธ์'}
          </p>
        </div>
        <Button
          type="button"
          variant={showHistory ? 'secondary' : 'ghost'}
          size="icon-sm"
          className="ml-auto"
          onClick={() => setShowHistory(show => !show)}
          aria-label="ประวัติการคำนวณ"
          aria-pressed={showHistory}
        >
          <History />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="ปิดเครื่องคิดเลข">
          <X />
        </Button>
      </div>

      {showHistory && (
        <div className="max-h-36 space-y-1 overflow-y-auto border-b border-border bg-muted/30 p-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold text-muted-foreground">ประวัติในครั้งนี้</span>
            {history.length > 0 && (
              <Button type="button" variant="ghost" size="xs" onClick={() => setHistory([])}>
                <RotateCcw /> ล้าง
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">ยังไม่มีประวัติ</p>
          ) : history.map((entry, index) => (
            <Button
              key={`${entry.mode}:${entry.expression}:${index}`}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between gap-3 px-2 py-1 text-left font-mono text-xs"
              onClick={() => recall(entry)}
            >
              <span className="truncate">{entry.expression}</span>
              <span className="shrink-0 text-primary">= {entry.result}</span>
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-2 p-3">
        <Input
          ref={inputRef}
          value={expression}
          maxLength={1_000}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="นิพจน์ในเครื่องคิดเลข"
          placeholder="เช่น sin(30) หรือ √(9+16)"
          className="h-10 text-right font-mono"
          onChange={event => {
            setExpression(event.target.value)
            setEvaluation(null)
            setJustEvaluated(false)
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              evaluate()
            }
          }}
        />

        <div className="flex min-h-8 items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground">ผลลัพธ์</span>
          <span
            className={`truncate text-right font-mono text-lg font-semibold ${
              evaluation?.ok ? 'text-primary' : evaluation ? 'text-destructive' : 'text-muted-foreground'
            }`}
            aria-live="polite"
          >
            {evaluation?.ok ? evaluation.display : evaluation?.error ?? '—'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] text-muted-foreground">หน่วยมุม</span>
          {(['deg', 'rad'] as const).map(option => (
            <Button
              key={option}
              type="button"
              variant={mode === option ? 'secondary' : 'outline'}
              size="xs"
              aria-pressed={mode === option}
              onClick={() => {
                onModeChange(option)
                setEvaluation(null)
                setJustEvaluated(false)
              }}
            >
              {option.toUpperCase()}
            </Button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">Enter = คำนวณ</span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <Button type="button" variant={inverse ? 'secondary' : 'outline'} className={functionClass} aria-pressed={inverse} onClick={() => setInverse(value => !value)}>INV</Button>
          {trig.map(item => (
            <Button key={item.name} type="button" variant="outline" className={functionClass} aria-label={item.aria} onClick={() => insertFunction(item.name)}>{item.label}</Button>
          ))}
          <Button type="button" variant="outline" className={functionClass} onClick={() => insertFunction('log')}>log</Button>

          <Button type="button" variant="outline" className={functionClass} onClick={() => insertFunction('ln')}>ln</Button>
          <Button type="button" variant="outline" className={functionClass} aria-label="รากที่สอง" onClick={() => insertFunction('sqrt')}>√</Button>
          <Button type="button" variant="outline" className={functionClass} aria-label="รากที่สาม" onClick={() => insertFunction('cbrt')}>∛</Button>
          <Button type="button" variant="outline" className={functionClass} aria-label="ยกกำลังสอง" onClick={() => insert('^2', 'operator')}>x²</Button>
          <Button type="button" variant="outline" className={functionClass} aria-label="ยกกำลัง" onClick={() => insert('^()', 'operator', 2)}>xʸ</Button>

          <Button type="button" variant="outline" className={functionClass} onClick={insertReciprocal}>1/x</Button>
          <Button type="button" variant="outline" className={functionClass} onClick={() => insertFunction('abs')}>abs</Button>
          <Button type="button" variant="outline" className={functionClass} onClick={() => insertFunction('exp')}>eˣ</Button>
          <Button type="button" variant="outline" className={functionClass} aria-label="แฟกทอเรียล" onClick={() => insert('!', 'operator')}>x!</Button>
          <Button type="button" variant="outline" className={functionClass} aria-label="เปอร์เซ็นต์" onClick={() => insert('/100', 'operator')}>%</Button>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <Button type="button" variant="secondary" className={keyClass} onClick={() => insert('(', 'constant')}>(</Button>
          <Button type="button" variant="secondary" className={keyClass} onClick={() => insert(')', 'operator')}>)</Button>
          <Button type="button" variant="secondary" className={keyClass} onClick={() => insert('π', 'constant')}>π</Button>
          <Button type="button" variant="secondary" className={keyClass} onClick={() => insert('e', 'constant')}>e</Button>

          {['7', '8', '9'].map(number => <Button key={number} type="button" variant="outline" className={keyClass} onClick={() => insert(number)}>{number}</Button>)}
          <Button type="button" variant="secondary" className={keyClass} aria-label="หาร" onClick={() => insert('÷', 'operator')}>÷</Button>
          {['4', '5', '6'].map(number => <Button key={number} type="button" variant="outline" className={keyClass} onClick={() => insert(number)}>{number}</Button>)}
          <Button type="button" variant="secondary" className={keyClass} aria-label="คูณ" onClick={() => insert('×', 'operator')}>×</Button>
          {['1', '2', '3'].map(number => <Button key={number} type="button" variant="outline" className={keyClass} onClick={() => insert(number)}>{number}</Button>)}
          <Button type="button" variant="secondary" className={keyClass} aria-label="ลบ" onClick={() => insert('−', 'operator')}>−</Button>
          <Button type="button" variant="outline" className={keyClass} onClick={negate}>+/−</Button>
          <Button type="button" variant="outline" className={keyClass} onClick={() => insert('0')}>0</Button>
          <Button type="button" variant="outline" className={keyClass} onClick={() => insert('.')}>.</Button>
          <Button type="button" variant="secondary" className={keyClass} aria-label="บวก" onClick={() => insert('+', 'operator')}>+</Button>

          <Button type="button" variant="destructive" className={keyClass} onClick={clear}>AC</Button>
          <Button type="button" variant="outline" className={keyClass} aria-label="ลบหนึ่งตัว" onClick={backspace}><Delete /></Button>
          <Button type="button" className={`${keyClass} col-span-2`} onClick={evaluate}>=</Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!evaluation?.ok || !targetLabel}
          onClick={() => evaluation?.ok && onInsertResult(evaluation.display)}
        >
          ใส่ผลลัพธ์ในคำตอบ
        </Button>
      </div>
    </Card>
  ), document.body)
}

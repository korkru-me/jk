'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { liveCalculate } from '@/lib/math/evaluator'
import type { Variable } from '@/lib/types'

interface MethodBuilderProps {
  variables: Variable[]
  value: string
  unit: string
  onChange: (formula: string) => void
}

const OPERATORS = ['+', '-', '×', '÷', '^', '√']
const GROUPING = ['(', ')']
const FUNCTIONS = ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt']
const CONSTANTS = ['pi', 'g', 'e']
const CONST_VALUES: Record<string, string> = { pi: 'π', g: '9.8', e: 'e' }
const OP_MAP: Record<string, string> = { '×': '*', '÷': '/' , '√': 'sqrt(' }

export function MethodBuilder({ variables, value, unit, onChange }: MethodBuilderProps) {
  const [tokens, setTokens] = useState<string[]>([])
  const [liveResult, setLiveResult] = useState<number | string>('')

  const valueVars = variables.filter((v) => v.type !== 'reference')

  useEffect(() => {
    const formula = tokens.join('')
    if (tokens.length === 0) {
      setLiveResult('')
      onChange('')
      return
    }
    setLiveResult(liveCalculate(formula, variables))
    onChange(formula)
    // onChange and variables are stable refs — intentionally excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens])

  function push(token: string) {
    setTokens((prev) => {
      const mapped = OP_MAP[token] ?? token
      return [...prev, mapped]
    })
  }

  function backspace() {
    setTokens((prev) => prev.slice(0, -1))
  }

  function clear() {
    setTokens([])
    setLiveResult('')
    onChange('')
  }

  const formula = tokens.join('')
  const isValid = typeof liveResult === 'number'

  return (
    <div className="space-y-4">
      {/* Display */}
      <div className="space-y-1.5">
        <Label>สูตรที่สร้าง:</Label>
        <div className="min-h-12 p-3 border rounded-lg bg-muted font-mono text-sm break-all">
          {formula || <span className="text-muted-foreground">กดปุ่มด้านล่างเพื่อสร้างสูตร</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={backspace}
            disabled={tokens.length === 0}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
          >
            ⌫ ลบ
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={tokens.length === 0}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-destructive/10 hover:border-destructive/20 hover:text-destructive disabled:opacity-40 transition-colors"
          >
            ✕ ล้าง
          </button>
        </div>
      </div>

      {/* Variable buttons */}
      {valueVars.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ตัวแปรของคุณ (จากที่ตั้งไว้):</Label>
          <div className="flex flex-wrap gap-2">
            {valueVars.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => push(v.name)}
                className="px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/10 text-blue-800 text-sm font-mono hover:bg-primary/10 transition-colors"
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Operators */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">เครื่องหมาย:</Label>
        <div className="flex flex-wrap gap-2">
          {[...OPERATORS, ...GROUPING].map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => push(op)}
              className="w-10 h-10 rounded-lg border border-border bg-card text-foreground font-mono hover:bg-muted hover:border-gray-400 transition-colors"
            >
              {op}
            </button>
          ))}
          {['0','1','2','3','4','5','6','7','8','9','.'].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => push(n)}
              className="w-10 h-10 rounded-lg border border-border bg-card text-muted-foreground font-mono hover:bg-muted transition-colors"
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Functions */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">ฟังก์ชัน:</Label>
        <div className="flex flex-wrap gap-2">
          {FUNCTIONS.map((fn) => (
            <button
              key={fn}
              type="button"
              onClick={() => push(fn === 'sqrt' ? 'sqrt(' : `${fn}(`)}
              className="px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-800 text-sm font-mono hover:bg-purple-100 transition-colors"
            >
              {fn}(
            </button>
          ))}
        </div>
      </div>

      {/* Constants */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">ค่าคงที่:</Label>
        <div className="flex flex-wrap gap-2">
          {CONSTANTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => push(CONST_VALUES[c] === 'π' ? 'pi' : CONST_VALUES[c])}
              className="px-3 py-1.5 rounded-lg border border-warning/20 bg-warning/10 text-amber-800 text-sm font-mono hover:bg-warning/10 transition-colors"
            >
              {CONST_VALUES[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      {formula && (
        <div className="p-3 border rounded-lg bg-muted">
          <p className="text-xs text-muted-foreground mb-1">🔴 Live Preview (ค่ากลาง):</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{formula}</span>
            <span className="text-muted-foreground">=</span>
            <span className={`font-mono font-bold ${isValid ? 'text-success' : 'text-destructive'}`}>
              {isValid ? String(liveResult) : 'สูตรไม่ถูกต้อง'}
            </span>
            {unit && isValid && <span className="text-muted-foreground text-sm">{unit}</span>}
          </div>
        </div>
      )}

    </div>
  )
}

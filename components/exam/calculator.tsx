'use client'

import { useState, useCallback } from 'react'
import { X, Delete, History, RotateCcw } from 'lucide-react'

interface CalculatorProps {
  onClose: () => void
}

type AngleMode = 'DEG' | 'RAD'

// ─── Rule-based expression evaluator (no AI, no eval-free alternative) ────────
function safeEval(expr: string, mode: AngleMode): string {
  try {
    const DEG = Math.PI / 180
    const toRad = mode === 'DEG' ? DEG : 1
    const fromRad = mode === 'DEG' ? 1 / DEG : 1

    /* eslint-disable no-new-func */
    const fn = new Function(
      'Math', 'PI', 'E', 'toRad', 'fromRad',
      `"use strict";
       const sin  = x => Math.sin(x * toRad);
       const cos  = x => Math.cos(x * toRad);
       const tan  = x => Math.tan(x * toRad);
       const asin = x => Math.asin(x) * fromRad;
       const acos = x => Math.acos(x) * fromRad;
       const atan = x => Math.atan(x) * fromRad;
       const log  = x => Math.log10(x);
       const ln   = x => Math.log(x);
       const sqrt = x => Math.sqrt(x);
       const abs  = x => Math.abs(x);
       const pow  = (x,n) => Math.pow(x,n);
       return (${expr});`
    )
    /* eslint-enable no-new-func */

    const result: unknown = fn(Math, Math.PI, Math.E, toRad, fromRad)
    if (typeof result !== 'number' || !isFinite(result) || isNaN(result)) return 'Error'

    if (Number.isInteger(result) && Math.abs(result) < 1e13) return String(result)
    if (Math.abs(result) >= 1e10 || (Math.abs(result) < 1e-6 && result !== 0)) {
      return result.toExponential(6)
    }
    return parseFloat(result.toPrecision(10)).toString()
  } catch {
    return 'Error'
  }
}

function formatDisplay(s: string): string {
  return s
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
}

const BTN_BASE = 'flex items-center justify-center rounded-xl text-sm font-semibold h-10 transition-all active:scale-95 select-none cursor-pointer'
const BTN_NUM = `${BTN_BASE} bg-muted hover:bg-muted/80 text-foreground`
const BTN_OP  = `${BTN_BASE} bg-primary/15 hover:bg-primary/25 text-primary`
const BTN_FN  = `${BTN_BASE} bg-muted/60 hover:bg-muted text-foreground/80 text-xs`
const BTN_EQ  = `${BTN_BASE} bg-primary hover:bg-primary/90 text-white col-span-2`
const BTN_CLR = `${BTN_BASE} bg-destructive/15 hover:bg-destructive/25 text-destructive`

export function Calculator({ onClose }: CalculatorProps) {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState('')
  const [mode, setMode] = useState<AngleMode>('DEG')
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [justEvaled, setJustEvaled] = useState(false)

  const append = useCallback((s: string) => {
    setExpr(prev => {
      if (justEvaled && /[\d\.(]/.test(s)) { setJustEvaled(false); return s }
      setJustEvaled(false)
      return prev + s
    })
    setResult('')
  }, [justEvaled])

  const appendFn = useCallback((fn: string) => {
    setExpr(prev => prev + fn + '(')
    setJustEvaled(false)
    setResult('')
  }, [])

  const backspace = useCallback(() => {
    setExpr(prev => prev.slice(0, -1))
    setResult('')
  }, [])

  const clear = useCallback(() => {
    setExpr('')
    setResult('')
    setJustEvaled(false)
  }, [])

  const evaluate = useCallback(() => {
    if (!expr.trim()) return
    // preprocess: replace display chars back to operators
    const clean = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'PI').replace(/e(?!\d)/g, 'E')
    const res = safeEval(clean, mode)
    const entry = `${formatDisplay(expr)} = ${res}`
    setHistory(prev => [entry, ...prev.slice(0, 19)])
    setResult(res)
    if (res !== 'Error') {
      setExpr(res)
      setJustEvaled(true)
    }
  }, [expr, mode])

  const squareRoot = () => appendFn('sqrt')
  const square = () => append('**2')
  const power = () => append('**')
  const inverse = () => {
    if (expr) {
      setExpr(`1/(${expr})`)
    }
  }
  const negate = () => {
    if (expr.startsWith('-')) setExpr(expr.slice(1))
    else setExpr(`-(${expr})`)
  }

  const fromHistory = (entry: string) => {
    const res = entry.split(' = ').pop() ?? ''
    setExpr(res)
    setResult('')
    setShowHistory(false)
  }

  return (
    <div className="w-72 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">เครื่องคิดเลขวิทยาศาสตร์</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            title="ประวัติการคำนวณ"
          >
            <History size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b max-h-36 overflow-y-auto bg-muted/20 px-3 py-2 space-y-1">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">ยังไม่มีประวัติ</p>
          ) : history.map((h, i) => (
            <button
              key={i}
              onClick={() => fromHistory(h)}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground font-mono truncate hover:bg-muted/50 px-1.5 py-0.5 rounded"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Display */}
      <div className="px-4 py-3 bg-muted/10">
        <div className="text-right min-h-[20px]">
          <p className="text-xs text-muted-foreground font-mono truncate" title={formatDisplay(expr)}>
            {formatDisplay(expr) || '0'}
          </p>
        </div>
        <div className="text-right mt-1">
          <p className={`text-2xl font-black font-mono truncate ${
            result === 'Error' ? 'text-destructive' : result ? 'text-primary' : 'text-muted-foreground/40'
          }`}>
            {result || '—'}
          </p>
        </div>
      </div>

      {/* Keypad */}
      <div className="p-2 space-y-1.5">
        {/* Mode + Clear row */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => setMode(m => m === 'DEG' ? 'RAD' : 'DEG')}
            className={`${BTN_FN} text-[10px] font-bold rounded-xl h-8 col-span-1 ${
              mode === 'DEG' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning'
            }`}
          >
            {mode}
          </button>
          <button onClick={negate} className={`${BTN_FN} h-8`}>+/-</button>
          <button onClick={backspace} className={`${BTN_CLR} h-8`}><Delete size={13} /></button>
          <button onClick={clear} className={`${BTN_CLR} h-8 text-xs`}>AC</button>
        </div>

        {/* Scientific row 1 */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: 'sin',  action: () => appendFn('sin') },
            { label: 'cos',  action: () => appendFn('cos') },
            { label: 'tan',  action: () => appendFn('tan') },
            { label: 'log',  action: () => appendFn('log') },
            { label: 'ln',   action: () => appendFn('ln') },
          ].map(b => (
            <button key={b.label} onClick={b.action} className={BTN_FN}>{b.label}</button>
          ))}
        </div>

        {/* Scientific row 2 */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: '√',   action: squareRoot },
            { label: 'x²',  action: square },
            { label: 'xⁿ',  action: power },
            { label: '1/x', action: inverse },
            { label: 'abs', action: () => appendFn('abs') },
          ].map(b => (
            <button key={b.label} onClick={b.action} className={BTN_FN}>{b.label}</button>
          ))}
        </div>

        {/* Main keypad */}
        <div className="grid grid-cols-4 gap-1.5">
          <button onClick={() => append('(')} className={BTN_FN}>(</button>
          <button onClick={() => append(')')} className={BTN_FN}>)</button>
          <button onClick={() => append('PI')} className={BTN_FN}>π</button>
          <button onClick={() => append('E')}  className={BTN_FN}>e</button>

          <button onClick={() => append('7')} className={BTN_NUM}>7</button>
          <button onClick={() => append('8')} className={BTN_NUM}>8</button>
          <button onClick={() => append('9')} className={BTN_NUM}>9</button>
          <button onClick={() => append('/')} className={BTN_OP}>÷</button>

          <button onClick={() => append('4')} className={BTN_NUM}>4</button>
          <button onClick={() => append('5')} className={BTN_NUM}>5</button>
          <button onClick={() => append('6')} className={BTN_NUM}>6</button>
          <button onClick={() => append('*')} className={BTN_OP}>×</button>

          <button onClick={() => append('1')} className={BTN_NUM}>1</button>
          <button onClick={() => append('2')} className={BTN_NUM}>2</button>
          <button onClick={() => append('3')} className={BTN_NUM}>3</button>
          <button onClick={() => append('-')} className={BTN_OP}>−</button>

          <button onClick={() => append('0')} className={BTN_NUM}>0</button>
          <button onClick={() => append('.')} className={BTN_NUM}>.</button>
          <button onClick={evaluate}         className={`${BTN_EQ}`}>=</button>
          <button onClick={() => append('+')} className={BTN_OP}>+</button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { SelectField } from './select-field'
import { detectAnswerVar, extractRHS, parseVarsFromEquation } from './shared'
import { Input } from '@/components/ui/input'
import { useEffect, useRef, useState } from 'react'
import type { PresetWithCat } from './shared'
import { Card } from '@/components/ui/card'

// ─── SubEquationPicker ────────────────────────────────────────────────────────
// Lighter equation picker for sub questions — derives formula only, no variable management.

export function SubEquationPicker({
  presets, mainVarNames, partIndex, labels, onFormulaChange, initialEquationText, onEquationTextChange,
}: {
  presets: PresetWithCat[]
  mainVarNames: string[]
  partIndex: number  // index in answerParts (1 = second label, 2 = third, ...)
  labels: string[]
  onFormulaChange: (formula: string) => void
  initialEquationText?: string
  onEquationTextChange?: (text: string) => void
}) {
  const [selPresetId, setSelPresetId] = useState('')
  const [equationText, setEquationText] = useState(initialEquationText ?? '')
  const [allVarNames, setAllVarNames] = useState<string[]>([])
  const [answerVarName, setAnswerVarName] = useState<string | null>(null)
  const [derivedFormula, setDerivedFormula] = useState('')
  const [solving, setSolving] = useState(false)
  const [solveError, setSolveError] = useState('')
  const equationInputRef = useRef<HTMLInputElement>(null)

  // prev answer variable names: ans0, ans1, ... ans_{partIndex-1}
  const prevAnswerNames = Array.from({ length: partIndex }, (_, i) => `ans${i}`)

  function insertIntoEquation(text: string) {
    const input = equationInputRef.current
    if (!input) return
    const start = input.selectionStart ?? equationText.length
    const end = input.selectionEnd ?? start
    const next = equationText.slice(0, start) + text + equationText.slice(end)
    handleEquationInput(next)
    setTimeout(() => {
      input.setSelectionRange(start + text.length, start + text.length)
      input.focus()
    }, 0)
  }

  function applyEquation(eq: string) {
    const defaultAnswer = detectAnswerVar(eq)
    const rhs = extractRHS(eq)
    // exclude ans0, ans1,... from answer var candidates (they're prev-answer refs, not solvable)
    const vars = parseVarsFromEquation(eq).filter(n => !/^ans\d+$/.test(n))
    setAllVarNames(vars)
    setAnswerVarName(defaultAnswer && !/^ans\d+$/.test(defaultAnswer) ? defaultAnswer : (vars[0] ?? null))
    setDerivedFormula(rhs)
    setSolveError('')
    onFormulaChange(rhs)
  }

  useEffect(() => {
    if (!initialEquationText) return
    applyEquation(initialEquationText)
  }, [initialEquationText])

  useEffect(() => {
    if (!onEquationTextChange) return
    if (answerVarName && derivedFormula) {
      onEquationTextChange(`${answerVarName} = ${derivedFormula}`)
    } else if (equationText) {
      onEquationTextChange(equationText)
    }
  }, [answerVarName, derivedFormula, equationText])

  async function selectAnswerVar(varName: string) {
    if (varName === answerVarName || !equationText.trim()) return
    setSolving(true)
    setSolveError('')
    try {
      const nerdamer = (await import('nerdamer/all')).default as any
      const raw = nerdamer.solve(equationText, varName).toString()
      const formula = raw.replace(/\[|\]/g, '').split(',')[0].trim()
      if (!formula) throw new Error('no solution')
      setAnswerVarName(varName)
      setDerivedFormula(formula)
      onFormulaChange(formula)
    } catch {
      setSolveError(`ไม่สามารถแก้สมการหา {${varName}} ได้`)
    } finally {
      setSolving(false)
    }
  }

  function handlePresetChange(id: string) {
    setSelPresetId(id)
    const p = presets.find(pr => pr.id === id)
    if (p) { setEquationText(p.equation); applyEquation(p.equation) }
  }

  function handleEquationInput(eq: string) {
    setEquationText(eq)
    if (selPresetId) setSelPresetId('')
    applyEquation(eq)
  }

  return (
    <Card radius="md" elevation="sm" className="overflow-hidden">
      <div className="p-4 space-y-3">
        <SelectField
          label="สมการสำเร็จรูป"
          value={selPresetId}
          onChange={handlePresetChange}
          placeholder="-- เลือกสมการ --"
          options={presets.map(p => ({ value: p.id, label: `${p.formula_name}  (${p.equation})` }))}
        />

        {/* Previous answer chips — insert ans0, ans1, ... into equation */}
        {prevAnswerNames.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-warning font-semibold">
              คำตอบจากข้อก่อนหน้า (กดเพื่อแทรกในสมการ)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {prevAnswerNames.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertIntoEquation(name)}
                  className="font-mono text-xs px-2.5 py-1 rounded-lg border-2 border-warning/20 bg-warning/10 text-warning font-bold hover:bg-warning/10 transition-colors"
                >
                  {name}
                  <span className="ml-1.5 font-normal text-warning text-[10px]">คำตอบ {labels[i]})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">สมการ</p>
          <Input
            ref={equationInputRef}
            value={equationText}
            onChange={e => handleEquationInput(e.target.value)}
            placeholder="เช่น F = m * a"
            className="h-9 text-sm font-mono"
          />
          <p className="text-[11px] text-primary">สามารถพิมพ์หรือปรับแก้สมการในช่องนี้ได้โดยตรง</p>
          {mainVarNames.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              ตัวแปรที่มีจากโจทย์หลัก: <span className="font-mono">{mainVarNames.join(', ')}</span>
            </p>
          )}
        </div>

        {equationText.trim() && allVarNames.length > 0 && (
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                เลือกตัวแปรที่ต้องการหา (คำตอบ)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allVarNames.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectAnswerVar(name)}
                    disabled={solving}
                    className={`font-mono text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all disabled:opacity-60 ${
                      name === answerVarName
                        ? 'bg-success text-success-foreground border-success shadow-md'
                        : 'bg-card text-muted-foreground border-border hover:border-success hover:text-success hover:bg-success/10'
                    }`}
                  >
                    {'{' + name + '}'}
                    {name === answerVarName && <span className="ml-1.5 text-[10px] font-normal opacity-90">= คำตอบ</span>}
                  </button>
                ))}
              </div>
              {solving && <p className="text-xs text-primary mt-1.5">⏳ กำลังแก้สมการ...</p>}
              {solveError && <p className="text-xs text-destructive mt-1.5">{solveError}</p>}
            </div>

            {answerVarName && derivedFormula && (
              <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-xl">
                <span className="font-mono font-bold text-success text-sm">{'{' + answerVarName + '}'}</span>
                <span className="text-success">=</span>
                <span className="font-mono text-success text-sm font-medium flex-1 truncate">{derivedFormula}</span>
                <span className="text-[10px] text-success shrink-0">คำนวณอัตโนมัติ</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

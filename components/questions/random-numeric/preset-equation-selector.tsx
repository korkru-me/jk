'use client'

import { SavePresetControl } from './save-preset-control'
import { detectAnswerVar, extractRHS, parseVarsFromEquation } from './shared'
import { VarList } from './var-list'
import { Input } from '@/components/ui/input'
import { useEffect, useMemo, useState } from 'react'
import type { PresetWithCat } from './shared'
import type { LogicRule, Variable } from '@/lib/types'
import { Card } from '@/components/ui/card'

// ─── PresetEquationSelector ───────────────────────────────────────────────────

export function normalizeEq(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

export function PresetEquationSelector({
  presets, variables, onVariablesChange, onFormulaChange,
  logicRules, onLogicRulesChange, onPresetCreated, initialEquationText, onEquationTextChange,
}: {
  presets: PresetWithCat[]
  variables: Variable[]
  onVariablesChange: (v: Variable[]) => void
  onFormulaChange: (formula: string) => void
  logicRules: LogicRule[]
  onLogicRulesChange: (r: LogicRule[]) => void
  onPresetCreated: (p: PresetWithCat) => void
  initialEquationText?: string
  onEquationTextChange?: (text: string) => void
}) {
  const [selPresetId, setSelPresetId] = useState('')
  const [equationText, setEquationText] = useState('')
  const [allVarNames, setAllVarNames] = useState<string[]>([])
  const [answerVarName, setAnswerVarName] = useState<string | null>(null)
  const [derivedFormula, setDerivedFormula] = useState('')
  const [solving, setSolving] = useState(false)
  const [solveError, setSolveError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  function applyEquation(eq: string, forceAnswerVar?: string) {
    const defaultAnswer = detectAnswerVar(eq)
    const rhs = extractRHS(eq)
    const vars = parseVarsFromEquation(eq)

    const chosenAnswer = forceAnswerVar ?? defaultAnswer
    setAllVarNames(vars)
    setAnswerVarName(chosenAnswer)
    setDerivedFormula(rhs)
    setSolveError('')

    const inputVarNames = vars.filter(n => n !== chosenAnswer)
    onFormulaChange(rhs)
    const existingMap = new Map(variables.map(v => [v.name, v]))
    onVariablesChange(inputVarNames.map(n => existingMap.get(n) ?? { name: n, min: 1, max: 10, step: 1 }))
  }

  useEffect(() => {
    if (!initialEquationText) return
    setEquationText(initialEquationText)
    applyEquation(initialEquationText, detectAnswerVar(initialEquationText) ?? variables.find(v => v.is_answer)?.name)
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

      const inputVarNames = allVarNames.filter(n => n !== varName)
      const existingMap = new Map(variables.map(v => [v.name, v]))
      onVariablesChange(inputVarNames.map(n => existingMap.get(n) ?? { name: n, min: 1, max: 10, step: 1 }))
    } catch {
      setSolveError(`ไม่สามารถแก้สมการหา {${varName}} ได้ — ลองสลับตัวแปรอื่น หรือป้อนสมการใหม่`)
    } finally {
      setSolving(false)
    }
  }

  function handlePresetChange(id: string) {
    setSelPresetId(id)
    setShowSuggestions(false)
    const p = presets.find(pr => pr.id === id)
    if (p) {
      setEquationText(p.equation)
      applyEquation(p.equation)
    }
  }

  function handleEquationInput(eq: string) {
    setEquationText(eq)
    setShowSuggestions(true)
    if (selPresetId) setSelPresetId('')
    applyEquation(eq)
  }

  const selectedPreset = presets.find(p => p.id === selPresetId) ?? null

  // Suggestions: presets whose variables overlap with what's typed, or whose
  // equation/name text contains what's typed — only shown once the user types something.
  const matches = useMemo(() => {
    const typed = equationText.trim()
    if (!typed) return []
    const typedVars = new Set(parseVarsFromEquation(typed))
    const typedNorm = normalizeEq(typed)
    const scored = presets
      .map(p => {
        const presetVars = parseVarsFromEquation(p.equation)
        const overlap = presetVars.filter(v => typedVars.has(v)).length
        const substr = normalizeEq(p.equation).includes(typedNorm) || normalizeEq(p.formula_name).includes(typedNorm)
        return { preset: p, score: overlap * 10 + (substr ? 1 : 0), overlap, substr }
      })
      .filter(s => s.overlap > 0 || s.substr)
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 6).map(s => s.preset)
  }, [equationText, presets])

  const exactMatch = presets.some(p => normalizeEq(p.equation) === normalizeEq(equationText))

  return (
    <Card radius="md" elevation="sm" className="overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">สมการ</p>
          <div className="relative">
            <Input
              value={equationText}
              onChange={e => handleEquationInput(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="พิมพ์สมการของคุณเอง เช่น F = m * a   หรือ   v = u + a * t"
              className="h-9 text-sm font-mono"
            />
            {showSuggestions && matches.length > 0 && (
              <Card radius="sm" elevation="lg" className="absolute z-10 top-full left-0 mt-1 w-full overflow-hidden max-h-60 overflow-y-auto">
                {matches.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handlePresetChange(p.id)}
                    className="w-full text-left px-3 py-2 hover:bg-primary/10 border-b border-border last:border-b-0 transition-colors"
                  >
                    <p className="text-sm font-semibold text-foreground">{p.formula_name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{p.equation}</p>
                  </button>
                ))}
              </Card>
            )}
          </div>
          <p className="text-[11px] text-primary">
            พิมพ์สมการเองได้เลย — ถ้าตรงกับสมการในคลัง ระบบจะแสดงให้เลือกอัตโนมัติ
          </p>
          {selectedPreset?.description && (
            <p className="text-xs text-muted-foreground">{selectedPreset.description}</p>
          )}
        </div>

        {equationText.trim() && allVarNames.length > 0 && (
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                เลือกตัวแปรที่ต้องการหา (คำตอบ)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allVarNames.map(name => {
                  const isAns = name === answerVarName
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectAnswerVar(name)}
                      disabled={solving}
                      className={`font-mono text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all duration-150 disabled:opacity-60 ${
                        isAns
                          ? 'bg-success text-success-foreground border-success shadow-md'
                          : 'bg-card text-muted-foreground border-border hover:border-success hover:text-success hover:bg-success/10'
                      }`}
                    >
                      {'{' + name + '}'}
                      {isAns && <span className="ml-1.5 text-[10px] font-normal opacity-90">= คำตอบ</span>}
                    </button>
                  )
                })}
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

            {answerVarName && derivedFormula && !exactMatch && (
              <SavePresetControl
                equation={equationText}
                targetVariable={answerVarName}
                variables={variables}
                onSaved={p => { onPresetCreated(p); setSelPresetId(p.id) }}
              />
            )}
          </div>
        )}
      </div>

      {variables.length > 0 && (
        <div className="border-t p-4">
          <VarList
            variables={variables}
            onChange={onVariablesChange}
            logicRules={logicRules}
            onLogicRulesChange={onLogicRulesChange}
          />
        </div>
      )}
    </Card>
  )
}

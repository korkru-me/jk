'use client'

import { ValueCard } from './value-card'
import { Info } from 'lucide-react'
import type { LogicRule, Variable } from '@/lib/types'

// ─── VarList ──────────────────────────────────────────────────────────────────

export function VarList({ variables, onChange, logicRules, onLogicRulesChange, onSetAnswer }: {
  variables: Variable[]
  onChange: (v: Variable[]) => void
  logicRules: LogicRule[]
  onLogicRulesChange: (r: LogicRule[]) => void
  onSetAnswer?: (name: string | null) => void
}) {
  if (variables.length === 0) return null

  function onUpdate(i: number, field: keyof Variable, val: string | boolean | number) {
    const numFields = ['min', 'max', 'step', 'constant_value'] as (keyof Variable)[]
    onChange(variables.map((v, idx) => {
      if (idx !== i) return v
      if (typeof val === 'boolean') return { ...v, [field]: val }
      if (numFields.includes(field)) return { ...v, [field]: Number(val) }
      return { ...v, [field]: val }
    }))
  }

  function onRemove(i: number) {
    const removed = variables[i]
    onLogicRulesChange(logicRules.filter(r => r.lhs !== removed.name))
    onChange(variables.filter((_, ii) => ii !== i))
  }

  const hasRandom = variables.some(v => !v.is_constant && !v.is_answer)

  return (
    <div className="space-y-2 pt-1">
      {hasRandom && (
        <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-primary leading-relaxed">
            <span className="font-semibold">ขนาดก้าว</span>{' '}
            คือระยะห่างระหว่างค่าที่จะสุ่ม เช่น ต่ำสุด=9, สูงสุด=10, ขนาดก้าว=0.2 → 9, 9.2, 9.4, 9.6, 9.8, 10
          </p>
        </div>
      )}
      {variables.map((v, i) => (
        <ValueCard
          key={v.name}
          v={v}
          index={i}
          onUpdate={onUpdate}
          onRemove={onRemove}
          logicRules={logicRules}
          onLogicRulesChange={onLogicRulesChange}
          allVariables={variables}
          onSetAnswer={onSetAnswer}
        />
      ))}
    </div>
  )
}

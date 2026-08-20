'use client'

import { OPERATORS } from './shared'
import { Input } from '@/components/ui/input'
import { Plus, X } from 'lucide-react'
import type { LogicOperator, LogicRule, Variable } from '@/lib/types'

// ─── InlineConditionPanel ─────────────────────────────────────────────────────

export function InlineConditionPanel({ varName, allVars, rules, onRulesChange }: {
  varName: string
  allVars: Variable[]
  rules: LogicRule[]
  onRulesChange: (r: LogicRule[]) => void
}) {
  const myRules = rules.filter(r => r.lhs === varName)
  const otherVarNames = allVars
    .filter(v => v.type !== 'reference' && !v.is_answer && v.name !== varName)
    .map(v => v.name)

  function addRule() {
    onRulesChange([...rules, {
      id: crypto.randomUUID(),
      lhs: varName,
      operator: '<',
      rhs_type: otherVarNames.length > 0 ? 'variable' : 'constant',
      rhs_variable: otherVarNames[0] ?? '',
      rhs_constant: 0,
    }])
  }

  function removeRule(id: string) {
    onRulesChange(rules.filter(r => r.id !== id))
  }

  function updateRule(id: string, patch: Partial<LogicRule>) {
    onRulesChange(rules.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  return (
    <div className="mt-1.5 pt-2 border-t border-border space-y-1.5">
      {myRules.map(rule => (
        <div key={rule.id} className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 shrink-0">
            {varName}
          </span>

          <select
            value={rule.operator}
            onChange={e => updateRule(rule.id, { operator: e.target.value as LogicOperator })}
            className="h-6 text-xs border border-border rounded px-1 bg-card focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>

          <div className="flex rounded border border-border overflow-hidden text-[10px] shrink-0">
            <button
              type="button"
              onClick={() => updateRule(rule.id, { rhs_type: 'variable' })}
              className={`px-2 py-1 font-medium transition-colors ${rule.rhs_type === 'variable' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              ตัวแปร
            </button>
            <button
              type="button"
              onClick={() => updateRule(rule.id, { rhs_type: 'constant' })}
              className={`px-2 py-1 font-medium transition-colors ${rule.rhs_type === 'constant' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              ค่า
            </button>
          </div>

          {rule.rhs_type === 'variable' ? (
            <select
              value={rule.rhs_variable}
              onChange={e => updateRule(rule.id, { rhs_variable: e.target.value })}
              className="h-6 text-xs border border-border rounded px-1 bg-card font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- ตัวแปร --</option>
              {otherVarNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <Input
              type="number"
              value={rule.rhs_constant}
              onChange={e => updateRule(rule.id, { rhs_constant: Number(e.target.value) })}
              className="h-6 w-16 text-xs px-1.5"
            />
          )}

          <button
            type="button"
            onClick={() => removeRule(rule.id)}
            className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary font-medium transition-colors"
      >
        <Plus className="w-3 h-3" /> เพิ่มเงื่อนไข
      </button>

      {myRules.length > 0 && (
        <p className="text-[10px] text-muted-foreground">ระบบจะสุ่มค่าใหม่ถ้าไม่ตรงเงื่อนไข (สูงสุด 100 ครั้ง)</p>
      )}
    </div>
  )
}

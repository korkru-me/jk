'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X } from 'lucide-react'
import type { LogicRule, LogicOperator, Variable } from '@/lib/types'

interface Props {
  rules: LogicRule[]
  variables: Variable[]
  onChange: (rules: LogicRule[]) => void
}

const OPERATORS: { value: LogicOperator; label: string }[] = [
  { value: '<',  label: '<'  },
  { value: '>',  label: '>'  },
  { value: '<=', label: '≤'  },
  { value: '>=', label: '≥'  },
  { value: '!=', label: '≠'  },
]

function newRule(): LogicRule {
  return {
    id: crypto.randomUUID(),
    lhs: '',
    operator: '<',
    rhs_type: 'variable',
    rhs_variable: '',
    rhs_constant: 0,
  }
}

export function LogicRuleBuilder({ rules, variables, onChange }: Props) {
  const varNames = variables.filter(v => v.type !== 'reference').map(v => v.name)

  function addRule() {
    onChange([...rules, newRule()])
  }

  function removeRule(id: string) {
    onChange(rules.filter(r => r.id !== id))
  }

  function updateRule(id: string, patch: Partial<LogicRule>) {
    onChange(rules.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-2 flex-wrap">
          {/* LHS variable */}
          <Select
            value={rule.lhs || undefined}
            onValueChange={(v) => updateRule(rule.id, { lhs: v ?? '' })}
          >
            <SelectTrigger className="w-24 h-8 text-sm font-mono">
              <SelectValue placeholder="ตัวแปร" />
            </SelectTrigger>
            <SelectContent>
              {varNames.map(n => (
                <SelectItem key={n} value={n} className="font-mono">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Operator */}
          <Select
            value={rule.operator}
            onValueChange={(v) => updateRule(rule.id, { operator: (v ?? '<') as LogicOperator })}
          >
            <SelectTrigger className="w-16 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map(op => (
                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* RHS type toggle */}
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => updateRule(rule.id, { rhs_type: 'variable' })}
              className={`px-2 py-1.5 font-medium transition-colors ${
                rule.rhs_type === 'variable'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              ตัวแปร
            </button>
            <button
              type="button"
              onClick={() => updateRule(rule.id, { rhs_type: 'constant' })}
              className={`px-2 py-1.5 font-medium transition-colors ${
                rule.rhs_type === 'constant'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              ค่าคงที่
            </button>
          </div>

          {/* RHS value */}
          {rule.rhs_type === 'variable' ? (
            <Select
              value={rule.rhs_variable || undefined}
              onValueChange={(v) => updateRule(rule.id, { rhs_variable: v ?? '' })}
            >
              <SelectTrigger className="w-24 h-8 text-sm font-mono">
                <SelectValue placeholder="ตัวแปร" />
              </SelectTrigger>
              <SelectContent>
                {varNames.map(n => (
                  <SelectItem key={n} value={n} className="font-mono">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type="number"
              value={rule.rhs_constant}
              onChange={(e) => updateRule(rule.id, { rhs_constant: Number(e.target.value) })}
              className="w-24 h-8 text-sm"
            />
          )}

          {/* Remove button */}
          <button
            type="button"
            onClick={() => removeRule(rule.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addRule}>
        <Plus className="w-3.5 h-3.5 mr-1" />
        เพิ่มเงื่อนไข
      </Button>

      {rules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          ระบบจะสุ่มค่าใหม่ถ้าไม่ตรงเงื่อนไข (สูงสุด 100 ครั้ง)
        </p>
      )}
    </div>
  )
}

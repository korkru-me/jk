'use client'

import { InlineConditionPanel } from './inline-condition-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronRight, Target } from 'lucide-react'
import { useState } from 'react'
import type { LogicRule, Variable } from '@/lib/types'

// ─── ValueCard ────────────────────────────────────────────────────────────────

export function ValueCard({ v, index, onUpdate, onRemove, logicRules, onLogicRulesChange, allVariables, onSetAnswer }: {
  v: Variable; index: number
  onUpdate: (i: number, f: keyof Variable, val: string | boolean | number) => void
  onRemove: (i: number) => void
  logicRules: LogicRule[]
  onLogicRulesChange: (r: LogicRule[]) => void
  allVariables: Variable[]
  onSetAnswer?: (name: string | null) => void
}) {
  const [showConditions, setShowConditions] = useState(false)
  const isConstant = !!v.is_constant
  const isAnswer = !!v.is_answer
  const myRuleCount = logicRules.filter(r => r.lhs === v.name).length

  return (
    <div className={`group border rounded-xl p-3 bg-card hover:shadow-sm transition-all ${
      isAnswer ? 'border-success/20 bg-success/10' : 'border-border hover:border-primary/20'
    }`}>
      <div className="flex items-start gap-2.5">
        <span className={`font-mono font-bold px-2.5 py-1 rounded-lg text-sm border shrink-0 mt-0.5 ${
          isAnswer
            ? 'text-success bg-success/10 border-success/20'
            : 'text-primary bg-primary/10 border-primary/20'
        }`}>
          {'{' + v.name + '}'}
        </span>

        <div className="flex-1 min-w-0 space-y-2">
          {isAnswer ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-success bg-success/10 px-2.5 py-0.5 rounded-full border border-success/20">
                = คำตอบ
              </span>
              <span className="text-xs text-muted-foreground">ค่าคำนวณจากสมการอัตโนมัติ</span>
              {onSetAnswer && (
                <button
                  type="button"
                  onClick={() => onSetAnswer(null)}
                  className="text-[10px] text-muted-foreground/40 hover:text-destructive transition-colors ml-auto"
                >
                  ยกเลิก
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg border border-border overflow-hidden text-xs w-fit">
                  <button
                    type="button"
                    onClick={() => onUpdate(index, 'is_constant', false)}
                    className={`px-3 py-1 font-medium transition-colors ${!isConstant ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
                  >
                    สุ่ม
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(index, 'is_constant', true)}
                    className={`px-3 py-1 font-medium transition-colors ${isConstant ? 'bg-flag text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
                  >
                    ค่าคงที่
                  </button>
                </div>
                {onSetAnswer && (
                  <button
                    type="button"
                    onClick={() => onSetAnswer(v.name)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-success hover:bg-success/10 rounded border border-transparent hover:border-success/20 transition-all"
                  >
                    <Target className="w-3 h-3" /> ตั้งเป็นคำตอบ
                  </button>
                )}
              </div>

              {isConstant ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground font-medium shrink-0">ค่า</Label>
                  <Input
                    type="number"
                    value={v.constant_value ?? 0}
                    onChange={e => onUpdate(index, 'constant_value', e.target.value)}
                    className="h-8 text-sm w-32"
                    step="any"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(['min', 'max', 'step'] as const).map(field => (
                    <div key={field}>
                      <Label className="text-xs text-muted-foreground font-medium">
                        {field === 'min' ? 'ต่ำสุด' : field === 'max' ? 'สูงสุด' : 'ขนาดก้าว'}
                      </Label>
                      <Input
                        type="number"
                        value={v[field] as number}
                        onChange={e => onUpdate(index, field, e.target.value)}
                        className="h-8 text-sm"
                        step="any"
                        min={field === 'step' ? '0.0001' : undefined}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowConditions(s => !s)}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-all ${
                myRuleCount > 0
                  ? 'text-warning bg-warning/10 border-warning/20 hover:bg-warning/10'
                  : 'text-muted-foreground border-transparent hover:text-muted-foreground hover:border-border hover:bg-muted'
              }`}
            >
              {showConditions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              เงื่อนไข{myRuleCount > 0 ? ` (${myRuleCount})` : ''}
            </button>

            {showConditions && (
              <InlineConditionPanel
                varName={v.name}
                allVars={allVariables}
                rules={logicRules}
                onRulesChange={onLogicRulesChange}
              />
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors mt-0.5 shrink-0 opacity-0 group-hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

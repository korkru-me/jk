'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, ChevronDown, ChevronRight, Info, Target, X } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionPreview } from './question-preview'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { createQuestion, updateQuestion, createFormulaPreset } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { numberedAnswerBlank, countAnswerBlanks, extractAnswerBlankNumbers, nextAnswerBlankNumber } from '@/lib/answer-blank'
import { runTrials, PYTHAGOREAN_FAMILIES } from '@/lib/math/evaluator'
import type { TrialSummary, TrialSample } from '@/lib/math/evaluator'
import type {
  FormulaPreset, Variable, LogicRule, LogicOperator, AnswerPart, Difficulty, Visibility,
  PythagoreanGroup, RandomQuestionConfig, Question,
} from '@/lib/types'

function equationTextFromQuestion(q?: Question | null): string | undefined {
  if (!q || !q.is_random) return undefined
  const stored = q.answer_parts?.[0]?.equation_text
  if (stored) return stored
  const answerVarName = (q.variables ?? []).find(v => v.is_answer)?.name
  const formula = q.answer_parts?.[0]?.formula
  if (!answerVarName || !formula) return undefined
  return `${answerVarName} = ${formula}`
}
import { PART_LABEL_SETS, type PartLabelStyle } from '@/lib/part-labels'
import { AnswerPartCard, LabelStyleToggle, AddSubItemButton } from './answer-set-controls'

type CreationMode = 'from-equation' | 'fixed'
type PresetWithCat = FormulaPreset & { question_categories: { name: string } | null }

// answerParts[0] (the main question's own answer) is the first item in the answer
// set (ก / 1 / a), matching how students see it during the exam. answerParts[1] is
// the second (ข / 2 / b), and so on.

const MATH_KW = new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','sqrt','cbrt','log','log2','log10','exp','abs','ceil','floor','round','sign','pi','e'])

const OPERATORS: { value: LogicOperator; label: string }[] = [
  { value: '<',  label: '<'  },
  { value: '>',  label: '>'  },
  { value: '<=', label: '≤'  },
  { value: '>=', label: '≥'  },
  { value: '!=', label: '≠'  },
]

function parseVarsFromEquation(eq: string): string[] {
  const tokens = eq.match(/[a-zA-Z][a-zA-Z0-9_]*/g) ?? []
  return [...new Set(tokens.filter(t => !MATH_KW.has(t.toLowerCase())))]
}

function detectAnswerVar(eq: string): string | null {
  const idx = eq.indexOf('=')
  if (idx === -1) return null
  const lhs = eq.slice(0, idx).trim()
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(lhs) ? lhs : null
}

function extractRHS(eq: string): string {
  const idx = eq.indexOf('=')
  return idx !== -1 ? eq.slice(idx + 1).trim() : eq.trim()
}

function newPart(): AnswerPart {
  return { id: Math.random().toString(36).slice(2), sub_text: '', formula: '', unit: '', tolerance: 0 }
}

// Older questions (saved before answer_parts existed) keep their formula/unit/tolerance
// in the legacy top-level columns instead. Fall back to those so edit/duplicate don't
// silently show a blank answer set for them.
function answerPartsFromQuestion(q?: Question | null): AnswerPart[] {
  if (q?.answer_parts && q.answer_parts.length > 0) return q.answer_parts
  if (q?.answer_formula) {
    return [{ ...newPart(), formula: q.answer_formula, unit: q.answer_unit ?? '', tolerance: q.answer_tolerance ?? 0.1 }]
  }
  return [newPart()]
}

// ─── SelectField ──────────────────────────────────────────────────────────────

function SelectField({ label, value, onChange, placeholder, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; options: { value: string; label: string }[]; disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-9 text-sm border border-border rounded-lg pl-3 pr-8 bg-card appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

// ─── VarChip ──────────────────────────────────────────────────────────────────

function VarChip({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative font-mono text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all duration-150 ${
        active
          ? 'bg-primary text-white border-primary shadow-md shadow-blue-100'
          : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary hover:bg-primary/10'
      }`}
    >
      {'{' + name + '}'}
      {active && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-success border-2 border-white" />}
    </button>
  )
}

// ─── InlineConditionPanel ─────────────────────────────────────────────────────

function InlineConditionPanel({ varName, allVars, rules, onRulesChange }: {
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
            className="text-gray-300 hover:text-destructive transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-[11px] text-primary hover:text-blue-800 font-medium transition-colors"
      >
        <Plus className="w-3 h-3" /> เพิ่มเงื่อนไข
      </button>

      {myRules.length > 0 && (
        <p className="text-[10px] text-muted-foreground">ระบบจะสุ่มค่าใหม่ถ้าไม่ตรงเงื่อนไข (สูงสุด 100 ครั้ง)</p>
      )}
    </div>
  )
}

// ─── ValueCard ────────────────────────────────────────────────────────────────

function ValueCard({ v, index, onUpdate, onRemove, logicRules, onLogicRulesChange, allVariables, onSetAnswer }: {
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
                  className="text-[10px] text-gray-300 hover:text-destructive transition-colors ml-auto"
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
                    className={`px-3 py-1 font-medium transition-colors ${isConstant ? 'bg-orange-500 text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
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
          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-destructive hover:bg-destructive/10 transition-colors mt-0.5 shrink-0 opacity-0 group-hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── VarList ──────────────────────────────────────────────────────────────────

function VarList({ variables, onChange, logicRules, onLogicRulesChange, onSetAnswer }: {
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
        <div className="flex items-start gap-2 bg-primary/10 border border-blue-100 rounded-xl px-3 py-2">
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

// ─── TolerancePicker ──────────────────────────────────────────────────────────

function TolerancePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [mode, setMode] = useState<'decimal' | 'percent'>(value < 0 ? 'percent' : 'decimal')
  const [display, setDisplay] = useState(Math.abs(value))

  useEffect(() => {
    setMode(value < 0 ? 'percent' : 'decimal')
    setDisplay(Math.abs(value))
  }, [value])

  function changeMode(m: 'decimal' | 'percent') {
    setMode(m)
    onChange(m === 'percent' ? -display : display)
  }
  function changeValue(v: number) {
    setDisplay(v)
    onChange(mode === 'percent' ? -v : v)
  }

  return (
    <div className="space-y-1.5">
      <Label>ค่าคลาดเคลื่อนที่ยอมรับ <span className="font-normal text-muted-foreground text-xs">(ใช้กับทุกข้อ)</span></Label>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(['decimal', 'percent'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`px-3 py-1.5 font-medium transition-colors ${mode === m ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              {m === 'decimal' ? 'ทศนิยม' : '%'}
            </button>
          ))}
        </div>
        <Input type="number" min={0} step={mode === 'decimal' ? 0.01 : 0.1} value={display} onChange={e => changeValue(Number(e.target.value))} className="w-28" />
        {mode === 'percent' && <span className="text-sm text-muted-foreground">%</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'decimal'
          ? `ยอมรับผิดพลาดได้ไม่เกิน ±${display} จากคำตอบที่ถูกต้อง`
          : `ยอมรับผิดพลาดได้ไม่เกิน ±${display}% ของคำตอบที่ถูกต้อง`}
      </p>
    </div>
  )
}

// ─── UnitField ────────────────────────────────────────────────────────────────

const TO_SUPER: Record<string, string> = {
  '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
  '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾',
  'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ',
  'k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ',
  'v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ',
}
const TO_SUB: Record<string, string> = {
  '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
  '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎',
  'a':'ₐ','e':'ₑ','o':'ₒ','x':'ₓ','h':'ₕ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','p':'ₚ','s':'ₛ','t':'ₜ',
}

const UNIT_CHARS_OTHER = [
  { group: 'ตัวคั่น', chars: ['·', '×', '/', '⁻'] },
  { group: 'กรีก', chars: ['μ', 'Ω', 'θ', 'α', 'β', 'γ', 'λ', 'ρ'] },
  { group: 'อื่นๆ', chars: ['°', 'Δ', '∞', '%', '√', '∑'] },
]

function UnitField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showPicker, setShowPicker] = useState(false)

  function insertChar(char: string) {
    const input = inputRef.current
    if (!input) { onChange(value + char); return }
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? start
    const next = value.slice(0, start) + char + value.slice(end)
    onChange(next)
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(start + char.length, start + char.length)
    }, 0)
  }

  function wrapSelection(map: Record<string, string>) {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0
    if (start === end) return
    const converted = value.slice(start, end).split('').map(c => map[c] ?? c).join('')
    const next = value.slice(0, start) + converted + value.slice(end)
    onChange(next)
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(start, start + converted.length)
    }, 0)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-sm shrink-0 text-muted-foreground">หน่วยของคำตอบ</Label>
        <Input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="เช่น m/s, N, kg·m/s²"
          className="h-8 text-sm max-w-[220px]"
        />
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => wrapSelection(TO_SUPER)}
          title="คลุมข้อความในช่องแล้วกดเพื่อยกขึ้น"
          className="text-xs border rounded-md px-2 py-1 font-medium transition-colors text-muted-foreground border-border hover:text-primary hover:border-primary hover:bg-primary/10 shrink-0"
        >
          A² ห้อยบน
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => wrapSelection(TO_SUB)}
          title="คลุมข้อความในช่องแล้วกดเพื่อห้อยล่าง"
          className="text-xs border rounded-md px-2 py-1 font-medium transition-colors text-muted-foreground border-border hover:text-primary hover:border-primary hover:bg-primary/10 shrink-0"
        >
          A₂ ห้อยล่าง
        </button>
        <button
          type="button"
          onClick={() => setShowPicker(s => !s)}
          className={`text-xs border rounded px-2 py-1 transition-colors shrink-0 ${
            showPicker
              ? 'bg-primary text-white border-primary'
              : 'text-primary border-primary/20 hover:bg-primary/10'
          }`}
        >
          Ω· อักขระพิเศษ
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">คลุมข้อความในช่องแล้วกด &ldquo;ห้อยบน&rdquo; หรือ &ldquo;ห้อยล่าง&rdquo; เพื่อแปลงอักษร</p>
      {showPicker && (
        <div className="border border-border rounded-xl p-3 bg-muted space-y-2">
          {UNIT_CHARS_OTHER.map(({ group, chars }) => (
            <div key={group} className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-semibold w-14 shrink-0">{group}</span>
              <div className="flex flex-wrap gap-1">
                {chars.map(ch => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => insertChar(ch)}
                    className="font-mono text-sm px-2 py-0.5 border border-border rounded bg-card hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PresetEquationSelector ───────────────────────────────────────────────────

function normalizeEq(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

function PresetEquationSelector({
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
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
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
              <div className="absolute z-10 top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
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
              </div>
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
                          ? 'bg-success text-white border-success shadow-md'
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
                <span className="font-mono text-emerald-800 text-sm font-medium flex-1 truncate">{derivedFormula}</span>
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
    </div>
  )
}

// ─── SavePresetControl ────────────────────────────────────────────────────────
// Offers to save a typed equation that doesn't already exist in the formula library.

function SavePresetControl({ equation, targetVariable, variables, onSaved }: {
  equation: string
  targetVariable: string
  variables: Variable[]
  onSaved: (p: PresetWithCat) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('ตั้งชื่อสมการก่อนบันทึก'); return }
    setSaving(true)
    const result = await createFormulaPreset({
      formula_name: name.trim(),
      equation,
      target_variable: targetVariable,
      variables: variables.filter(v => !v.is_answer).map(v => ({ name: v.name, min: v.min, max: v.max })),
      description: description.trim() || undefined,
    })
    setSaving(false)
    if (result.error) { toast.error(result.error); return }
    toast.success('บันทึกสมการลงคลังแล้ว')
    if (result.data) onSaved(result.data as PresetWithCat)
    setExpanded(false)
    setName('')
    setDescription('')
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-blue-800 font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> บันทึกสมการนี้ลงคลังสมการ
      </button>
    )
  }

  return (
    <div className="border border-primary/20 bg-primary/10 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-primary">บันทึกสมการนี้ลงคลังสมการ</p>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="ตั้งชื่อสมการ เช่น กฎข้อที่สองของนิวตัน" className="h-8 text-sm" />
      <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="คำอธิบาย (ไม่บังคับ)" className="h-8 text-sm" />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(false)} disabled={saving} className="h-8 text-xs">
          ยกเลิก
        </Button>
      </div>
    </div>
  )
}

// ─── SubEquationPicker ────────────────────────────────────────────────────────
// Lighter equation picker for sub questions — derives formula only, no variable management.

function SubEquationPicker({
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
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
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
                  className="font-mono text-xs px-2.5 py-1 rounded-lg border-2 border-warning/20 bg-warning/10 text-amber-800 font-bold hover:bg-warning/10 transition-colors"
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
                        ? 'bg-success text-white border-success shadow-md'
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
                <span className="font-mono text-emerald-800 text-sm font-medium flex-1 truncate">{derivedFormula}</span>
                <span className="text-[10px] text-success shrink-0">คำนวณอัตโนมัติ</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SubQuestionFromEquation ──────────────────────────────────────────────────
// Sub question for "from-equation" mode — no variable management, shares main vars.

function SubQuestionFromEquation({
  part, index, presets, mainVariables, labels, onChange, onRemove,
}: {
  part: AnswerPart; index: number; presets: PresetWithCat[]
  mainVariables: Variable[]; labels: string[]
  onChange: (patch: Partial<AnswerPart>) => void; onRemove: () => void
}) {
  const label = labels[index + 1] ?? String(index + 2)
  const partIndex = index + 1  // position in answerParts array
  const mainVarNames = mainVariables.filter(v => !v.is_answer).map(v => v.name)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  return (
    <AnswerPartCard label={label} onRemove={onRemove}>
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-2">เลือกสมการ *</p>
        <SubEquationPicker
          presets={presets}
          mainVarNames={mainVarNames}
          partIndex={partIndex}
          labels={labels}
          onFormulaChange={formula => onChange({ formula })}
          initialEquationText={part.equation_text}
          onEquationTextChange={text => onChange({ equation_text: text })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>คำถามย่อย / รูปแบบช่องคำตอบ *</Label>
        <RichTextEditor
          ref={subTextEditorRef}
          value={part.sub_text}
          onChange={v => onChange({ sub_text: v })}
          placeholder="เช่น จงหาความเร่ง [คำตอบ] m/s²"
          rows={1}
        />
        <Button type="button" variant="outline" size="sm" className="text-xs h-8"
          onClick={() => subTextEditorRef.current?.insertText('[คำตอบ]')}>
          + [คำตอบ]
        </Button>
      </div>
    </AnswerPartCard>
  )
}

// ─── AnswerStepField ──────────────────────────────────────────────────────────

const STEP_PRESETS = [
  { label: 'ปิด', value: 0 },
  { label: '0.01', value: 0.01 },
  { label: '0.1', value: 0.1 },
  { label: '0.5', value: 0.5 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
]

function AnswerStepField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const isOff = !value || value <= 0
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-semibold text-muted-foreground">ขนาดก้าวคำตอบ</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          คำตอบต้องเป็นทวีคูณของค่านี้ ระบบจะสุ่มใหม่จนกว่าจะได้คำตอบที่ลงตัว (สูงสุด 500 รอบ)
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {STEP_PRESETS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              (p.value === 0 && isOff) || (!isOff && Math.abs(value - p.value) < 1e-9)
                ? 'bg-primary text-white border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/20 hover:text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
        <Input
          type="number"
          min={0}
          step={0.01}
          value={isOff ? '' : value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          placeholder="กำหนดเอง"
          className="h-8 w-28 text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {isOff
          ? 'ปิดอยู่ — คำตอบอาจเป็นเลขทศนิยมใดก็ได้'
          : `คำตอบต้องเป็นทวีคูณของ ${value}  ตัวอย่าง: ${[1,2,3,5].map(n => +(n * value).toPrecision(6)).join(', ')}...`}
      </p>
    </div>
  )
}

// ─── SampleTable ──────────────────────────────────────────────────────────────

function SampleTable({ title, samples, varNames, type }: {
  title: string
  samples: TrialSample[]
  varNames: string[]
  type: 'good' | 'warn' | 'bad'
}) {
  const dotColor = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive' }[type]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-muted">
              {varNames.map(n => (
                <th key={n} className="px-3 py-1.5 text-left font-mono font-semibold text-muted-foreground border-b border-border">
                  {'{' + n + '}'}
                </th>
              ))}
              <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground border-b border-border">คำตอบ</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                {varNames.map(n => (
                  <td key={n} className="px-3 py-1.5 font-mono text-muted-foreground">{s.values[n] ?? '—'}</td>
                ))}
                <td className="px-3 py-1.5 font-mono font-bold text-foreground">{s.answer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TestRunPanel ─────────────────────────────────────────────────────────────

function TestRunPanel({ variables, logicRules, formula, answerStep, pythagoreanGroups }: {
  variables: Variable[]
  logicRules: LogicRule[]
  formula: string
  answerStep: number
  pythagoreanGroups: PythagoreanGroup[]
}) {
  const [summary, setSummary] = useState<TrialSummary | null>(null)
  const [running, setRunning] = useState(false)

  function run() {
    if (!formula.trim()) { toast.error('กรอกสมการก่อนทดสอบ'); return }
    setRunning(true)
    setSummary(null)
    setTimeout(() => {
      const result = runTrials(variables, logicRules, formula, {
        answerStep,
        pythagoreanGroups,
        trialCount: 200,
      })
      setSummary(result)
      setRunning(false)
    }, 10)
  }

  const inputVarNames = variables
    .filter(v => !v.is_answer && v.type !== 'reference')
    .map(v => v.name)

  const nicePercent = summary ? Math.round(summary.niceCount / summary.total * 100) : 0

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-2 border-dashed rounded-xl transition-colors border-primary/20 text-primary hover:bg-primary/10 hover:border-primary disabled:opacity-60"
      >
        {running ? '⏳ กำลังทดสอบ 200 รอบ...' : '🎲 ทดสอบการสุ่ม (200 รอบ)'}
      </button>

      {summary && (
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="p-4 space-y-3 bg-muted border-b border-border">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">คำตอบลงตัว</span>
                <span className={`font-bold tabular-nums ${nicePercent >= 50 ? 'text-success' : 'text-destructive'}`}>
                  {summary.niceCount} / {summary.total} ({nicePercent}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${nicePercent >= 50 ? 'bg-success' : 'bg-destructive'}`}
                  style={{ width: `${nicePercent}%` }}
                />
              </div>
            </div>

            {summary.messyCount > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-warning">⚠ มีเลขยากระหว่างคำนวณ</span>
                  <span className="font-bold text-warning tabular-nums">
                    {summary.messyCount} ชุด จาก {summary.niceCount} ชุดที่ดี
                  </span>
                </div>
                <div className="h-2 bg-warning/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-warning rounded-full"
                    style={{ width: `${summary.niceCount > 0 ? summary.messyCount / summary.niceCount * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {summary.niceCount === 0 && (
              <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 mt-2">
                <Info className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive font-medium">
                  ไม่พบชุดคำตอบที่ตรงเงื่อนไข — ลองขยายช่วงค่าตัวแปร หรือปรับขนาดก้าวคำตอบ
                </p>
              </div>
            )}
          </div>

          {(summary.niceSamples.length > 0 || summary.warningSamples.length > 0 || summary.badSamples.length > 0) && (
            <div className="p-4 space-y-4">
              {summary.niceSamples.length > 0 && (
                <SampleTable title="ตัวอย่างชุดที่ดี" samples={summary.niceSamples} varNames={inputVarNames} type="good" />
              )}
              {summary.warningSamples.length > 0 && (
                <SampleTable title="ตัวอย่างชุดที่ดี (แต่มีเลขยากระหว่างคำนวณ)" samples={summary.warningSamples} varNames={inputVarNames} type="warn" />
              )}
              {summary.badSamples.length > 0 && (
                <SampleTable title="ตัวอย่างชุดที่ไม่ผ่านขนาดก้าว" samples={summary.badSamples} varNames={inputVarNames} type="bad" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PythagoreanModePanel ─────────────────────────────────────────────────────

function PythagoreanModePanel({ enabled, onEnabledChange, groups, onGroupsChange, availableVarNames }: {
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  groups: PythagoreanGroup[]
  onGroupsChange: (g: PythagoreanGroup[]) => void
  availableVarNames: string[]
}) {
  function addGroup() {
    const mapped = new Set(groups.flatMap(g => [g.a_var, g.b_var, g.c_var]))
    const free = availableVarNames.filter(n => !mapped.has(n))
    onGroupsChange([...groups, {
      id: crypto.randomUUID(),
      a_var: free[0] ?? availableVarNames[0] ?? '',
      b_var: free[1] ?? availableVarNames[1] ?? '',
      c_var: free[2] ?? availableVarNames[2] ?? '',
    }])
  }

  function removeGroup(id: string) {
    onGroupsChange(groups.filter(g => g.id !== id))
  }

  function updateGroup(id: string, patch: Partial<PythagoreanGroup>) {
    onGroupsChange(groups.map(g => g.id === id ? { ...g, ...patch } : g))
  }

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
        <div>
          <p className="text-sm font-bold text-purple-800">โหมดชุดตัวเลขพิเศษ (Pythagorean)</p>
          <p className="text-xs text-purple-500 mt-0.5">
            สุ่มหยิบชุด (a, b, c) ที่ a² + b² = c² ลงตัวเสมอ — เหมาะสำหรับโจทย์เวกเตอร์และ ก.พ.ท.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (enabled) onGroupsChange([])
            onEnabledChange(!enabled)
          }}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-purple-600' : 'bg-muted'}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-card rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {enabled && (
        <div className="p-4 space-y-4">
          {/* Triple preview */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-purple-700">ชุดตัวเลขที่ระบบจะสุ่มใช้ ({ALL_PYTHAGOREAN_TRIPLES_COUNT} ชุด):</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PYTHAGOREAN_FAMILIES.map(f => (
                <div key={f.name} className="space-y-0.5">
                  <p className="text-[10px] font-bold text-purple-600">{f.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                    {f.triples.map(t => `(${t[0]}, ${t[1]}, ${t[2]})`).join('  ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Group editor */}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              ยังไม่มีกลุ่ม — กด &ldquo;เพิ่มกลุ่ม&rdquo; ด้านล่างเพื่อ map ตัวแปรกับตำแหน่ง a, b, c
            </p>
          )}

          {groups.map((g, gi) => (
            <div key={g.id} className="border border-purple-200 rounded-xl p-3 space-y-2 bg-purple-50/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-purple-700">กลุ่มที่ {gi + 1}</p>
                <button type="button" onClick={() => removeGroup(g.id)} className="text-gray-300 hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['a_var', 'b_var', 'c_var'] as const).map((slot, si) => (
                  <div key={slot}>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                      {si === 0 ? 'ด้านสั้น a' : si === 1 ? 'ด้านยาว b' : 'ด้านเฉียง c'}
                    </p>
                    <select
                      value={g[slot]}
                      onChange={e => updateGroup(g.id, { [slot]: e.target.value })}
                      className="w-full h-8 text-xs font-mono border border-purple-200 rounded-lg px-2 bg-card focus:outline-none focus:ring-1 focus:ring-purple-400"
                    >
                      <option value="">-- เลือก --</option>
                      {availableVarNames.map(n => (
                        <option key={n} value={n}>{'{' + n + '}'}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-purple-500">a² + b² = c² — ระบบจะสุ่มหยิบชุดตัวเลขทั้งแพ็กเกจ</p>
            </div>
          ))}

          <button
            type="button"
            onClick={addGroup}
            disabled={availableVarNames.length < 3}
            className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มกลุ่มตัวแปร Pythagorean
          </button>
          {availableVarNames.length < 3 && (
            <p className="text-xs text-destructive">ต้องมีตัวแปรอย่างน้อย 3 ตัวก่อนใช้โหมดนี้</p>
          )}
        </div>
      )}
    </div>
  )
}

const ALL_PYTHAGOREAN_TRIPLES_COUNT = PYTHAGOREAN_FAMILIES.reduce((s, f) => s + f.triples.length, 0)

// ─── Main Form ────────────────────────────────────────────────────────────────

interface RandomNumericFormProps {
  allTags: string[]
  presets: PresetWithCat[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

export function RandomNumericForm({ allTags, presets: initialPresets, mode = 'create', question, isOwner = true }: RandomNumericFormProps) {
  const router = useRouter()
  const returnTo = useSearchParams().get('tab') === 'team' ? '/questions?tab=team' : '/questions'
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  const [creationMode, setCreationMode] = useState<CreationMode>(
    question ? (question.is_random ? 'from-equation' : 'fixed') : 'from-equation'
  )

  // Local copy so newly-saved formulas show up immediately without a page reload.
  const [presetList, setPresetList] = useState<PresetWithCat[]>(initialPresets)
  function addPreset(p: PresetWithCat) {
    setPresetList(prev => [...prev, p])
  }

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(question?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(question?.shared_org_ids ?? [])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(question?.team_edit_allowed ?? true)
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])

  const [variables, setVariables] = useState<Variable[]>(question?.variables ?? [])
  const [logicRules, setLogicRules] = useState<LogicRule[]>(question?.logic_rules ?? [])

  const [answerParts, setAnswerParts] = useState<AnswerPart[]>(answerPartsFromQuestion(question))
  const existingConfig = question?.extra_data as RandomQuestionConfig | undefined
  const [labelStyle, setLabelStyle] = useState<PartLabelStyle>(existingConfig?.part_label_style ?? 'thai')
  const labels = PART_LABEL_SETS[labelStyle]
  const [globalTolerance, setGlobalTolerance] = useState(question?.answer_tolerance ?? 0.1)
  const [answerStep, setAnswerStep] = useState(existingConfig?.answer_step ?? 0)
  const [pythagoreanEnabled, setPythagoreanEnabled] = useState((existingConfig?.pythagorean_groups ?? []).length > 0)
  const [pythagoreanGroups, setPythagoreanGroups] = useState<PythagoreanGroup[]>(existingConfig?.pythagorean_groups ?? [])
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])
  const [requireWorkImage, setRequireWorkImage] = useState(question?.requires_work_image ?? false)
  const [initialEquationText, setInitialEquationText] = useState<string | undefined>(() => equationTextFromQuestion(question))

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('written')
    if (!seed) return
    setTitle(seed.title)
    setSubject(seed.subject ?? '')
    setDifficulty(seed.difficulty)
    setVisibility(seed.visibility)
    setTags(seed.tags ?? [])
    setQuestionText(seed.question_text)
    setImageUrls(seed.image_urls ?? [])
    setSolutionText(seed.solution_text ?? '')
    setSolutionImageUrls(seed.solution_image_urls ?? [])
    setRequireWorkImage(seed.requires_work_image ?? false)

    setCreationMode(seed.is_random ? 'from-equation' : 'fixed')
    setVariables(seed.variables ?? [])
    setLogicRules(seed.logic_rules ?? [])
    const seedParts = answerPartsFromQuestion(seed)
    setAnswerParts(seedParts)
    setGlobalTolerance(seed.answer_tolerance ?? 0.1)

    const equationText = equationTextFromQuestion(seed)
    if (equationText) {
      setInitialEquationText(equationText)
    }

    const config = (seed.extra_data ?? {}) as RandomQuestionConfig
    setLabelStyle(config.part_label_style ?? 'thai')
    setAnswerStep(config.answer_step ?? 0)
    setPythagoreanGroups(config.pythagorean_groups ?? [])
    setPythagoreanEnabled((config.pythagorean_groups ?? []).length > 0)
  })

  function updatePart(i: number, patch: Partial<AnswerPart>) {
    setAnswerParts(parts => parts.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  function addSubQuestion() {
    setAnswerParts(parts => [...parts, newPart()])
  }

  function removeSubQuestion(i: number) {
    setAnswerParts(parts => parts.filter((_, idx) => idx !== i))
  }

  // Fixed mode: the number of answer parts is driven entirely by how many
  // [คำตอบ N] blanks are in the main question text — keeps answerParts[0..count-1]
  // in sync (extending/truncating) every time that text changes.
  function syncMainAnswerParts(count: number) {
    setAnswerParts(prev => {
      const target = Math.max(count, 1)
      if (prev.length === target) return prev
      if (target > prev.length) return [...prev, ...Array.from({ length: target - prev.length }, newPart)]
      return prev.slice(0, target)
    })
  }

  function handleFixedQuestionTextChange(v: string) {
    setQuestionText(v)
    syncMainAnswerParts(countAnswerBlanks(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!questionText.replace(/<[^>]*>/g, '').trim()) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }

    if (creationMode === 'from-equation') {
      if (!answerParts[0].formula.trim()) { toast.error('เลือกสมการก่อนบันทึก'); return }
      const badSub = answerParts.slice(1).findIndex(p => !p.formula.trim())
      if (badSub !== -1) {
        toast.error(`เลือกสมการสำหรับข้อย่อย ${labels[badSub + 1] ?? badSub + 2} ด้วย`)
        return
      }
      const emptySubTextIdx = answerParts.findIndex(p => !(p.sub_text ?? '').replace(/<[^>]*>/g, '').trim())
      if (emptySubTextIdx !== -1) {
        toast.error(answerParts.length > 1
          ? `กรอกรูปแบบคำถาม/ช่องคำตอบข้อย่อย ${labels[emptySubTextIdx] ?? emptySubTextIdx + 1} ด้วย`
          : 'กรอกรูปแบบคำถาม/ช่องคำตอบด้วย')
        return
      }
    } else {
      const mainBlankNumbers = extractAnswerBlankNumbers(questionText)
      if (mainBlankNumbers.length === 0) { toast.error('กดแทรกคำตอบในคำถามหลักอย่างน้อย 1 ตำแหน่งก่อนบันทึก'); return }
      const emptyIdx = answerParts.slice(0, mainBlankNumbers.length).findIndex(p => !p.formula.trim())
      if (emptyIdx !== -1) {
        toast.error(mainBlankNumbers.length > 1 ? `กรอกคำตอบที่ถูกต้อง ${mainBlankNumbers[emptyIdx]} ด้วย` : 'กรอกคำตอบที่ถูกต้องด้วย')
        return
      }
    }

    setSaving(true)
    const first = answerParts[0]
    // Apply global tolerance to all parts
    const partsWithTolerance = answerParts.map(p => ({ ...p, tolerance: globalTolerance }))

    const payload = {
      title, subject, question_text: questionText, question_type: 'written' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: creationMode !== 'fixed',
      variables, logic_rules: logicRules,
      answer_parts: partsWithTolerance,
      answer_formula: first.formula,
      answer_unit: first.unit,
      answer_tolerance: globalTolerance,
      mcq_options: [],
      extra_data: {
        answer_step: answerStep > 0 ? answerStep : undefined,
        pythagorean_groups: pythagoreanGroups.length > 0 ? pythagoreanGroups : undefined,
        part_label_style: labelStyle !== 'thai' ? labelStyle : undefined,
      },
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, image_urls: imageUrls,
      requires_work_image: requireWorkImage,
      redirect_to: returnTo,
    }
    const result = mode === 'edit' && question
      ? await updateQuestion(question.id, payload)
      : await createQuestion(payload)

    if (result?.error) { toast.error(result.error); setSaving(false) }
  }

  const subParts = answerParts.slice(1)
  const answerVarName = detectAnswerVar(answerParts[0]?.equation_text ?? '') ?? variables.find(v => v.is_answer)?.name
  const inputVars = variables.filter(v => !v.is_answer)

  // Main answer content per mode — shown bare (no card chrome) when there are no
  // sub-questions yet, and wrapped in a labeled AnswerPartCard once one is added.
  const fromEquationMainContent = (
    <>
      {answerVarName && answerParts[0].formula && (
        <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-xl">
          <span className="font-mono font-bold text-success text-sm">{'{'}{answerVarName}{'}'}</span>
          <span className="text-success">=</span>
          <span className="font-mono text-emerald-800 text-sm font-medium flex-1 truncate">{answerParts[0].formula}</span>
          <span className="text-[10px] text-success shrink-0">จากสมการที่เลือกด้านบน</span>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-sm">รูปแบบคำถาม / ช่องคำตอบ *</Label>
        <RichTextEditor
          ref={subTextEditorRef}
          value={answerParts[0].sub_text ?? ''}
          onChange={v => updatePart(0, { sub_text: v })}
          placeholder="เช่น  ใช้เวลาทั้งหมด [คำตอบ] วินาที"
          rows={1}
        />
        <Button
          type="button" variant="outline" size="sm"
          className="text-xs h-8"
          onClick={() => subTextEditorRef.current?.insertText('[คำตอบ]')}
        >
          + แทรก [คำตอบ]
        </Button>
        <p className="text-[11px] text-muted-foreground">ใช้ <code className="bg-muted px-1 rounded">[คำตอบ]</code> เพื่อระบุตำแหน่งช่องกรอกคำตอบของนักเรียน</p>
      </div>
    </>
  )

  const mainBlankNumbers = creationMode === 'fixed' ? extractAnswerBlankNumbers(questionText) : []

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">

      {/* Mode selection */}
      <div className="flex gap-3">
        {([
          { value: 'fixed' as const, label: 'กำหนดคำตอบด้วยตัวเอง', desc: 'ไม่มีสมการ ไม่มีการสุ่ม นักเรียนทุกคนได้โจทย์และคำตอบเดียวกัน' },
          { value: 'from-equation' as const, label: 'สร้างโจทย์สุ่มตัวเลขจากสมการ', desc: 'เลือกสมการสำเร็จรูป หรือพิมพ์สมการเอง ระบบคำนวณคำตอบให้อัตโนมัติ' },
        ]).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCreationMode(opt.value)}
            className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
              creationMode === opt.value
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-ring bg-card'
            }`}
          >
            <p className={`text-sm font-semibold ${creationMode === opt.value ? 'text-primary' : 'text-muted-foreground'}`}>
              {opt.label}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>

      {/* 1. ข้อมูลทั่วไป */}
      <GeneralInfoSection
        allTags={allTags}
        title={title} onTitleChange={setTitle}
        subject={subject} onSubjectChange={setSubject}
        difficulty={difficulty} onDifficultyChange={setDifficulty}
        visibility={visibility} onVisibilityChange={setVisibility}
        teamOrgId={teamOrgId} onTeamOrgIdChange={setTeamOrgId}
        sharedOrgIds={sharedOrgIds} onSharedOrgIdsChange={setSharedOrgIds}
        teamEditAllowed={teamEditAllowed} onTeamEditAllowedChange={setTeamEditAllowed}
        canEditSharing={isOwner}
        tags={tags} onTagsChange={setTags}
      />

      {creationMode === 'from-equation' ? (
        <>
          {/* 2. เลือกสมการ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground border-b pb-2">เลือกสมการ *</h2>
            <PresetEquationSelector
              presets={presetList}
              variables={variables}
              onVariablesChange={setVariables}
              onFormulaChange={formula => updatePart(0, { formula })}
              logicRules={logicRules}
              onLogicRulesChange={setLogicRules}
              onPresetCreated={addPreset}
              initialEquationText={initialEquationText}
              onEquationTextChange={text => updatePart(0, { equation_text: text })}
            />
          </section>

          {/* 3. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground border-b pb-2">สร้างโจทย์</h2>
            <div className="space-y-1.5">
              <Label>โจทย์ *</Label>
              <RichTextEditor
                ref={editorRef}
                value={questionText}
                onChange={setQuestionText}
                placeholder="วัตถุมวล {m} kg เคลื่อนที่บนพื้นราบ ได้รับแรง {F} N จงหาความเร่งของวัตถุ"
                rows={5}
              />
              {/* Variable insert chips — directly below the editor */}
              {inputVars.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    กดเพื่อแทรกตัวแปรในโจทย์
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {inputVars.map(v => (
                      <VarChip
                        key={v.name}
                        name={v.name}
                        active={false}
                        onClick={() => editorRef.current?.insertText(`{${v.name}}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>รูปภาพประกอบโจทย์</Label>
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
            </div>
          </section>

          {/* 4. ชุดคำตอบ */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-base font-semibold text-foreground">ชุดคำตอบ</h2>
              {subParts.length > 0 && <LabelStyleToggle value={labelStyle} onChange={setLabelStyle} />}
            </div>
            {subParts.length > 0
              ? <AnswerPartCard label={labels[0]} locked>{fromEquationMainContent}</AnswerPartCard>
              : fromEquationMainContent}
            {subParts.map((part, i) => (
              <SubQuestionFromEquation
                key={part.id}
                part={part}
                index={i}
                presets={presetList}
                mainVariables={variables}
                labels={labels}
                onChange={patch => updatePart(i + 1, patch)}
                onRemove={() => removeSubQuestion(i + 1)}
              />
            ))}
            <AddSubItemButton onClick={addSubQuestion} />
          </section>
        </>
      ) : (
        <>
          {/* 2. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground border-b pb-2">สร้างโจทย์</h2>
            <div className="space-y-1.5">
              <Label>คำถามหลัก *</Label>
              <RichTextEditor
                ref={editorRef}
                value={questionText}
                onChange={handleFixedQuestionTextChange}
                placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..."
                rows={5}
              />
              <Button
                type="button" variant="outline" size="sm"
                className="text-xs h-8"
                onClick={() => editorRef.current?.insertText(numberedAnswerBlank(nextAnswerBlankNumber(questionText)))}
              >
                + แทรกคำตอบ
              </Button>
              <p className="text-[11px] text-muted-foreground">แทรกได้หลายช่อง แต่ละช่องจะมีเลขกำกับ พร้อมช่อง &quot;คำตอบที่ถูกต้อง&quot; เลขเดียวกันโผล่ขึ้นด้านล่างให้กรอก</p>
            </div>
            <div className="space-y-1.5">
              <Label>รูปภาพประกอบโจทย์</Label>
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
            </div>
          </section>

          {/* 3. คำตอบที่ถูกต้อง — จำนวนช่องและเลขกำกับอิงตาม [คำตอบ N] ที่แทรกไว้ในคำถามหลัก */}
          {mainBlankNumbers.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground border-b pb-2">คำตอบที่ถูกต้อง</h2>
              {mainBlankNumbers.map((num, i) => (
                <div key={i} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">คำตอบที่ถูกต้อง {num} *</Label>
                  <Input
                    value={answerParts[i]?.formula ?? ''}
                    onChange={e => updatePart(i, { formula: e.target.value })}
                    placeholder="เช่น 9.8"
                  />
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* ตั้งค่าการสุ่ม */}
      {creationMode !== 'fixed' && (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">ตั้งค่าการสุ่ม</h2>

        <AnswerStepField value={answerStep} onChange={setAnswerStep} />

        <PythagoreanModePanel
          enabled={pythagoreanEnabled}
          onEnabledChange={setPythagoreanEnabled}
          groups={pythagoreanGroups}
          onGroupsChange={setPythagoreanGroups}
          availableVarNames={inputVars.map(v => v.name)}
        />

        <TestRunPanel
          variables={variables}
          logicRules={logicRules}
          formula={answerParts[0].formula}
          answerStep={answerStep}
          pythagoreanGroups={pythagoreanGroups}
        />
      </section>
      )}

      {/* ค่าคลาดเคลื่อน */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">ค่าคลาดเคลื่อนที่ยอมรับ</h2>
        <TolerancePicker value={globalTolerance} onChange={setGlobalTolerance} />
      </section>

      {/* บังคับแนบรูปวิธีทำ */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">บังคับแนบรูปวิธีทำ</h2>
        <div className="flex items-start gap-3">
          <ToggleSwitch checked={requireWorkImage} onChange={setRequireWorkImage} />
          <div className="text-sm text-muted-foreground">
            <p>เปิดเพื่อให้นักเรียนต้องถ่ายรูป/แนบรูปวิธีทำก่อนส่งคำตอบข้อนี้</p>
            <p className="text-xs text-muted-foreground">ถ้ามีข้อย่อยหลายข้อ นักเรียนต้องแนบรูปทีละข้อย่อย (1 รูปต่อคำตอบ)</p>
          </div>
        </div>
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
      />

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={variables}
          answerParts={answerParts}
          isRandom={creationMode !== 'fixed'}
          questionType="written"
          imageUrls={imageUrls}
          partLabelStyle={labelStyle}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'อัปเดตโจทย์' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(mode === 'edit' ? returnTo : '/questions/new')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}

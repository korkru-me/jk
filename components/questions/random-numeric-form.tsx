'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, Trash2, ChevronDown, ChevronRight, Info, Target, X } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { FormulaEditor } from './formula-editor/index'
import { QuestionPreview } from './question-preview'
import { QuestionImageUpload } from './question-image-upload'
import { WhiteboardModal } from './whiteboard-modal'
import { SpecialCharInput } from './special-char-input'
import { createQuestion, createFormulaPreset } from '@/lib/actions/questions'
import { runTrials, PYTHAGOREAN_FAMILIES } from '@/lib/math/evaluator'
import type { TrialSummary, TrialSample } from '@/lib/math/evaluator'
import type {
  FormulaPreset, Variable, LogicRule, LogicOperator, AnswerPart, Difficulty, Visibility,
  PythagoreanGroup,
} from '@/lib/types'

type CreationMode = 'from-equation' | 'manual' | 'fixed'
type PresetWithCat = FormulaPreset & { question_categories: { name: string } | null }

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']
// 0 = main question, 1 = ข้อย่อย ก, 2 = ข้อย่อย ข, ...
const PREV_ANS_LABELS = ['คำตอบหลัก', 'คำตอบ ก)', 'คำตอบ ข)', 'คำตอบ ค)', 'คำตอบ ง)', 'คำตอบ จ)', 'คำตอบ ฉ)', 'คำตอบ ช)']

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

// Returns virtual Variable objects for ans0, ans1, ... ans_{partIndex-1}
function makePrevAnswerVars(partIndex: number): Variable[] {
  return Array.from({ length: partIndex }, (_, i) => ({
    name: `ans${i}`,
    min: 0, max: 100, step: 1,
    type: 'reference' as const,
  }))
}

// ─── SelectField ──────────────────────────────────────────────────────────────

function SelectField({ label, value, onChange, placeholder, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; options: { value: string; label: string }[]; disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-9 text-sm border border-gray-300 rounded-lg pl-3 pr-8 bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
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
          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100'
          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50'
      }`}
    >
      {'{' + name + '}'}
      {active && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />}
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
    <div className="mt-1.5 pt-2 border-t border-gray-100 space-y-1.5">
      {myRules.map(rule => (
        <div key={rule.id} className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 shrink-0">
            {varName}
          </span>

          <select
            value={rule.operator}
            onChange={e => updateRule(rule.id, { operator: e.target.value as LogicOperator })}
            className="h-6 text-xs border border-gray-200 rounded px-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>

          <div className="flex rounded border border-gray-200 overflow-hidden text-[10px] shrink-0">
            <button
              type="button"
              onClick={() => updateRule(rule.id, { rhs_type: 'variable' })}
              className={`px-2 py-1 font-medium transition-colors ${rule.rhs_type === 'variable' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              ตัวแปร
            </button>
            <button
              type="button"
              onClick={() => updateRule(rule.id, { rhs_type: 'constant' })}
              className={`px-2 py-1 font-medium transition-colors ${rule.rhs_type === 'constant' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              ค่า
            </button>
          </div>

          {rule.rhs_type === 'variable' ? (
            <select
              value={rule.rhs_variable}
              onChange={e => updateRule(rule.id, { rhs_variable: e.target.value })}
              className="h-6 text-xs border border-gray-200 rounded px-1 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
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
            className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        <Plus className="w-3 h-3" /> เพิ่มเงื่อนไข
      </button>

      {myRules.length > 0 && (
        <p className="text-[10px] text-gray-400">ระบบจะสุ่มค่าใหม่ถ้าไม่ตรงเงื่อนไข (สูงสุด 100 ครั้ง)</p>
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
    <div className={`group border rounded-xl p-3 bg-white hover:shadow-sm transition-all ${
      isAnswer ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-200 hover:border-blue-200'
    }`}>
      <div className="flex items-start gap-2.5">
        <span className={`font-mono font-bold px-2.5 py-1 rounded-lg text-sm border shrink-0 mt-0.5 ${
          isAnswer
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-blue-700 bg-blue-50 border-blue-200'
        }`}>
          {'{' + v.name + '}'}
        </span>

        <div className="flex-1 min-w-0 space-y-2">
          {isAnswer ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                = คำตอบ
              </span>
              <span className="text-xs text-gray-400">ค่าคำนวณจากสมการอัตโนมัติ</span>
              {onSetAnswer && (
                <button
                  type="button"
                  onClick={() => onSetAnswer(null)}
                  className="text-[10px] text-gray-300 hover:text-red-500 transition-colors ml-auto"
                >
                  ยกเลิก
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit">
                  <button
                    type="button"
                    onClick={() => onUpdate(index, 'is_constant', false)}
                    className={`px-3 py-1 font-medium transition-colors ${!isConstant ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    สุ่ม
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(index, 'is_constant', true)}
                    className={`px-3 py-1 font-medium transition-colors ${isConstant ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    ค่าคงที่
                  </button>
                </div>
                {onSetAnswer && (
                  <button
                    type="button"
                    onClick={() => onSetAnswer(v.name)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded border border-transparent hover:border-emerald-200 transition-all"
                  >
                    <Target className="w-3 h-3" /> ตั้งเป็นคำตอบ
                  </button>
                )}
              </div>

              {isConstant ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500 font-medium shrink-0">ค่า</Label>
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
                      <Label className="text-xs text-gray-500 font-medium">
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
                  ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                  : 'text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-200 hover:bg-gray-50'
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
          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors mt-0.5 shrink-0 opacity-0 group-hover:opacity-100"
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
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-600 leading-relaxed">
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
      <Label>ค่าคลาดเคลื่อนที่ยอมรับ <span className="font-normal text-gray-400 text-xs">(ใช้กับทุกข้อ)</span></Label>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['decimal', 'percent'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`px-3 py-1.5 font-medium transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {m === 'decimal' ? 'ทศนิยม' : '%'}
            </button>
          ))}
        </div>
        <Input type="number" min={0} step={mode === 'decimal' ? 0.01 : 0.1} value={display} onChange={e => changeValue(Number(e.target.value))} className="w-28" />
        {mode === 'percent' && <span className="text-sm text-gray-500">%</span>}
      </div>
      <p className="text-xs text-gray-400">
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
        <Label className="text-sm shrink-0 text-gray-700">หน่วยของคำตอบ</Label>
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
          className="text-xs border rounded-md px-2 py-1 font-medium transition-colors text-gray-600 border-gray-300 hover:text-blue-700 hover:border-blue-400 hover:bg-blue-50 shrink-0"
        >
          A² ห้อยบน
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => wrapSelection(TO_SUB)}
          title="คลุมข้อความในช่องแล้วกดเพื่อห้อยล่าง"
          className="text-xs border rounded-md px-2 py-1 font-medium transition-colors text-gray-600 border-gray-300 hover:text-blue-700 hover:border-blue-400 hover:bg-blue-50 shrink-0"
        >
          A₂ ห้อยล่าง
        </button>
        <button
          type="button"
          onClick={() => setShowPicker(s => !s)}
          className={`text-xs border rounded px-2 py-1 transition-colors shrink-0 ${
            showPicker
              ? 'bg-blue-600 text-white border-blue-600'
              : 'text-blue-600 border-blue-200 hover:bg-blue-50'
          }`}
        >
          Ω· อักขระพิเศษ
        </button>
      </div>
      <p className="text-[10px] text-gray-400">คลุมข้อความในช่องแล้วกด &ldquo;ห้อยบน&rdquo; หรือ &ldquo;ห้อยล่าง&rdquo; เพื่อแปลงอักษร</p>
      {showPicker && (
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
          {UNIT_CHARS_OTHER.map(({ group, chars }) => (
            <div key={group} className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-400 font-semibold w-14 shrink-0">{group}</span>
              <div className="flex flex-wrap gap-1">
                {chars.map(ch => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => insertChar(ch)}
                    className="font-mono text-sm px-2 py-0.5 border border-gray-300 rounded bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors"
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
  logicRules, onLogicRulesChange, onPresetCreated,
}: {
  presets: PresetWithCat[]
  variables: Variable[]
  onVariablesChange: (v: Variable[]) => void
  onFormulaChange: (formula: string) => void
  logicRules: LogicRule[]
  onLogicRulesChange: (r: LogicRule[]) => void
  onPresetCreated: (p: PresetWithCat) => void
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
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">สมการ</p>
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
              <div className="absolute z-10 top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                {matches.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handlePresetChange(p.id)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <p className="text-sm font-semibold text-gray-800">{p.formula_name}</p>
                    <p className="text-xs font-mono text-gray-500">{p.equation}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-blue-500">
            พิมพ์สมการเองได้เลย — ถ้าตรงกับสมการในคลัง ระบบจะแสดงให้เลือกอัตโนมัติ
          </p>
          {selectedPreset?.description && (
            <p className="text-xs text-gray-400">{selectedPreset.description}</p>
          )}
        </div>

        {equationText.trim() && allVarNames.length > 0 && (
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
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
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {'{' + name + '}'}
                      {isAns && <span className="ml-1.5 text-[10px] font-normal opacity-90">= คำตอบ</span>}
                    </button>
                  )
                })}
              </div>
              {solving && <p className="text-xs text-blue-500 mt-1.5">⏳ กำลังแก้สมการ...</p>}
              {solveError && <p className="text-xs text-red-500 mt-1.5">{solveError}</p>}
            </div>

            {answerVarName && derivedFormula && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="font-mono font-bold text-emerald-700 text-sm">{'{' + answerVarName + '}'}</span>
                <span className="text-emerald-500">=</span>
                <span className="font-mono text-emerald-800 text-sm font-medium flex-1 truncate">{derivedFormula}</span>
                <span className="text-[10px] text-emerald-500 shrink-0">คำนวณอัตโนมัติ</span>
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
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> บันทึกสมการนี้ลงคลังสมการ
      </button>
    )
  }

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-700">บันทึกสมการนี้ลงคลังสมการ</p>
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

// ─── ManualVariableAdder ──────────────────────────────────────────────────────

function ManualVariableAdder({
  variables, onVariablesChange,
  logicRules, onLogicRulesChange,
  onSetAnswer,
}: {
  variables: Variable[]
  onVariablesChange: (v: Variable[]) => void
  logicRules: LogicRule[]
  onLogicRulesChange: (r: LogicRule[]) => void
  onSetAnswer?: (name: string | null) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    const n = name.trim()
    if (!n) { setError('กรอกชื่อตัวแปร'); return }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(n)) { setError('ต้องขึ้นต้นด้วยอักษรภาษาอังกฤษ'); return }
    if (variables.some(v => v.name === n)) { setError('มีตัวแปรนี้แล้ว'); return }
    onVariablesChange([...variables, { name: n, min: 1, max: 10, step: 1, type: 'value' }])
    setName('')
    setError('')
  }

  return (
    <div className="space-y-3">
      {variables.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีตัวแปร — พิมพ์ชื่อตัวแปรด้านล่างเพื่อเพิ่ม</p>
      ) : (
        <VarList
          variables={variables}
          onChange={onVariablesChange}
          logicRules={logicRules}
          onLogicRulesChange={onLogicRulesChange}
          onSetAnswer={onSetAnswer}
        />
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            placeholder="เช่น m, v, F, a, theta, omega"
            className="h-9 text-sm font-mono"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd} className="h-9 shrink-0 px-3 gap-1">
          <Plus className="w-3.5 h-3.5" /> เพิ่ม
        </Button>
      </div>
    </div>
  )
}

// ─── AddSubQuestionButton ─────────────────────────────────────────────────────

function AddSubQuestionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border-2 border-dashed border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors w-full justify-center"
    >
      <Plus className="w-4 h-4" />
      เพิ่มโจทย์ย่อย
    </button>
  )
}

// ─── SubEquationPicker ────────────────────────────────────────────────────────
// Lighter equation picker for sub questions — derives formula only, no variable management.

function SubEquationPicker({
  presets, mainVarNames, partIndex, onFormulaChange,
}: {
  presets: PresetWithCat[]
  mainVarNames: string[]
  partIndex: number  // index in answerParts (1 = ก, 2 = ข, ...)
  onFormulaChange: (formula: string) => void
}) {
  const [selPresetId, setSelPresetId] = useState('')
  const [equationText, setEquationText] = useState('')
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
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
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
            <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">
              คำตอบจากข้อก่อนหน้า (กดเพื่อแทรกในสมการ)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {prevAnswerNames.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertIntoEquation(name)}
                  className="font-mono text-xs px-2.5 py-1 rounded-lg border-2 border-amber-200 bg-amber-50 text-amber-800 font-bold hover:bg-amber-100 transition-colors"
                >
                  {name}
                  <span className="ml-1.5 font-normal text-amber-500 text-[10px]">{PREV_ANS_LABELS[i]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">สมการ</p>
          <Input
            ref={equationInputRef}
            value={equationText}
            onChange={e => handleEquationInput(e.target.value)}
            placeholder="เช่น F = m * a"
            className="h-9 text-sm font-mono"
          />
          <p className="text-[11px] text-blue-500">สามารถพิมพ์หรือปรับแก้สมการในช่องนี้ได้โดยตรง</p>
          {mainVarNames.length > 0 && (
            <p className="text-[10px] text-gray-400">
              ตัวแปรที่มีจากโจทย์หลัก: <span className="font-mono">{mainVarNames.join(', ')}</span>
            </p>
          )}
        </div>

        {equationText.trim() && allVarNames.length > 0 && (
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
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
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {'{' + name + '}'}
                    {name === answerVarName && <span className="ml-1.5 text-[10px] font-normal opacity-90">= คำตอบ</span>}
                  </button>
                ))}
              </div>
              {solving && <p className="text-xs text-blue-500 mt-1.5">⏳ กำลังแก้สมการ...</p>}
              {solveError && <p className="text-xs text-red-500 mt-1.5">{solveError}</p>}
            </div>

            {answerVarName && derivedFormula && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="font-mono font-bold text-emerald-700 text-sm">{'{' + answerVarName + '}'}</span>
                <span className="text-emerald-500">=</span>
                <span className="font-mono text-emerald-800 text-sm font-medium flex-1 truncate">{derivedFormula}</span>
                <span className="text-[10px] text-emerald-500 shrink-0">คำนวณอัตโนมัติ</span>
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
  part, index, presets, mainVariables, onChange, onRemove,
}: {
  part: AnswerPart; index: number; presets: PresetWithCat[]
  mainVariables: Variable[]
  onChange: (patch: Partial<AnswerPart>) => void; onRemove: () => void
}) {
  const label = PART_LABELS[index] ?? String(index + 1)
  const partIndex = index + 1  // position in answerParts array
  const mainVarNames = mainVariables.filter(v => !v.is_answer).map(v => v.name)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-bold text-gray-700">ข้อย่อย {label})</span>
        <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> ลบข้อนี้
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">เลือกสมการ</p>
          <SubEquationPicker
            presets={presets}
            mainVarNames={mainVarNames}
            partIndex={partIndex}
            onFormulaChange={formula => onChange({ formula })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>คำถามย่อย / รูปแบบช่องคำตอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></Label>
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
      </div>
    </div>
  )
}

// ─── SubQuestionManual ────────────────────────────────────────────────────────
// Sub question for "manual" mode — no variable management, shares main vars + prev answers.

function SubQuestionManual({
  part, index, presets, mainVariables, onChange, onRemove,
}: {
  part: AnswerPart; index: number; presets: PresetWithCat[]
  mainVariables: Variable[]
  onChange: (patch: Partial<AnswerPart>) => void; onRemove: () => void
}) {
  const label = PART_LABELS[index] ?? String(index + 1)
  const partIndex = index + 1  // position in answerParts array
  const prevVars = makePrevAnswerVars(partIndex)
  // FormulaEditor sees all main input vars + virtual prev-answer vars
  const allAvailableVars = [...mainVariables.filter(v => !v.is_answer), ...prevVars]
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-bold text-gray-700">ข้อย่อย {label})</span>
        <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> ลบข้อนี้
        </button>
      </div>
      <div className="p-4 space-y-4">
        {/* Prev answer reference panel */}
        {prevVars.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
              คำตอบที่ใช้ได้จากข้อก่อนหน้า
            </p>
            <div className="flex flex-wrap gap-1.5">
              {prevVars.map((v, i) => (
                <span key={v.name} className="font-mono text-xs px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-800 font-bold">
                  {'{' + v.name + '}'}
                  <span className="ml-1.5 font-normal text-amber-600 text-[10px]">{PREV_ANS_LABELS[i]}</span>
                </span>
              ))}
            </div>
            <p className="text-[10px] text-amber-600">กดที่แท็บ "ปุ่มกด" ของ Formula Editor ด้านล่างเพื่อแทรกลงสมการ</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>คำถามย่อย / รูปแบบช่องคำตอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></Label>
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
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">สมการคำตอบ</p>
          <FormulaEditor
            variables={allAvailableVars}
            value={part.formula}
            unit={part.unit}
            presets={presets}
            onChange={formula => onChange({ formula })}
            onUnitChange={unit => onChange({ unit })}
          />
        </div>
      </div>
    </div>
  )
}

// ─── SubQuestionFixed ─────────────────────────────────────────────────────────
// Sub question for "fixed" mode — literal numeric answer, no formula/variables.

function SubQuestionFixed({
  part, index, onChange, onRemove,
}: {
  part: AnswerPart; index: number
  onChange: (patch: Partial<AnswerPart>) => void; onRemove: () => void
}) {
  const label = PART_LABELS[index] ?? String(index + 1)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-bold text-gray-700">ข้อย่อย {label})</span>
        <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> ลบข้อนี้
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <Label>คำถามย่อย / รูปแบบช่องคำตอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></Label>
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">คำตอบที่ถูกต้อง *</Label>
            <SpecialCharInput value={part.formula} onChange={v => onChange({ formula: v })} placeholder="เช่น 9.8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">หน่วย</Label>
            <SpecialCharInput value={part.unit} onChange={v => onChange({ unit: v })} placeholder="เช่น m/s²" />
          </div>
        </div>
      </div>
    </div>
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
        <Label className="text-sm font-semibold text-gray-700">ขนาดก้าวคำตอบ</Label>
        <p className="text-xs text-gray-400 mt-0.5">
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
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
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
      <p className="text-xs text-gray-400">
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
  const dotColor = { good: 'bg-emerald-400', warn: 'bg-amber-400', bad: 'bg-red-400' }[type]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
        <p className="text-xs font-semibold text-gray-600">{title}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-gray-50">
              {varNames.map(n => (
                <th key={n} className="px-3 py-1.5 text-left font-mono font-semibold text-gray-500 border-b border-gray-100">
                  {'{' + n + '}'}
                </th>
              ))}
              <th className="px-3 py-1.5 text-left font-semibold text-gray-700 border-b border-gray-100">คำตอบ</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                {varNames.map(n => (
                  <td key={n} className="px-3 py-1.5 font-mono text-gray-700">{s.values[n] ?? '—'}</td>
                ))}
                <td className="px-3 py-1.5 font-mono font-bold text-gray-900">{s.answer}</td>
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
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-2 border-dashed rounded-xl transition-colors border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 disabled:opacity-60"
      >
        {running ? '⏳ กำลังทดสอบ 200 รอบ...' : '🎲 ทดสอบการสุ่ม (200 รอบ)'}
      </button>

      {summary && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="p-4 space-y-3 bg-gray-50 border-b border-gray-100">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">คำตอบลงตัว</span>
                <span className={`font-bold tabular-nums ${nicePercent >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {summary.niceCount} / {summary.total} ({nicePercent}%)
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${nicePercent >= 50 ? 'bg-emerald-500' : 'bg-red-400'}`}
                  style={{ width: `${nicePercent}%` }}
                />
              </div>
            </div>

            {summary.messyCount > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-amber-700">⚠ มีเลขยากระหว่างคำนวณ</span>
                  <span className="font-bold text-amber-600 tabular-nums">
                    {summary.messyCount} ชุด จาก {summary.niceCount} ชุดที่ดี
                  </span>
                </div>
                <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${summary.niceCount > 0 ? summary.messyCount / summary.niceCount * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {summary.niceCount === 0 && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
                <Info className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600 font-medium">
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
    <div className="border border-purple-200 rounded-xl overflow-hidden bg-white shadow-sm">
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
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-purple-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
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
                  <p className="text-[10px] font-mono text-gray-500 leading-relaxed">
                    {f.triples.map(t => `(${t[0]}, ${t[1]}, ${t[2]})`).join('  ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Group editor */}
          {groups.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">
              ยังไม่มีกลุ่ม — กด &ldquo;เพิ่มกลุ่ม&rdquo; ด้านล่างเพื่อ map ตัวแปรกับตำแหน่ง a, b, c
            </p>
          )}

          {groups.map((g, gi) => (
            <div key={g.id} className="border border-purple-200 rounded-xl p-3 space-y-2 bg-purple-50/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-purple-700">กลุ่มที่ {gi + 1}</p>
                <button type="button" onClick={() => removeGroup(g.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['a_var', 'b_var', 'c_var'] as const).map((slot, si) => (
                  <div key={slot}>
                    <p className="text-[10px] font-semibold text-gray-500 mb-1">
                      {si === 0 ? 'ด้านสั้น a' : si === 1 ? 'ด้านยาว b' : 'ด้านเฉียง c'}
                    </p>
                    <select
                      value={g[slot]}
                      onChange={e => updateGroup(g.id, { [slot]: e.target.value })}
                      className="w-full h-8 text-xs font-mono border border-purple-200 rounded-lg px-2 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
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
            <p className="text-xs text-red-400">ต้องมีตัวแปรอย่างน้อย 3 ตัวก่อนใช้โหมดนี้</p>
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
}

export function RandomNumericForm({ allTags, presets: initialPresets }: RandomNumericFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  const [creationMode, setCreationMode] = useState<CreationMode>('from-equation')

  // Local copy so newly-saved formulas show up immediately without a page reload.
  const [presetList, setPresetList] = useState<PresetWithCat[]>(initialPresets)
  function addPreset(p: PresetWithCat) {
    setPresetList(prev => [...prev, p])
  }

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [tags, setTags] = useState<string[]>([])

  const [questionText, setQuestionText] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const [variables, setVariables] = useState<Variable[]>([])
  const [logicRules, setLogicRules] = useState<LogicRule[]>([])

  const [answerParts, setAnswerParts] = useState<AnswerPart[]>([newPart()])
  const [globalTolerance, setGlobalTolerance] = useState(0.1)
  const [answerStep, setAnswerStep] = useState(0)
  const [pythagoreanEnabled, setPythagoreanEnabled] = useState(false)
  const [pythagoreanGroups, setPythagoreanGroups] = useState<PythagoreanGroup[]>([])
  const [solutionText, setSolutionText] = useState('')

  function handleSetAnswer(name: string | null) {
    setVariables(vars => vars.map(v => ({ ...v, is_answer: name !== null && v.name === name })))
  }

  function updatePart(i: number, patch: Partial<AnswerPart>) {
    setAnswerParts(parts => parts.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  function addSubQuestion() {
    setAnswerParts(parts => [...parts, newPart()])
  }

  function removeSubQuestion(i: number) {
    setAnswerParts(parts => parts.filter((_, idx) => idx !== i))
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
        toast.error(`เลือกสมการสำหรับข้อย่อย ${PART_LABELS[badSub] ?? badSub + 1} ด้วย`)
        return
      }
    } else {
      const emptyIdx = answerParts.findIndex(p => !p.formula.trim())
      if (emptyIdx !== -1) {
        toast.error(answerParts.length > 1
          ? `กรอกสมการคำตอบข้อย่อย ${PART_LABELS[emptyIdx] ?? emptyIdx + 1} ด้วย`
          : 'กรอกสมการคำตอบด้วย')
        return
      }
    }

    setSaving(true)
    const first = answerParts[0]
    // Apply global tolerance to all parts
    const partsWithTolerance = answerParts.map(p => ({ ...p, tolerance: globalTolerance }))

    const result = await createQuestion({
      title, subject, question_text: questionText, question_type: 'written',
      difficulty, visibility, category_id: '',
      grade_level: '', is_random: creationMode !== 'fixed',
      variables, logic_rules: logicRules,
      answer_parts: partsWithTolerance,
      answer_formula: first.formula,
      answer_unit: first.unit,
      answer_tolerance: globalTolerance,
      mcq_options: [],
      extra_data: {
        answer_step: answerStep > 0 ? answerStep : undefined,
        pythagorean_groups: pythagoreanGroups.length > 0 ? pythagoreanGroups : undefined,
      },
      solution_text: solutionText, tags, image_urls: imageUrls,
    })

    if (result?.error) { toast.error(result.error); setSaving(false) }
  }

  const subParts = answerParts.slice(1)
  const answerVar = variables.find(v => v.is_answer)
  const inputVars = variables.filter(v => !v.is_answer)

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">

      {/* Mode selection */}
      <div className="flex gap-3">
        {([
          { value: 'from-equation' as const, label: 'สร้างโจทย์จากสมการ', desc: 'เลือกสมการสำเร็จรูป ระบบคำนวณคำตอบให้อัตโนมัติ' },
          { value: 'manual' as const, label: 'เขียนสมการด้วยตัวเอง', desc: 'ประกาศตัวแปรและเขียนสมการเอง' },
          { value: 'fixed' as const, label: 'กำหนดคำตอบด้วยตัวเอง', desc: 'ไม่มีสมการ ไม่มีการสุ่ม นักเรียนทุกคนได้โจทย์และคำตอบเดียวกัน' },
        ]).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCreationMode(opt.value)}
            className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
              creationMode === opt.value
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <p className={`text-sm font-semibold ${creationMode === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
              {opt.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
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
        tags={tags} onTagsChange={setTags}
      />

      {creationMode === 'from-equation' ? (
        <>
          {/* 2. เลือกสมการ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เลือกสมการ</h2>
            <PresetEquationSelector
              presets={presetList}
              variables={variables}
              onVariablesChange={setVariables}
              onFormulaChange={formula => updatePart(0, { formula })}
              logicRules={logicRules}
              onLogicRulesChange={setLogicRules}
              onPresetCreated={addPreset}
            />
          </section>

          {/* 3. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">สร้างโจทย์</h2>
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
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
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
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">รูปแบบคำถาม / ช่องคำตอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></Label>
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
              <p className="text-[11px] text-gray-400">ใช้ <code className="bg-gray-100 px-1 rounded">[คำตอบ]</code> เพื่อระบุตำแหน่งช่องกรอกคำตอบของนักเรียน</p>
            </div>
          </section>

          {/* 4. โจทย์ย่อย */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">โจทย์ย่อย</h2>
            {subParts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีโจทย์ย่อย — กดปุ่มด้านล่างเพื่อเพิ่ม</p>
            )}
            {subParts.map((part, i) => (
              <SubQuestionFromEquation
                key={part.id}
                part={part}
                index={i}
                presets={presetList}
                mainVariables={variables}
                onChange={patch => updatePart(i + 1, patch)}
                onRemove={() => removeSubQuestion(i + 1)}
              />
            ))}
            <AddSubQuestionButton onClick={addSubQuestion} />
          </section>
        </>
      ) : creationMode === 'manual' ? (
        <>
          {/* 2. ประกาศตัวแปร */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">ประกาศตัวแปร</h2>
            <ManualVariableAdder
              variables={variables}
              onVariablesChange={setVariables}
              logicRules={logicRules}
              onLogicRulesChange={setLogicRules}
              onSetAnswer={handleSetAnswer}
            />
          </section>

          {/* 3. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">สร้างโจทย์</h2>
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
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
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
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                สมการคำตอบ
                {answerVar && (
                  <span className="ml-2 font-mono text-emerald-700 font-normal">
                    {'{'}{answerVar.name}{'}'} =
                  </span>
                )}
              </p>
              <FormulaEditor
                variables={variables.filter(v => !v.is_answer)}
                value={answerParts[0].formula}
                unit={answerParts[0].unit}
                presets={presetList}
                onChange={formula => updatePart(0, { formula })}
                onVariablesChange={vars => {
                  const ansVars = variables.filter(v => v.is_answer)
                  setVariables([...vars, ...ansVars])
                }}
                onUnitChange={unit => updatePart(0, { unit })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">รูปแบบคำถาม / ช่องคำตอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></Label>
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
              <p className="text-[11px] text-gray-400">ใช้ <code className="bg-gray-100 px-1 rounded">[คำตอบ]</code> เพื่อระบุตำแหน่งช่องกรอกคำตอบของนักเรียน</p>
            </div>
          </section>

          {/* 4. โจทย์ย่อย */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">โจทย์ย่อย</h2>
            {subParts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีโจทย์ย่อย — กดปุ่มด้านล่างเพื่อเพิ่ม</p>
            )}
            {subParts.map((part, i) => (
              <SubQuestionManual
                key={part.id}
                part={part}
                index={i}
                presets={presetList}
                mainVariables={variables}
                onChange={patch => updatePart(i + 1, patch)}
                onRemove={() => removeSubQuestion(i + 1)}
              />
            ))}
            <AddSubQuestionButton onClick={addSubQuestion} />
          </section>
        </>
      ) : (
        <>
          {/* 2. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">สร้างโจทย์</h2>
            <div className="space-y-1.5">
              <Label>โจทย์ *</Label>
              <RichTextEditor
                ref={editorRef}
                value={questionText}
                onChange={setQuestionText}
                placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..."
                rows={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label>รูปภาพประกอบโจทย์</Label>
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">รูปแบบคำถาม / ช่องคำตอบ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></Label>
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
              <p className="text-[11px] text-gray-400">ใช้ <code className="bg-gray-100 px-1 rounded">[คำตอบ]</code> เพื่อระบุตำแหน่งช่องกรอกคำตอบของนักเรียน</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">คำตอบ</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">คำตอบที่ถูกต้อง *</Label>
                  <SpecialCharInput value={answerParts[0].formula} onChange={v => updatePart(0, { formula: v })} placeholder="เช่น 9.8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">หน่วย</Label>
                  <SpecialCharInput value={answerParts[0].unit} onChange={v => updatePart(0, { unit: v })} placeholder="เช่น m/s²" />
                </div>
              </div>
            </div>
          </section>

          {/* 3. โจทย์ย่อย */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">โจทย์ย่อย</h2>
            {subParts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีโจทย์ย่อย — กดปุ่มด้านล่างเพื่อเพิ่ม</p>
            )}
            {subParts.map((part, i) => (
              <SubQuestionFixed
                key={part.id}
                part={part}
                index={i}
                onChange={patch => updatePart(i + 1, patch)}
                onRemove={() => removeSubQuestion(i + 1)}
              />
            ))}
            <AddSubQuestionButton onClick={addSubQuestion} />
          </section>
        </>
      )}

      {/* ตั้งค่าการสุ่ม */}
      {creationMode !== 'fixed' && (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">ตั้งค่าการสุ่ม</h2>

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
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">ค่าคลาดเคลื่อนที่ยอมรับ</h2>
        <TolerancePicker value={globalTolerance} onChange={setGlobalTolerance} />
      </section>

      {/* เฉลยวิธีทำ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยวิธีทำ (ไม่บังคับ)</h2>
        <Textarea
          value={solutionText}
          onChange={e => setSolutionText(e.target.value)}
          placeholder="อธิบายวิธีทำ..."
          rows={4}
        />
      </section>

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={variables}
          answerParts={answerParts}
          isRandom={creationMode !== 'fixed'}
          questionType="written"
          imageUrls={imageUrls}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/questions/new')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>

      {showWhiteboard && (
        <WhiteboardModal
          onSave={url => { setImageUrls(prev => [...prev, url]); setShowWhiteboard(false) }}
          onClose={() => setShowWhiteboard(false)}
        />
      )}
    </form>
  )
}

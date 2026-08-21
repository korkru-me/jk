'use client'

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { ChevronDown, RefreshCw, Image as ImageIcon } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { SymbolPicker } from './special-char-input'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { createQuestion } from '@/lib/actions/questions'
import { evaluateFormula } from '@/lib/math/evaluator'
import type { Difficulty, Visibility, MCQOption, FormulaPreset, Variable } from '@/lib/types'
import { Card } from '@/components/ui/card'

function SingleImageUpload({ value, onChange }: { value?: string; onChange: (url?: string) => void }) {
  return (
    <QuestionImageUpload
      value={value ? [value] : []}
      onChange={(urls) => {
        if (urls.length === 0) onChange(undefined)
        else onChange(urls[urls.length - 1])
      }}
    />
  )
}

// ─── Option label styles ───────────────────────────────────────────────────────

type OptionStyle = 'thai' | 'abc' | '123'

const OPTION_LABELS_MAP: Record<OptionStyle, string[]> = {
  thai: ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'],
  abc:  ['a', 'b', 'c', 'd', 'e', 'f'],
  '123': ['1', '2', '3', '4', '5', '6'],
}

const STYLE_LABELS: Record<OptionStyle, string> = {
  thai: 'กขคง',
  abc:  'abcd',
  '123': '1234',
}

const MATH_KW = new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','sqrt','cbrt','log','log2','log10','exp','abs','ceil','floor','round','sign','pi','e'])

type PresetWithCat = FormulaPreset & { question_categories: { name: string } | null }

interface McqAutoFormProps {
  allTags: string[]
  presets: PresetWithCat[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatNum(n: number): string {
  return parseFloat(n.toFixed(8).replace(/\.?0+$/, '')).toString() || '0'
}

// Generate all single-operator-swap variants of a formula
function opSwapVariants(formula: string): string[] {
  const f = formula.trim()
  const variants: string[] = []

  if (f.includes('/')) {
    variants.push(f.replace(/\//g, '*'))
    const idx = f.indexOf('/')
    const num = f.slice(0, idx).trim()
    const den = f.slice(idx + 1).trim()
    if (num && den) variants.push(`(${den}) / (${num})`)
  }
  if (f.includes('*')) {
    variants.push(f.replace(/\*/g, '/'))
    variants.push(f.replace(/\*/g, '+'))
    variants.push(f.replace(/\*/g, '-'))
  }
  if (f.includes('+')) {
    variants.push(f.replace(/\+/g, '-'))
    variants.push(f.replace(/\+/g, '*'))
  }
  if (f.includes('-')) {
    const noUnary = f.replace(/^-/, '')
    if (noUnary !== f) variants.push(noUnary)
    else variants.push(f.replace(/-/g, '+'))
    variants.push(f.replace(/-/g, '*'))
  }

  return variants
}

// Smart distractor generator: operator swaps first, then multiply/divide by small constants
function generateSmartDistractors(
  correctFormula: string,
  constValues: Record<string, number>,
  correctAnswer: number,
  needed: number,
): string[] {
  const EPS = 1e-6
  const seen = new Set<number>([parseFloat(correctAnswer.toFixed(6))])
  const result: string[] = []

  function tryAdd(f: string): boolean {
    if (result.length >= needed) return false
    const val = evaluateFormula(f, constValues)
    if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) return false
    const rounded = parseFloat(val.toFixed(6))
    if (seen.has(rounded)) return false
    // Check uniqueness against existing result values
    for (const r of result) {
      const rv = evaluateFormula(r, constValues)
      if (typeof rv === 'number' && Math.abs(rv - val) < EPS) return false
    }
    seen.add(rounded)
    result.push(f)
    return true
  }

  // Phase 1: operator swaps
  for (const v of opSwapVariants(correctFormula)) {
    if (result.length >= needed) break
    tryAdd(v)
  }

  // Phase 2: multiply / divide by small constants
  const factors = [2, 3, 0.5, 4, 5, 10, 0.25, 0.1, 6, 8]
  for (const m of factors) {
    if (result.length >= needed) break
    tryAdd(`(${correctFormula}) * ${m}`)
    if (result.length >= needed) break
    tryAdd(`(${correctFormula}) / ${m}`)
  }

  // Phase 3: add / subtract small constants
  const addends = [1, 2, 5, 10, 0.1, 0.5]
  for (const a of addends) {
    if (result.length >= needed) break
    tryAdd(`(${correctFormula}) + ${a}`)
    if (result.length >= needed) break
    tryAdd(`(${correctFormula}) - ${a}`)
  }

  return result
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

// ─── TemplateField ────────────────────────────────────────────────────────────

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
function TemplateField({ value, onChange, imageUrl, onImageChange }: {
  value: string; onChange: (v: string) => void
  imageUrl?: string; onImageChange: (url?: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)

  function insertAt(char: string) {
    const input = inputRef.current
    if (!input) { onChange(value + char); return }
    const s = input.selectionStart ?? value.length
    const e = input.selectionEnd ?? s
    onChange(value.slice(0, s) + char + value.slice(e))
    setTimeout(() => { input.focus(); input.setSelectionRange(s + char.length, s + char.length) }, 0)
  }

  function wrapSel(map: Record<string, string>) {
    const input = inputRef.current
    if (!input) return
    const s = input.selectionStart ?? 0
    const e = input.selectionEnd ?? 0
    if (s === e) return
    const conv = value.slice(s, e).split('').map(c => map[c] ?? c).join('')
    onChange(value.slice(0, s) + conv + value.slice(e))
    setTimeout(() => { input.focus(); input.setSelectionRange(s, s + conv.length) }, 0)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="เช่น  ใช้เวลาทั้งหมด {answer} วินาที"
          className="text-sm h-9 flex-1 min-w-[220px]"
        />
        <button type="button" onClick={() => insertAt('{answer}')}
          className="text-xs border border-tint-1/20 rounded-md px-2.5 py-1.5 font-mono font-medium text-tint-1 bg-tint-1/10 hover:bg-tint-1/10 transition-colors shrink-0">
          + {'{answer}'}
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrapSel(TO_SUPER)}
          className="text-xs border rounded-md px-2 py-1.5 font-medium text-muted-foreground border-border hover:text-primary hover:border-primary hover:bg-primary/10 transition-colors shrink-0">
          X²
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrapSel(TO_SUB)}
          className="text-xs border rounded-md px-2 py-1.5 font-medium text-muted-foreground border-border hover:text-primary hover:border-primary hover:bg-primary/10 transition-colors shrink-0">
          X₂
        </button>
        <SymbolPicker onInsert={insertAt} />
        <button
          type="button"
          onClick={() => setShowImagePicker(s => !s)}
          className={`flex-shrink-0 p-1.5 rounded-md border transition-colors ${
            showImagePicker || imageUrl ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-muted-foreground'
          }`}
          title="แทรกรูปภาพในตัวเลือก"
        >
          <ImageIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">คลุมข้อความแล้วกด X² หรือ X₂ เพื่อแปลงอักษร</p>
      {(showImagePicker || imageUrl) && (
        <SingleImageUpload value={imageUrl} onChange={onImageChange} />
      )}
    </div>
  )
}

// ─── ConstantVarCard ──────────────────────────────────────────────────────────

function ConstantVarCard({ v, isAnswer, onValueChange, onSetAnswer }: {
  v: Variable
  isAnswer: boolean
  onValueChange: (val: number) => void
  onSetAnswer: (name: string) => void
}) {
  return (
    <div className={`group border rounded-xl p-3 bg-card hover:shadow-sm transition-all ${
      isAnswer ? 'border-success/20 bg-success/10' : 'border-border hover:border-primary/20'
    }`}>
      <div className="flex items-center gap-2.5">
        <span className={`font-mono font-bold px-2.5 py-1 rounded-lg text-sm border shrink-0 ${
          isAnswer ? 'text-success bg-success/10 border-success/20' : 'text-primary bg-primary/10 border-primary/20'
        }`}>
          {'{' + v.name + '}'}
        </span>

        <div className="flex-1 min-w-0">
          {isAnswer ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-success bg-success/10 px-2.5 py-0.5 rounded-full border border-success/20">
                = คำตอบ
              </span>
              <span className="text-xs text-muted-foreground">ค่าคำนวณจากสมการอัตโนมัติ</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground font-medium shrink-0">ค่า</Label>
                <Input
                  type="number"
                  value={v.constant_value ?? 1}
                  onChange={e => onValueChange(Number(e.target.value))}
                  className="h-8 text-sm w-28"
                  step="any"
                />
              </div>
              <button
                type="button"
                onClick={() => onSetAnswer(v.name)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-success hover:bg-success/10 rounded border border-transparent hover:border-success/20 transition-all"
              >
                ตั้งเป็นคำตอบ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── EquationSection ──────────────────────────────────────────────────────────

function EquationSection({
  presets, variables, answerVarName, derivedFormula,
  onVariablesChange, onFormulaChange, onAnswerVarChange,
  onPresetSelected,
}: {
  presets: PresetWithCat[]
  variables: Variable[]
  answerVarName: string | null
  derivedFormula: string
  onVariablesChange: (v: Variable[]) => void
  onFormulaChange: (formula: string) => void
  onAnswerVarChange: (name: string | null) => void
  onPresetSelected: () => void
}) {
  const [selPresetId, setSelPresetId] = useState('')
  const [equationText, setEquationText] = useState('')
  const [allVarNames, setAllVarNames] = useState<string[]>([])
  const [solving, setSolving] = useState(false)
  const [solveError, setSolveError] = useState('')

  function applyEquation(eq: string, forceAnswerVar?: string) {
    const defaultAnswer = detectAnswerVar(eq)
    const rhs = extractRHS(eq)
    const vars = parseVarsFromEquation(eq)
    const chosenAnswer = forceAnswerVar ?? defaultAnswer

    setAllVarNames(vars)
    onAnswerVarChange(chosenAnswer)
    onFormulaChange(rhs)
    setSolveError('')

    const inputVarNames = vars.filter(n => n !== chosenAnswer)
    const existingMap = new Map(variables.map(v => [v.name, v]))
    onVariablesChange(inputVarNames.map(n => {
      const existing = existingMap.get(n)
      return existing
        ? { ...existing, is_constant: true, is_answer: false }
        : { name: n, min: 1, max: 10, step: 1, is_constant: true, constant_value: 1 }
    }))
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

      onAnswerVarChange(varName)
      onFormulaChange(formula)
      setSolveError('')

      const inputVarNames = allVarNames.filter(n => n !== varName)
      const existingMap = new Map(variables.map(v => [v.name, v]))
      onVariablesChange(inputVarNames.map(n => {
        const existing = existingMap.get(n)
        return existing
          ? { ...existing, is_constant: true, is_answer: false }
          : { name: n, min: 1, max: 10, step: 1, is_constant: true, constant_value: 1 }
      }))
    } catch {
      setSolveError(`ไม่สามารถแก้สมการหา {${varName}} ได้ — ลองสลับตัวแปรอื่น หรือป้อนสมการใหม่`)
    } finally {
      setSolving(false)
    }
  }

  function handlePresetChange(id: string) {
    setSelPresetId(id)
    const p = presets.find(pr => pr.id === id)
    if (p) {
      setEquationText(p.equation)
      applyEquation(p.equation)
      // Notify parent to auto-regenerate options
      setTimeout(() => onPresetSelected(), 0)
    }
  }

  function handleEquationInput(eq: string) {
    setEquationText(eq)
    if (selPresetId) setSelPresetId('')
    applyEquation(eq)
  }

  function updateVarValue(name: string, val: number) {
    onVariablesChange(variables.map(v => v.name === name ? { ...v, constant_value: val } : v))
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

        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">สมการ</p>
          <Input
            value={equationText}
            onChange={e => handleEquationInput(e.target.value)}
            placeholder="เช่น F = m * a   หรือ   v = u + a * t"
            className="h-9 text-sm font-mono"
          />
          <p className="text-[11px] text-primary">สามารถพิมพ์หรือปรับแก้สมการในช่องนี้ได้โดยตรง</p>
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
                    className={`font-mono text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all duration-150 disabled:opacity-60 ${
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
                <span className="font-mono text-success text-sm font-medium flex-1 truncate">{derivedFormula}</span>
                <span className="text-[10px] text-success shrink-0">คำนวณอัตโนมัติ</span>
              </div>
            )}
          </div>
        )}
      </div>

      {variables.length > 0 && (
        <div className="border-t p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">ค่าตัวแปร (คงที่)</p>
          {variables.map(v => (
            <ConstantVarCard
              key={v.name}
              v={v}
              isAnswer={v.name === answerVarName}
              onValueChange={val => updateVarValue(v.name, val)}
              onSetAnswer={name => selectAnswerVar(name)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── McqAutoForm ──────────────────────────────────────────────────────────────

export function McqAutoForm({ allTags, presets }: McqAutoFormProps) {
  const router = useRouter()
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [saving, setSaving] = useState(false)

  // General info
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>([])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(true)
  const [tags, setTags] = useState<string[]>([])

  // Equation / formula
  const [variables, setVariables] = useState<Variable[]>([])
  const [answerVarName, setAnswerVarName] = useState<string | null>(null)
  const [derivedFormula, setDerivedFormula] = useState('')

  // Question content
  const [questionText, setQuestionText] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])

  // Option settings
  const [numOptions, setNumOptions] = useState(4)
  const [correctPosition, setCorrectPosition] = useState(0)
  const [optionStyle, setOptionStyle] = useState<OptionStyle>('thai')
  // distractor formulas only (no description)
  const [distractorFormulas, setDistractorFormulas] = useState<string[]>(['', '', ''])

  // Option template: e.g. "ใช้เวลา {answer} วินาที"
  const [optionTemplate, setOptionTemplate] = useState('')
  // Image shown on every generated option (e.g. a shared diagram)
  const [optionImageUrl, setOptionImageUrl] = useState<string | undefined>(undefined)

  const [solutionText, setSolutionText] = useState('')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>([])

  const LABELS = OPTION_LABELS_MAP[optionStyle]

  // Derived: constant values for evaluation
  const constValues = useMemo(() => {
    const vals: Record<string, number> = {}
    variables.forEach(v => {
      if (!v.is_answer) vals[v.name] = v.constant_value ?? 1
    })
    return vals
  }, [variables])

  const inputVarNames = useMemo(() => variables.filter(v => !v.is_answer).map(v => v.name), [variables])

  const correctAnswer = useMemo<number | null>(() => {
    if (!derivedFormula.trim() || inputVarNames.length === 0) return null
    const result = evaluateFormula(derivedFormula, constValues)
    return typeof result === 'number' ? result : null
  }, [derivedFormula, constValues, inputVarNames])

  // Keep distractorFormulas length in sync with numOptions
  useEffect(() => {
    const needed = numOptions - 1
    setDistractorFormulas(prev => {
      if (prev.length === needed) return prev
      if (prev.length < needed) return [...prev, ...Array.from({ length: needed - prev.length }, () => '')]
      return prev.slice(0, needed)
    })
    if (correctPosition >= numOptions) setCorrectPosition(numOptions - 1)
  }, [numOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-regenerate all distractors
  const regenerateAll = useCallback(() => {
    if (!derivedFormula.trim() || correctAnswer === null) return
    const needed = numOptions - 1
    const smart = generateSmartDistractors(derivedFormula, constValues, correctAnswer, needed)
    setDistractorFormulas(Array.from({ length: needed }, (_, i) => smart[i] ?? ''))
  }, [derivedFormula, constValues, correctAnswer, numOptions])

  function handleFormulaChange(formula: string) {
    setDerivedFormula(formula)
  }

  // Called when user picks a new preset
  function handlePresetSelected() {
    // regenerate will run after formula/variables state settle via next tick
    setTimeout(() => regenerateAll(), 50)
  }

  // Re-run regenerateAll when formula changes (after preset pick)
  useEffect(() => {
    if (derivedFormula.trim() && correctAnswer !== null) {
      regenerateAll()
    }
    // Only trigger when formula changes, not on every correctAnswer/numOptions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedFormula])

  function updateDistractorFormula(i: number, value: string) {
    setDistractorFormulas(prev => prev.map((f, idx) => idx === i ? value : f))
  }

  // Build full option list for display/submission
  function buildFullOptions(): Array<{
    label: string; isCorrect: boolean
    formula: string; value: number | null
  }> {
    const opts: Array<{ label: string; isCorrect: boolean; formula: string; value: number | null }> = []
    let dIdx = 0
    for (let i = 0; i < numOptions; i++) {
      if (i === correctPosition) {
        opts.push({ label: LABELS[i], isCorrect: true, formula: derivedFormula, value: correctAnswer })
      } else {
        const f = distractorFormulas[dIdx] ?? ''
        const val = f.trim() ? evaluateFormula(f, constValues) : null
        opts.push({
          label: LABELS[i],
          isCorrect: false,
          formula: f,
          value: typeof val === 'number' && isFinite(val) ? val : null,
        })
        dIdx++
      }
    }
    return opts
  }

  function applyTemplate(value: number): string {
    if (!optionTemplate.trim()) return formatNum(value)
    return optionTemplate.replace(/\{answer\}/gi, formatNum(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!derivedFormula.trim()) { toast.error('ระบุสมการและตัวแปรที่ต้องการหาก่อน'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (correctAnswer === null) { toast.error('คำนวณคำตอบไม่ได้ — ตรวจสอบสมการและค่าตัวแปร'); return }

    const opts = buildFullOptions()

    const emptyIdx = opts.findIndex(o => !o.isCorrect && !o.formula.trim())
    if (emptyIdx !== -1) { toast.error(`กรอกสูตรตัวเลือก ${opts[emptyIdx].label} ด้วย`); return }

    const invalidIdx = opts.findIndex(o => !o.isCorrect && o.value === null)
    if (invalidIdx !== -1) { toast.error(`สูตรตัวเลือก ${opts[invalidIdx].label} คำนวณไม่ได้ — ตรวจสอบสูตร`); return }

    // Check uniqueness
    const values = opts.map(o => o.value !== null ? parseFloat(o.value.toFixed(6)) : null)
    const uniqueVals = new Set(values.filter(v => v !== null))
    if (uniqueVals.size < opts.length) { toast.error('ตัวเลือกบางข้อได้คำตอบซ้ำกัน — ตรวจสอบสูตร'); return }

    const mcqOptions: MCQOption[] = opts.map(o => ({
      text: o.value !== null ? applyTemplate(o.value) : String(o.value ?? ''),
      is_correct: o.isCorrect,
      image_url: optionImageUrl,
    }))

    setSaving(true)
    const result = await createQuestion({
      title, subject, question_text: questionText, question_type: 'mcq',
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: '',
      grade_level: '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: mcqOptions,
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, image_urls: imageUrls,
    })

    if (result?.error) {
      toast.error(result.error)
      setSaving(false)
    }
  }

  const fullOptions = buildFullOptions()

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">

      {/* ข้อมูลทั่วไป */}
      <GeneralInfoSection
        allTags={allTags}
        title={title} onTitleChange={setTitle}
        subject={subject} onSubjectChange={setSubject}
        difficulty={difficulty} onDifficultyChange={setDifficulty}
        visibility={visibility} onVisibilityChange={setVisibility}
        teamOrgId={teamOrgId} onTeamOrgIdChange={setTeamOrgId}
        sharedOrgIds={sharedOrgIds} onSharedOrgIdsChange={setSharedOrgIds}
        teamEditAllowed={teamEditAllowed} onTeamEditAllowedChange={setTeamEditAllowed}
        tags={tags} onTagsChange={setTags}
      />

      {/* สมการและตัวแปร */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">สมการและตัวแปร</h2>
        <EquationSection
          presets={presets}
          variables={variables}
          answerVarName={answerVarName}
          derivedFormula={derivedFormula}
          onVariablesChange={setVariables}
          onFormulaChange={handleFormulaChange}
          onAnswerVarChange={setAnswerVarName}
          onPresetSelected={handlePresetSelected}
        />

        {derivedFormula.trim() && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
            correctAnswer !== null
              ? 'bg-success/10 border-success/20 text-success'
              : 'bg-warning/10 border-warning/20 text-warning'
          }`}>
            <span className="font-medium shrink-0">คำตอบที่ถูกต้อง:</span>
            {correctAnswer !== null ? (
              <span className="font-mono font-bold text-lg">{formatNum(correctAnswer)}</span>
            ) : (
              <span className="text-sm">กรอกค่าตัวแปรให้ครบก่อน</span>
            )}
          </div>
        )}
      </section>

      {/* เนื้อหาโจทย์ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">เนื้อหาโจทย์</h2>
        <div className="space-y-1.5">
          <Label>โจทย์ *</Label>
          <RichTextEditor ref={editorRef} value={questionText} onChange={setQuestionText} placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..." rows={5} />
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบโจทย์</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      {/* ตัวเลือก */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">ตัวเลือก</h2>

        {/* Controls row */}
        <div className="flex flex-wrap gap-4 items-end">
          {/* จำนวนตัวเลือก */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">จำนวนตัวเลือก</p>
            <div className="relative">
              <select
                value={numOptions}
                onChange={e => setNumOptions(Number(e.target.value))}
                className="h-9 text-sm border border-border rounded-lg pl-3 pr-8 bg-card appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {[2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>{n} ตัวเลือก</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* ตัวเลือกที่ถูกต้อง */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ตัวเลือกที่ถูกต้อง</p>
            <div className="relative">
              <select
                value={correctPosition}
                onChange={e => setCorrectPosition(Number(e.target.value))}
                className="h-9 text-sm border border-border rounded-lg pl-3 pr-8 bg-card appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-success"
              >
                {Array.from({ length: numOptions }, (_, i) => (
                  <option key={i} value={i}>ตัวเลือก {LABELS[i]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* รูปแบบตัวเลือก */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">รูปแบบตัวเลือก</p>
            <div className="relative">
              <select
                value={optionStyle}
                onChange={e => setOptionStyle(e.target.value as OptionStyle)}
                className="h-9 text-sm border border-border rounded-lg pl-3 pr-8 bg-card appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {(Object.keys(STYLE_LABELS) as OptionStyle[]).map(s => (
                  <option key={s} value={s}>{STYLE_LABELS[s]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* สร้างใหม่ */}
          <Button type="button" variant="outline" size="sm" onClick={regenerateAll} className="gap-1.5 text-xs h-9">
            <RefreshCw className="w-3.5 h-3.5" />
            สร้างตัวเลือกใหม่
          </Button>
        </div>

        {/* Option template */}
        <div className="space-y-1.5">
          <Label className="text-sm">แม่แบบตัวเลือก <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span></Label>
          <TemplateField
            value={optionTemplate} onChange={setOptionTemplate}
            imageUrl={optionImageUrl} onImageChange={setOptionImageUrl}
          />
          {optionTemplate.trim() && correctAnswer !== null && (
            <p className="text-xs text-tint-1 font-medium bg-tint-1/10 border border-tint-1/20 rounded-lg px-3 py-1.5">
              ตัวอย่าง: {applyTemplate(correctAnswer)}
            </p>
          )}
        </div>

        {/* Option list */}
        <div className="space-y-2">
          {fullOptions.map((opt, i) => {
            const dIdx = i < correctPosition ? i : i - 1
            const formula = opt.formula
            const showWarning = !opt.isCorrect && formula.trim() && opt.value === null

            return (
              <div key={i} className={`border rounded-xl px-3 py-2.5 flex items-center gap-3 ${
                opt.isCorrect
                  ? 'bg-success/10 border-success/20'
                  : showWarning
                    ? 'bg-destructive/10 border-destructive/20'
                    : 'bg-card border-border'
              }`}>
                {/* Label badge */}
                <span className={`text-sm font-bold w-6 text-center shrink-0 ${
                  opt.isCorrect ? 'text-success' : showWarning ? 'text-destructive' : 'text-muted-foreground'
                }`}>
                  {opt.label}
                </span>

                {opt.isCorrect ? (
                  /* Correct option — value + subtitle formula */
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20 shrink-0">✓ ถูกต้อง</span>
                      <span className="font-semibold text-success text-sm">
                        {correctAnswer !== null ? applyTemplate(correctAnswer) : '—'}
                      </span>
                    </div>
                    {derivedFormula && (
                      <p className="text-[11px] text-success font-mono mt-0.5 truncate">{derivedFormula}</p>
                    )}
                  </div>
                ) : (
                  /* Wrong option — value on top, compact formula input below */
                  <div className="flex-1 min-w-0 space-y-1">
                    <span className={`text-sm font-semibold block ${
                      opt.value !== null ? 'text-foreground' : showWarning ? 'text-destructive' : 'text-muted-foreground/40'
                    }`}>
                      {opt.value !== null
                        ? applyTemplate(opt.value)
                        : formula.trim() ? '⚠ คำนวณไม่ได้' : '—'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground font-medium shrink-0">สูตร</span>
                      <Input
                        value={distractorFormulas[dIdx] ?? ''}
                        onChange={e => updateDistractorFormula(dIdx, e.target.value)}
                        placeholder="เช่น F * m"
                        className="font-mono text-xs h-6 w-44 px-2"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Uniqueness warning */}
        {(() => {
          const vals = fullOptions.map(o => o.value !== null ? parseFloat(o.value.toFixed(6)) : null)
          const uniqueSet = new Set(vals.filter(v => v !== null))
          if (vals.filter(v => v !== null).length > 0 && uniqueSet.size < vals.filter(v => v !== null).length) {
            return (
              <p className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                ⚠ ตัวเลือกบางข้อได้คำตอบซ้ำกัน — กด &ldquo;สร้างตัวเลือกใหม่&rdquo; หรือแก้สูตรด้วยตนเอง
              </p>
            )
          }
          return null
        })()}
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
      />

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="mcq"
          mcqOptions={fullOptions.map(o => ({
            text: o.value !== null ? applyTemplate(o.value) : (o.formula || '—'),
            is_correct: o.isCorrect,
            image_url: optionImageUrl,
          }))}
          imageUrls={imageUrls}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/questions/new')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}

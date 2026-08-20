'use client'

import { useMemo, useState } from 'react'
import { parse } from 'mathjs'
import { ChevronDown, Info, Sparkles, PenLine } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Variable, FormulaPreset } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

// mathjs built-in symbols to ignore when parsing custom equations
const BUILTIN_SYMBOLS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'nthRoot', 'exp', 'expm1',
  'log', 'log2', 'log10', 'log1p',
  'abs', 'sign', 'round', 'floor', 'ceil', 'fix',
  'min', 'max', 'mod', 'pow', 'gcd', 'lcm',
  'factorial', 'combinations', 'permutations',
  'pi', 'e', 'i', 'phi', 'tau', 'Infinity', 'NaN',
  'true', 'false', 'null', 'undefined',
  'and', 'or', 'not', 'xor', 'bitAnd', 'bitOr', 'bitNot',
  'to', 'in',
])

type Mode = 'preset' | 'custom'

const EMPTY_VAR: Variable = { name: '', min: 1, max: 10, step: 1, type: 'value' }
const EMPTY_REF: Variable = {
  name: '', min: 0, max: 0, step: 1,
  type: 'reference', reference_question_order: 1, reference_field: 'answer',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VariableEditorProps {
  variables: Variable[]
  onChange: (vars: Variable[]) => void
  onInsertVariable?: (name: string) => void
  presets?: (FormulaPreset & { question_categories: { name: string } | null })[]
  availableReferences?: number[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractSymbols(expr: string): string[] {
  if (!expr.trim()) return []
  try {
    const node = parse(expr)
    const found = new Set<string>()
    node.traverse((n: any) => {
      if (n.isSymbolNode && !BUILTIN_SYMBOLS.has(n.name) && /^[a-zA-Z]/.test(n.name)) {
        found.add(n.name)
      }
    })
    return [...found]
  } catch {
    return []
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VariableEditor({
  variables,
  onChange,
  onInsertVariable,
  presets = [],
  availableReferences,
}: VariableEditorProps) {
  const [mode, setMode] = useState<Mode>('preset')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [customExpr, setCustomExpr] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualError, setManualError] = useState('')

  const hasRefs = availableReferences && availableReferences.length > 0

  // Group presets by category name
  const categories = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    presets.forEach(p => {
      const cat = p.question_categories?.name ?? 'อื่นๆ'
      if (!seen.has(cat)) { seen.add(cat); result.push(cat) }
    })
    return result
  }, [presets])

  const categoryPresets = useMemo(
    () => presets.filter(p => (p.question_categories?.name ?? 'อื่นๆ') === selectedCategory),
    [presets, selectedCategory]
  )

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  )

  // Parse custom expression → symbol list
  const detectedSymbols = useMemo(() => extractSymbols(customExpr), [customExpr])

  // ─── Actions ───────────────────────────────────────────────────────────────

  function addVariable(name: string, defaults?: Partial<Variable>) {
    onInsertVariable?.(name)
    if (variables.some(v => v.name === name)) return // already exists — just insert text
    onChange([...variables, { ...EMPTY_VAR, name, ...defaults }])
  }

  function handlePresetVarClick(pVar: Variable) {
    addVariable(pVar.name, { min: pVar.min, max: pVar.max, step: pVar.step })
  }

  function handleManualAdd() {
    const name = manualName.trim()
    if (!name) { setManualError('กรอกชื่อตัวแปร'); return }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      setManualError('ต้องขึ้นต้นด้วยอักษรภาษาอังกฤษ')
      return
    }
    addVariable(name)
    setManualName('')
    setManualError('')
  }

  function updateVar(index: number, field: keyof Variable, raw: string) {
    const numFields: (keyof Variable)[] = ['min', 'max', 'step', 'reference_question_order']
    onChange(variables.map((v, i) =>
      i === index ? { ...v, [field]: numFields.includes(field) ? Number(raw) : raw } : v
    ))
  }

  function removeVar(index: number) {
    onChange(variables.filter((_, i) => i !== index))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ══════════════ PICKER PANEL ══════════════ */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">

        {/* Mode tabs */}
        <div className="flex border-b border-border">
          <ModeTab
            active={mode === 'preset'}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="สมการมาตรฐาน"
            onClick={() => setMode('preset')}
          />
          <ModeTab
            active={mode === 'custom'}
            icon={<PenLine className="w-3.5 h-3.5" />}
            label="เขียนสมการเอง"
            onClick={() => setMode('custom')}
          />
        </div>

        <div className="p-4 space-y-4">

          {/* ── Preset Mode ── */}
          {mode === 'preset' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField
                  label="หมวดหมู่ฟิสิกส์"
                  value={selectedCategory}
                  onChange={v => { setSelectedCategory(v); setSelectedPresetId('') }}
                  placeholder="-- เลือกหมวดหมู่ --"
                  options={categories.map(c => ({ value: c, label: c }))}
                />
                <SelectField
                  label="สมการ"
                  value={selectedPresetId}
                  onChange={setSelectedPresetId}
                  placeholder="-- เลือกสมการ --"
                  disabled={!selectedCategory}
                  options={categoryPresets.map(p => ({ value: p.id, label: p.formula_name }))}
                />
              </div>

              {selectedPreset ? (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 space-y-3">
                  {/* Equation display */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">สมการ</p>
                      <p className="font-mono text-base font-bold text-blue-900">{selectedPreset.equation}</p>
                      {selectedPreset.description && (
                        <p className="text-xs text-primary mt-1">{selectedPreset.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Variable buttons */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-2">
                      กดตัวแปรเพื่อแทรกลงในโจทย์ + เพิ่มในรายการ
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedPreset.variables as Variable[]).map(pVar => (
                        <VarChip
                          key={pVar.name}
                          name={pVar.name}
                          active={variables.some(v => v.name === pVar.name)}
                          onClick={() => handlePresetVarClick(pVar)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyHint text="เลือกหมวดหมู่และสมการด้านบนเพื่อดูตัวแปรที่สามารถแทรกได้" />
              )}
            </div>
          )}

          {/* ── Custom Mode ── */}
          {mode === 'custom' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  พิมพ์สมการ
                </label>
                <div className="relative">
                  <Input
                    value={customExpr}
                    onChange={e => setCustomExpr(e.target.value)}
                    placeholder="เช่น  v^2 = u^2 + 2*a*s   หรือ  E = (1/2)*m*v^2 + m*g*h"
                    className="font-mono text-sm pr-10 h-10"
                  />
                  {customExpr && (
                    <button
                      type="button"
                      onClick={() => setCustomExpr('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  ระบบจะ parse สมการด้วย mathjs และดึงเฉพาะตัวแปรออกมาให้อัตโนมัติ
                </p>
              </div>

              {customExpr.trim() && (
                detectedSymbols.length > 0 ? (
                  <div className="bg-success/10 border border-emerald-100 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      <p className="text-xs font-semibold text-success">
                        พบ {detectedSymbols.length} ตัวแปร — กดเพื่อแทรกลงในโจทย์
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detectedSymbols.map(name => (
                        <VarChip
                          key={name}
                          name={name}
                          active={variables.some(v => v.name === name)}
                          onClick={() => addVariable(name)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-warning/10 border border-amber-100 rounded-lg px-3.5 py-2.5">
                    <span className="text-warning text-base">⚠️</span>
                    <p className="text-xs text-warning">
                      ไม่พบตัวแปรในสมการ — ตรวจสอบ syntax อีกครั้ง (ใช้ * สำหรับคูณ ^ สำหรับยกกำลัง)
                    </p>
                  </div>
                )
              )}

              {!customExpr.trim() && (
                <EmptyHint text="พิมพ์สมการด้านบน เช่น  F = m*a  หรือ  KE = (1/2)*m*v^2" />
              )}
            </div>
          )}

          {/* ── Manual add — always visible ── */}
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              เพิ่มตัวแปรชื่ออื่น (พิมพ์ชื่อ)
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={manualName}
                  onChange={e => { setManualName(e.target.value); setManualError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualAdd() } }}
                  placeholder="เช่น T, k, r, theta, omega"
                  className="h-9 text-sm font-mono"
                />
                {manualError && <p className="text-xs text-destructive mt-1">{manualError}</p>}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleManualAdd} className="h-9 shrink-0 px-4">
                + เพิ่ม
              </Button>
            </div>
          </div>

          {/* Reference vars (multi-step only) */}
          {hasRefs && (
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => onChange([...variables, { ...EMPTY_REF }])}
                className="text-xs text-primary font-semibold hover:text-indigo-800 hover:underline"
              >
                + เพิ่มตัวแปรอ้างอิงคำตอบ (multi-step)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════ VARIABLE LIST ══════════════ */}
      {variables.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-primary/10 border border-blue-100 rounded-xl px-3.5 py-2.5">
            <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-primary leading-relaxed">
              <span className="font-semibold">ขนาดก้าว</span>{' '}
              คือระยะห่างระหว่างค่าที่จะสุ่ม เช่น ต่ำสุด=9, สูงสุด=10, ขนาดก้าว=0.2 → 9, 9.2, 9.4, 9.6, 9.8, 10
            </p>
          </div>

          {variables.map((v, i) =>
            v.type === 'reference'
              ? <ReferenceCard key={i} v={v} index={i} onUpdate={updateVar} onRemove={removeVar} />
              : <ValueCard key={i} v={v} index={i} onUpdate={updateVar} onRemove={removeVar} />
          )}
        </div>
      )}

      {variables.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          ยังไม่มีตัวแปร — กดปุ่มตัวแปรด้านบนเพื่อเพิ่ม
        </p>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeTab({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all
        ${active
          ? 'bg-card text-primary border-b-2 border-primary shadow-sm'
          : 'bg-muted text-muted-foreground hover:text-muted-foreground hover:bg-accent'}
      `}
    >
      {icon}
      {label}
    </button>
  )
}

function SelectField({ label, value, onChange, placeholder, options, disabled }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="
            w-full h-9 text-sm border border-border rounded-lg pl-3 pr-8 bg-card
            appearance-none cursor-pointer transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          <option value="">{placeholder}</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

function VarChip({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? `แทรก {${name}} ลงในโจทย์อีกครั้ง` : `เพิ่มตัวแปร {${name}}`}
      className={`
        relative font-mono text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all duration-150
        ${active
          ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
          : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary hover:bg-primary/10 hover:shadow-sm'}
      `}
    >
      {'{' + name + '}'}
      {active && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-success border-2 border-white" />
      )}
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border py-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function ValueCard({ v, index, onUpdate, onRemove }: {
  v: Variable; index: number
  onUpdate: (i: number, f: keyof Variable, val: string) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="group border border-border rounded-xl p-3.5 bg-card hover:border-primary/20 hover:shadow-sm transition-all">
      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2.5 items-end">
        {/* Variable badge */}
        <div className="flex items-end pb-0.5">
          <span className="font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg text-sm border border-primary/20">
            {'{' + v.name + '}'}
          </span>
        </div>

        {/* Min / Max / Step */}
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

        {/* Remove */}
        <div className="flex items-end pb-0.5">
          <button
            type="button"
            onClick={() => onRemove(index)}
            title="ลบตัวแปรนี้"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function ReferenceCard({ v, index, onUpdate, onRemove }: {
  v: Variable; index: number
  onUpdate: (i: number, f: keyof Variable, val: string) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="border border-primary/20 rounded-xl p-3.5 bg-primary/10">
      <div className="flex items-center gap-3">
        <div className="flex-1 grid grid-cols-2 gap-2.5">
          <div>
            <Label className="text-xs text-primary font-medium">ชื่อตัวแปร</Label>
            <Input
              value={v.name}
              onChange={e => onUpdate(index, 'name', e.target.value)}
              className="h-8 font-mono text-sm"
              placeholder="เช่น ans1"
            />
          </div>
          <div>
            <Label className="text-xs text-primary font-medium">อ้างถึงคำตอบข้อที่</Label>
            <Input
              type="number"
              min={1}
              value={v.reference_question_order ?? 1}
              onChange={e => onUpdate(index, 'reference_question_order', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <span className="text-xs text-primary font-bold bg-primary/10 px-2.5 py-0.5 rounded-full">อ้างอิง</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-indigo-200 hover:text-destructive hover:bg-destructive/10 rounded-lg px-2 py-1 transition-colors text-xs"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

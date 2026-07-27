'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Check, ChevronRight, ChevronLeft, Users, Globe, UserCheck, Lock,
  CalendarDays, Clock, X, Tag, Upload, Plus,
  ArrowLeftRight, GraduationCap, BookOpen, HelpCircle, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClassroom } from '@/lib/actions/classrooms'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { ClassroomType } from '@/lib/types'

// ─── Static Data ──────────────────────────────────────────────────────────────

const GRADIENT_PRESETS = [
  { id: 'quantum',  label: 'ควอนตัม',       from: '#4776E6', to: '#8E54E9' },
  { id: 'cosmos',   label: 'จักรวาล',        from: '#0f0c29', to: '#302b63' },
  { id: 'midnight', label: 'มิดไนต์',        from: '#2c3e50', to: '#4ca1af' },
  { id: 'aurora',   label: 'ออโรร่า',         from: '#00d2ff', to: '#3a7bd5' },
  { id: 'nebula',   label: 'เนบิวลา',         from: '#834d9b', to: '#d04ed6' },
  { id: 'ocean',    label: 'มหาสมุทร',       from: '#1CB5E0', to: '#000851' },
  { id: 'sunset',   label: 'พระอาทิตย์ตก',   from: '#f7971e', to: '#ffd200' },
  { id: 'fire',     label: 'เพลิง',           from: '#f12711', to: '#f5af19' },
  { id: 'rose',     label: 'โรสโกลด์',        from: '#b24592', to: '#f15f79' },
  { id: 'forest',   label: 'ป่าไม้',          from: '#134e5e', to: '#71b280' },
  { id: 'emerald',  label: 'มรกต',            from: '#11998e', to: '#38ef7d' },
  { id: 'steel',    label: 'สตีล',            from: '#1f1c2c', to: '#928DAB' },
]

const GRADE_SUGGESTIONS = [
  'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6',
  'ม.4/1', 'ม.4/2', 'ม.5/1', 'ม.5/2', 'ม.6/1', 'ม.6/2',
  'ป.5', 'ป.6', 'ม.ต้น (1–3)', 'ติวสอบ', 'ติวเข้า ม.1',
]

function getTermSuggestions(): string[] {
  const now = new Date()
  const be = now.getFullYear() + 543
  return [`1/${be}`, `2/${be}`, `1/${be - 1}`, `2/${be - 1}`, `ภาคฤดูร้อน ${be}`]
}

function getSmartTermDefault(): string {
  const now = new Date()
  const be = now.getFullYear() + 543
  const month = now.getMonth() + 1
  return (month >= 5 && month <= 10) ? `1/${be}` : `2/${be}`
}

const ACCESS_TYPES = [
  {
    value: 'open' as const,
    label: 'เปิดรับอิสระ',
    desc: 'นักเรียนเข้าร่วมได้ทันทีด้วยรหัสห้องเรียน',
    Icon: Globe,
    chip: 'bg-emerald-600',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    cardActive: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    value: 'request' as const,
    label: 'ต้องอนุมัติ',
    desc: 'นักเรียนส่งคำขอ ครูอนุมัติก่อนจึงเข้าร่วมได้',
    Icon: UserCheck,
    chip: 'bg-blue-600',
    iconColor: 'text-blue-600 dark:text-blue-400',
    cardActive: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
  },
  {
    value: 'closed' as const,
    label: 'ปิดรับ',
    desc: 'ปิดรับนักเรียนใหม่ชั่วคราว',
    Icon: Lock,
    chip: 'bg-gray-600',
    iconColor: 'text-gray-600 dark:text-gray-400',
    cardActive: 'border-gray-500 bg-gray-50 dark:bg-gray-800/40',
  },
]

const ACCESS_LABEL: Record<string, string> = {
  open: 'เปิดรับอิสระ', request: 'ต้องอนุมัติ', closed: 'ปิดรับ',
}

const ACCESS_BADGE: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  request: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 0
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function gradientTextColor(from: string, to: string): string {
  return (hexLuminance(from) + hexLuminance(to)) / 2 > 0.55 ? '#1a1a2a' : '#ffffff'
}

function gradientStyle(from: string, to: string, angle: number): React.CSSProperties {
  return { background: `linear-gradient(${angle}deg, ${from}, ${to})` }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const wizardSchema = z.object({
  classroomType:   z.enum(['subject', 'homeroom']),
  coverFrom:       z.string().min(1),
  coverTo:         z.string().min(1),
  coverAngle:      z.number().min(0).max(360),
  coverImageUrl:   z.string(),
  name:            z.string().min(1, 'กรุณากรอกชื่อห้องเรียน').max(100, 'ชื่อห้องเรียนไม่เกิน 100 ตัวอักษร'),
  description:     z.string().max(500, 'คำอธิบายไม่เกิน 500 ตัวอักษร'),
  gradeLevel:      z.string(),
  academicTerm:    z.string(),
  tags:            z.array(z.string()),
  accessType:      z.enum(['open', 'request', 'closed']),
  capacityEnabled: z.boolean(),
  maxCapacity:     z.string(),
  startDate:       z.string(),
  endDate:         z.string(),
})

type WizardData = z.infer<typeof wizardSchema>

const DEFAULT_VALUES: WizardData = {
  classroomType:   'subject',
  coverFrom:       '#4776E6',
  coverTo:         '#8E54E9',
  coverAngle:      135,
  coverImageUrl:   '',
  name:            '',
  description:     '',
  gradeLevel:      '',
  academicTerm:    getSmartTermDefault(),
  tags:            [],
  accessType:      'open',
  capacityEnabled: false,
  maxCapacity:     '30',
  startDate:       '',
  endDate:         '',
}

const STEPS = [
  { id: 0, label: 'หน้าปกและข้อมูล' },
  { id: 1, label: 'การเข้าร่วม' },
]

const STEP_FIELDS: Record<number, (keyof WizardData)[]> = {
  0: ['name'],
  1: [],
}

function canProceed(step: number, values: WizardData): boolean {
  if (step === 0) return values.name.trim().length > 0
  return true
}

// ─── Primitive Sub-components ─────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-xs text-destructive mt-1.5">
      <Info className="w-3 h-3 shrink-0" />
      {message}
    </p>
  )
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,+$/, '').trim()
    if (!tag || tags.includes(tag)) { setInput(''); return }
    onChange([...tags, tag])
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
    else if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 cursor-text',
        'focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring transition-colors',
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-sm font-medium">
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(tags.filter((t) => t !== tag)) }} className="hover:text-red-500 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? 'กด Enter หรือ , เพื่อเพิ่มแท็ก' : ''}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ─── Creatable Combobox ───────────────────────────────────────────────────────

function CreatableCombobox({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [inputVal, setInputVal] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setInputVal(value) }, [value])

  const filtered = options.filter((o) =>
    inputVal === '' || o.toLowerCase().includes(inputVal.toLowerCase())
  )
  const isNewValue = inputVal.trim() !== '' && !options.some((o) => o.toLowerCase() === inputVal.trim().toLowerCase())

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        onChange(inputVal)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, inputVal, onChange])

  function selectOption(v: string) {
    onChange(v)
    setInputVal(v)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={inputVal}
        onChange={(e) => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onChange(inputVal); setOpen(false) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring',
          'placeholder:text-muted-foreground transition-colors',
        )}
      />
      {open && (filtered.length > 0 || isNewValue) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
              className={cn(
                'w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                value === opt && 'bg-accent/40 font-medium',
              )}
            >
              {opt}
            </button>
          ))}
          {isNewValue && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectOption(inputVal.trim()) }}
              className="w-full px-3 py-2 text-sm text-left text-blue-600 dark:text-blue-400 hover:bg-accent transition-colors flex items-center gap-2 border-t border-border"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              สร้าง &quot;{inputVal.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Color Swatch (hex + native picker) ──────────────────────────────────────

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (h: string) => void; label: string }) {
  const [inputVal, setInputVal] = useState(value)
  useEffect(() => { setInputVal(value) }, [value])

  function handleText(v: string) {
    setInputVal(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <div className="flex-1 space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <label className="relative shrink-0 w-10 h-10 rounded-lg border-2 border-border overflow-hidden cursor-pointer hover:scale-105 active:scale-95 transition-transform shadow-sm" title="คลิกเพื่อเลือกสี">
          <div className="absolute inset-0" style={{ background: value }} />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        </label>
        <input
          value={inputVal}
          onChange={(e) => handleText(e.target.value)}
          onBlur={() => setInputVal(value)}
          maxLength={7}
          placeholder="#000000"
          className={cn(
            'h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-colors',
          )}
        />
      </div>
    </div>
  )
}

// ─── Gradient Advanced Controls (inside accordion) ───────────────────────────

function GradientAdvancedControls({
  fromColor, toColor, angle,
  onFromChange, onToChange, onAngleChange,
}: {
  fromColor: string; toColor: string; angle: number
  onFromChange: (h: string) => void; onToChange: (h: string) => void; onAngleChange: (d: number) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <ColorSwatch value={fromColor} onChange={onFromChange} label="สีเริ่มต้น" />
        <button
          type="button"
          onClick={() => { onFromChange(toColor); onToChange(fromColor) }}
          title="สลับสี"
          className="shrink-0 mb-0.5 w-9 h-10 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
        <ColorSwatch value={toColor} onChange={onToChange} label="สีสิ้นสุด" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">มุมไล่สี</p>
          <span className="text-xs font-mono font-semibold tabular-nums">{angle}°</span>
        </div>
        <div className="h-4 w-full rounded-md" style={gradientStyle(fromColor, toColor, angle)} />
        <input
          type="range"
          min={0}
          max={360}
          value={angle}
          onChange={(e) => onAngleChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted accent-blue-600"
        />
        <div className="flex gap-1.5">
          {[{ l: '→', d: 90 }, { l: '↘', d: 135 }, { l: '↓', d: 180 }, { l: '↗', d: 45 }, { l: '↙', d: 225 }, { l: '←', d: 270 }].map((it) => (
            <button
              key={it.d}
              type="button"
              onClick={() => onAngleChange(it.d)}
              title={`${it.d}°`}
              className={cn(
                'w-8 h-8 rounded-lg border text-sm flex items-center justify-center transition-all',
                angle === it.d
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              {it.l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Cover Design Section (presets + accordion) ───────────────────────────────

function CoverDesignSection({
  coverFrom, coverTo, coverAngle, coverImageUrl,
  onFromChange, onToChange, onAngleChange, onImageChange,
}: {
  coverFrom: string; coverTo: string; coverAngle: number; coverImageUrl: string
  onFromChange: (h: string) => void; onToChange: (h: string) => void
  onAngleChange: (d: number) => void; onImageChange: (u: string) => void
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const matchedPreset = GRADIENT_PRESETS.find(
    (p) => p.from.toLowerCase() === coverFrom.toLowerCase() && p.to.toLowerCase() === coverTo.toLowerCase()
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">ธีมสี</Label>
        <div className="flex flex-wrap gap-2.5">
          {GRADIENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => { onFromChange(p.from); onToChange(p.to) }}
              className={cn(
                'w-8 h-8 rounded-full border-2 transition-all hover:scale-110',
                matchedPreset?.id === p.id
                  ? 'border-foreground scale-110 shadow-md ring-2 ring-offset-1 ring-foreground/30'
                  : 'border-white/40 dark:border-black/40',
              )}
              style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn('w-4 h-4 transition-transform duration-200', advancedOpen && 'rotate-90')} />
        ตั้งค่าสีขั้นสูง
      </button>

      <div className={cn(
        'overflow-hidden transition-all duration-300 ease-in-out',
        advancedOpen ? 'max-h-[380px] opacity-100' : 'max-h-0 opacity-0',
      )}>
        <div className="rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-4">
          <GradientAdvancedControls
            fromColor={coverFrom} toColor={coverTo} angle={coverAngle}
            onFromChange={onFromChange} onToChange={onToChange} onAngleChange={onAngleChange}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">
          รูปภาพหน้าปก
          <span className="text-xs text-muted-foreground font-normal ml-1">(ไม่บังคับ — แทนที่สีไล่เฉด)</span>
        </Label>
        <ImageUploadZone value={coverImageUrl} onChange={onImageChange} />
      </div>
    </div>
  )
}

// ─── Image Upload Zone ────────────────────────────────────────────────────────

function ImageUploadZone({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('กรุณาเลือกไฟล์รูปภาพ'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('ไฟล์ต้องมีขนาดไม่เกิน 5MB'); return }
    onChange(URL.createObjectURL(file))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  if (value) {
    return (
      <div className="relative rounded-xl overflow-hidden group">
        <img src={value} alt="cover preview" className="w-full h-24 object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
        isDragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 scale-[1.01]'
          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30',
      )}
    >
      <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        ลากวางรูปภาพ หรือ{' '}
        <span className="text-blue-600 dark:text-blue-400 font-medium">คลิกเพื่อเลือก</span>
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, WebP — สูงสุด 5MB</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}

// ─── Step Indicator (clickable completed steps) ───────────────────────────────

function StepIndicator({
  current,
  onStepClick,
}: {
  current: number
  onStepClick: (step: number) => void
}) {
  return (
    <div className="flex items-start justify-center">
      {STEPS.map((step, idx) => {
        const done = current > step.id
        const active = current === step.id

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={!done}
                onClick={() => done && onStepClick(step.id)}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300',
                  done
                    ? 'bg-blue-600 border-blue-600 text-white dark:bg-blue-500 dark:border-blue-500 cursor-pointer hover:bg-blue-700 hover:border-blue-700 hover:scale-105'
                    : active
                    ? 'border-blue-600 text-blue-600 bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-950/40'
                    : 'border-border text-muted-foreground bg-background cursor-default',
                )}
                title={done ? `กลับไปขั้นตอน: ${step.label}` : undefined}
              >
                {done ? <Check className="w-4 h-4" /> : String(step.id + 1)}
              </button>
              <span className={cn(
                'text-[11px] font-medium whitespace-nowrap hidden sm:block',
                active ? 'text-blue-600 dark:text-blue-400' : done ? 'text-blue-500/70 dark:text-blue-400/60' : 'text-muted-foreground',
              )}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'h-0.5 w-12 sm:w-20 mx-1.5 mb-5 transition-colors duration-300',
                current > step.id ? 'bg-blue-600 dark:bg-blue-500' : 'bg-border',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Classroom Preview Card (right side, sticky) ─────────────────────────────

function ClassroomPreviewCard({ values }: { values: WizardData }) {
  const textColor = gradientTextColor(values.coverFrom, values.coverTo)
  const hasCover = values.coverImageUrl !== ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">ตัวอย่าง Live Preview</p>
      </div>

      <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
        <div
          className="relative h-36 flex flex-col justify-end p-5 overflow-hidden"
          style={hasCover
            ? { backgroundImage: `url(${values.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : gradientStyle(values.coverFrom, values.coverTo, values.coverAngle)
          }
        >
          {hasCover && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />}
          <div className="relative">
            <p
              className="font-bold text-lg leading-tight drop-shadow-sm truncate"
              style={{ color: hasCover ? '#ffffff' : textColor }}
            >
              {values.name.trim() || 'ชื่อห้องเรียน'}
            </p>
            {(values.gradeLevel || values.academicTerm) && (
              <p
                className="text-xs mt-0.5 opacity-80"
                style={{ color: hasCover ? '#ffffff' : textColor }}
              >
                {[values.gradeLevel, values.academicTerm].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="bg-card px-4 py-3 space-y-3">
          {values.description.trim() && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {values.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', ACCESS_BADGE[values.accessType])}>
              {ACCESS_LABEL[values.accessType]}
            </span>
          </div>
          {values.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {values.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                  {tag}
                </span>
              ))}
              {values.tags.length > 5 && (
                <span className="text-xs text-muted-foreground">+{values.tags.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">ข้อมูลการตั้งค่า</p>
        <div className="space-y-1.5">
          {values.capacityEnabled && values.maxCapacity && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>จำกัด {values.maxCapacity} คน</span>
            </div>
          )}
          {values.startDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span>
                เปิด {values.startDate}
                {values.endDate ? ` → ${values.endDate}` : ''}
              </span>
            </div>
          )}
          {!values.capacityEnabled && !values.startDate && (
            <p className="text-xs text-muted-foreground/50 italic">กรอกข้อมูลเพิ่มเติมในขั้นตอนถัดไป</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 0: Cover Design & Metadata ─────────────────────────────────────────

function ClassroomTypeSection({ value, onChange }: { value: ClassroomType; onChange: (v: ClassroomType) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">ประเภทห้องเรียน</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('subject')}
          className={cn(
            'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200',
            value === 'subject'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
              : 'border-border bg-card hover:border-muted-foreground/30',
          )}
        >
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', value === 'subject' ? 'bg-white/60 dark:bg-white/10' : 'bg-muted')}>
            <BookOpen className={cn('w-4 h-4', value === 'subject' ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', value === 'subject' ? 'text-blue-600 dark:text-blue-400' : 'text-foreground')}>ห้องเรียนวิชา</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">มอบหมายการบ้าน สอบ ให้คะแนน</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange('homeroom')}
          className={cn(
            'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200',
            value === 'homeroom'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
              : 'border-border bg-card hover:border-muted-foreground/30',
          )}
        >
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', value === 'homeroom' ? 'bg-white/60 dark:bg-white/10' : 'bg-muted')}>
            <Users className={cn('w-4 h-4', value === 'homeroom' ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', value === 'homeroom' ? 'text-blue-600 dark:text-blue-400' : 'text-foreground')}>ห้อง Homeroom</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">ครูที่ปรึกษาติดตามการส่งงานทุกวิชา</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function Step0Content({
  control,
  errors,
  values,
  onClassroomTypeChange,
  onCoverFromChange,
  onCoverToChange,
  onCoverAngleChange,
  onCoverImageChange,
  onTagsChange,
}: {
  control: ReturnType<typeof useForm<WizardData>>['control']
  errors: ReturnType<typeof useForm<WizardData>>['formState']['errors']
  values: WizardData
  onClassroomTypeChange: (v: ClassroomType) => void
  onCoverFromChange: (h: string) => void
  onCoverToChange: (h: string) => void
  onCoverAngleChange: (d: number) => void
  onCoverImageChange: (u: string) => void
  onTagsChange: (t: string[]) => void
}) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-lg font-bold text-foreground">การออกแบบหน้าปกและข้อมูล</h2>
        <p className="text-sm text-muted-foreground mt-0.5">ตั้งชื่อ เลือกธีม และกรอกรายละเอียดห้องเรียน</p>
      </div>

      <ClassroomTypeSection value={values.classroomType} onChange={onClassroomTypeChange} />

      <CoverDesignSection
        coverFrom={values.coverFrom}
        coverTo={values.coverTo}
        coverAngle={values.coverAngle}
        coverImageUrl={values.coverImageUrl}
        onFromChange={onCoverFromChange}
        onToChange={onCoverToChange}
        onAngleChange={onCoverAngleChange}
        onImageChange={onCoverImageChange}
      />

      <div className="space-y-1.5">
        <Label htmlFor="cls-name">
          ชื่อห้องเรียน <span className="text-destructive">*</span>
        </Label>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              {...field}
              id="cls-name"
              placeholder="เช่น ฟิสิกส์ ม.4/1 ภาคเรียน 1"
              autoFocus
              className="h-10"
            />
          )}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cls-desc">
          คำอธิบายรายวิชา
          <span className="text-xs text-muted-foreground font-normal ml-1">(ไม่บังคับ)</span>
        </Label>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Textarea
              {...field}
              id="cls-desc"
              placeholder="อธิบายเนื้อหาที่จะเรียน เป้าหมาย หรือรายละเอียดที่เป็นประโยชน์..."
              rows={3}
              className="resize-none"
            />
          )}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="grade-combobox">ระดับชั้น</Label>
          <Controller
            control={control}
            name="gradeLevel"
            render={({ field }) => (
              <CreatableCombobox
                value={field.value}
                onChange={field.onChange}
                options={GRADE_SUGGESTIONS}
                placeholder="เช่น ม.4/1 หรือพิมพ์เองได้"
              />
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="term-combobox">ปีการศึกษา / ภาคเรียน</Label>
          <Controller
            control={control}
            name="academicTerm"
            render={({ field }) => (
              <CreatableCombobox
                value={field.value}
                onChange={field.onChange}
                options={getTermSuggestions()}
                placeholder="เช่น 1/2569"
              />
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            แท็กรายวิชา
            <span className="text-xs text-muted-foreground font-normal">(ไม่บังคับ)</span>
          </Label>
          <TooltipIcon text="แท็กช่วยให้นักเรียนค้นหาคอร์สได้ง่ายขึ้น เช่น ฟิสิกส์, กลศาสตร์, ม.4" />
        </div>
        <TagInput tags={values.tags} onChange={onTagsChange} />
      </div>
    </div>
  )
}

function TooltipIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
        aria-label="คำอธิบาย"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute left-6 -top-1 z-50 w-56 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 pointer-events-none">
          <p className="text-xs text-popover-foreground leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}

// ─── Step 1: Enrollment & Lifecycle ──────────────────────────────────────────

function Step1Content({
  control,
  values,
  onToggleCapacity,
}: {
  control: ReturnType<typeof useForm<WizardData>>['control']
  values: WizardData
  onToggleCapacity: (v: boolean) => void
}) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-lg font-bold text-foreground">การเข้าร่วมและระยะเวลา</h2>
        <p className="text-sm text-muted-foreground mt-0.5">กำหนดวิธีเข้าร่วมและช่วงเวลาของห้องเรียน</p>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">ประเภทการเข้าร่วม</Label>
        <Controller
          control={control}
          name="accessType"
          render={({ field }) => (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ACCESS_TYPES.map((type) => {
                const isSelected = field.value === type.value
                const Icon = type.Icon
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => field.onChange(type.value)}
                    className={cn(
                      'relative flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200',
                      isSelected ? type.cardActive + ' shadow-sm' : 'border-border bg-card hover:border-muted-foreground/30',
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', isSelected ? 'bg-white/60 dark:bg-white/10' : 'bg-muted')}>
                        <Icon className={cn('w-4 h-4', isSelected ? type.iconColor : 'text-muted-foreground')} />
                      </div>
                      {isSelected && (
                        <div className={cn('w-5 h-5 rounded-full flex items-center justify-center', type.chip)}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className={cn('font-semibold text-sm', isSelected ? type.iconColor : 'text-foreground')}>{type.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{type.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">จำกัดจำนวนที่นั่ง</p>
              <p className="text-xs text-muted-foreground">ล็อกอัตโนมัติเมื่อนักเรียนเต็มจำนวน</p>
            </div>
          </div>
          <ToggleSwitch checked={values.capacityEnabled} onChange={onToggleCapacity} />
        </div>
        {values.capacityEnabled && (
          <div className="pt-1 space-y-1.5 border-t border-border">
            <Label htmlFor="max-cap" className="text-sm pt-3 block">จำนวนที่นั่งสูงสุด</Label>
            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="maxCapacity"
                render={({ field }) => (
                  <Input {...field} id="max-cap" type="number" min={1} max={500} className="h-10 w-28 text-center text-base font-semibold" placeholder="30" />
                )}
              />
              <span className="text-sm text-muted-foreground">คน</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">ระยะเวลาของห้องเรียน</p>
            <p className="text-xs text-muted-foreground">ไม่บังคับ — หากไม่กำหนดวันสิ้นสุด ห้องเรียนจะเปิดตลอด</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="start-date" className="text-sm">วันเปิดคอร์ส</Label>
            <Controller control={control} name="startDate" render={({ field }) => (
              <Input {...field} id="start-date" type="date" className="h-10" />
            )} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date" className="text-sm">วันปิดคอร์ส</Label>
            <Controller control={control} name="endDate" render={({ field }) => (
              <Input {...field} id="end-date" type="date" className="h-10" />
            )} />
          </div>
        </div>
        {(values.startDate || values.endDate) && (
          <div className="flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3.5 py-3 border border-amber-200 dark:border-amber-900">
            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>เมื่อถึงวันปิดคอร์ส ระบบจะเปลี่ยนเป็น <strong>Read-only</strong> — นักเรียนดูประวัติได้แต่ส่งคำตอบไม่ได้</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function CreateCourseWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  })

  const { control, watch, setValue, formState: { errors } } = form
  const values = watch()

  const isNextEnabled = canProceed(currentStep, values) && !isPending

  async function handleNext() {
    const valid = await form.trigger(STEP_FIELDS[currentStep])
    if (!valid) return
    if (currentStep === 1) {
      if (values.capacityEnabled && (!values.maxCapacity || Number(values.maxCapacity) < 1)) {
        toast.error('กรุณากรอกจำนวนที่นั่งที่ถูกต้อง')
        return
      }
      if (values.startDate && values.endDate && values.startDate > values.endDate) {
        toast.error('วันเปิดคอร์สต้องอยู่ก่อนวันปิดคอร์ส')
        return
      }
    }
    setCurrentStep((prev) => prev + 1)
  }

  function handleBack() { setCurrentStep((prev) => prev - 1) }

  function handleStepClick(step: number) {
    if (step < currentStep) setCurrentStep(step)
  }

  function handleSubmit() {
    const data = values

    const metaParts: string[] = []
    if (data.gradeLevel)   metaParts.push(`ระดับ: ${data.gradeLevel}`)
    if (data.academicTerm) metaParts.push(`ภาคเรียน: ${data.academicTerm}`)
    if (data.tags.length > 0) metaParts.push(`แท็ก: ${data.tags.join(', ')}`)
    metaParts.push(`การเข้าร่วม: ${ACCESS_LABEL[data.accessType]}`)
    if (data.capacityEnabled && data.maxCapacity) metaParts.push(`ที่นั่ง: ${data.maxCapacity} คน`)
    if (data.startDate) metaParts.push(`เปิด: ${data.startDate}`)
    if (data.endDate)   metaParts.push(`ปิด: ${data.endDate}`)

    const descParts = [data.description.trim(), metaParts.join(' · ')].filter(Boolean)

    startTransition(async () => {
      try {
        const res = await createClassroom({
          name: data.name.trim(),
          description: descParts.join('\n'),
          classroomType: data.classroomType,
        })
        if (res?.error) {
          toast.error(res.error)
          return
        }
        toast.success('สร้างห้องเรียนสำเร็จ! กำลังเปลี่ยนหน้า...')
        setTimeout(() => { window.location.href = '/classrooms' }, 800)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error('เกิดข้อผิดพลาดที่ไม่คาดคิด: ' + msg)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">
      {/* ── Left: Form ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-foreground">สร้างห้องเรียนใหม่</h1>
            <p className="text-sm text-muted-foreground mt-0.5">ขั้นตอน {currentStep + 1} จาก {STEPS.length}</p>
          </div>
          <StepIndicator current={currentStep} onStepClick={handleStepClick} />
        </div>

        {/* Step Content */}
        <div className="px-6 py-7">
          {currentStep === 0 && (
            <Step0Content
              control={control}
              errors={errors}
              values={values}
              onClassroomTypeChange={(v) => setValue('classroomType', v)}
              onCoverFromChange={(h) => setValue('coverFrom', h)}
              onCoverToChange={(h) => setValue('coverTo', h)}
              onCoverAngleChange={(d) => setValue('coverAngle', d)}
              onCoverImageChange={(u) => setValue('coverImageUrl', u)}
              onTagsChange={(t) => setValue('tags', t)}
            />
          )}
          {currentStep === 1 && (
            <Step1Content
              control={control}
              values={values}
              onToggleCapacity={(v) => setValue('capacityEnabled', v)}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex items-center justify-between border-t border-border pt-5">
          <div>
            {currentStep > 0 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={isPending}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                ย้อนกลับ
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!isNextEnabled}
                title={!isNextEnabled ? 'กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อน' : undefined}
              >
                ถัดไป
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!isNextEnabled}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/40 text-white min-w-[160px]"
              >
                <Check className="w-4 h-4 mr-1.5" />
                {isPending ? 'กำลังสร้างห้องเรียน...' : 'ยืนยันสร้างห้องเรียน'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Live Preview ── */}
      <div className="hidden lg:block">
        <div className="sticky top-8 bg-card border border-border rounded-2xl shadow-sm p-5">
          <ClassroomPreviewCard values={values} />
        </div>
      </div>
    </div>
  )
}

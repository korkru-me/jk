'use client'

// Field controls shared by the create wizard and the classroom settings
// dialog. They live here so both screens stay visually identical — the
// settings dialog is meant to edit exactly what the wizard captured.

import { useState, useRef, useEffect } from 'react'
import { Check, Globe, UserCheck, Lock, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import type { AccessType } from './classroom-meta'

export const ACCESS_TYPES = [
  {
    value: 'open' as const,
    label: 'เปิดรับอิสระ',
    desc: 'นักเรียนเข้าร่วมได้ทันทีด้วยรหัสห้องเรียน',
    Icon: Globe,
    chip: 'bg-success',
    chipForeground: 'text-success-foreground',
    iconColor: 'text-success',
    cardActive: 'border-success bg-success/10',
  },
  {
    value: 'request' as const,
    label: 'ต้องอนุมัติ',
    desc: 'นักเรียนส่งคำขอ ครูอนุมัติก่อนจึงเข้าร่วมได้',
    Icon: UserCheck,
    chip: 'bg-primary',
    chipForeground: 'text-primary-foreground',
    iconColor: 'text-primary',
    cardActive: 'border-primary bg-primary/10',
  },
  {
    value: 'closed' as const,
    label: 'ปิดรับ',
    desc: 'ปิดรับนักเรียนใหม่ชั่วคราว',
    Icon: Lock,
    chip: 'bg-muted-foreground',
    chipForeground: 'text-background',
    iconColor: 'text-muted-foreground',
    cardActive: 'border-ring bg-muted/40',
  },
]

export function AccessTypePicker({
  value, onChange, columns = 3,
}: {
  value: AccessType
  onChange: (v: AccessType) => void
  columns?: 1 | 3
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3', columns === 3 && 'sm:grid-cols-3')}>
      {ACCESS_TYPES.map((type) => {
        const isSelected = value === type.value
        const Icon = type.Icon
        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={cn(
              'relative flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200',
              isSelected ? type.cardActive + ' shadow-sm' : 'border-border bg-card hover:border-muted-foreground/30',
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', isSelected ? 'bg-card/60' : 'bg-muted')}>
                <Icon className={cn('w-4 h-4', isSelected ? type.iconColor : 'text-muted-foreground')} />
              </div>
              {isSelected && (
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center', type.chip)}>
                  <Check className={cn('w-3 h-3', type.chipForeground)} />
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
  )
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Tags are persisted comma-separated inside the classroom description, so a
  // comma can never live inside one tag — pasted or bulk-entered text splits
  // into several tags instead of producing one that would not survive a
  // save/reload round-trip.
  function addTag(raw: string) {
    const added = raw.split(',').map(t => t.trim()).filter(t => t && !tags.includes(t))
    const deduped = added.filter((t, i) => added.indexOf(t) === i)
    if (deduped.length) onChange([...tags, ...deduped])
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
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-sm font-medium">
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(tags.filter((t) => t !== tag)) }} className="hover:text-destructive transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? 'กด Enter หรือ , เพื่อเพิ่มแท็ก' : ''} className="flex-1 min-w-[100px]"
      />
    </div>
  )
}

export function CreatableCombobox({
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
      <Input
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
              className="w-full px-3 py-2 text-sm text-left text-primary hover:bg-accent transition-colors flex items-center gap-2 border-t border-border"
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

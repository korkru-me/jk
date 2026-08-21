'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

// ─── Same symbol data as RichTextEditor ───────────────────────────────────────

const SYMBOL_GROUPS = [
  {
    label: 'อักษรกรีก (ตัวเล็ก)',
    symbols: [
      { char: 'α', name: 'alpha — ความเร่งเชิงมุม, สัมประสิทธิ์การขยายตัว' },
      { char: 'β', name: 'beta — อนุภาคบีตา, มุม' },
      { char: 'γ', name: 'gamma — รังสีแกมมา, แฟกเตอร์ Lorentz' },
      { char: 'δ', name: 'delta — การเปลี่ยนแปลงเล็กน้อย' },
      { char: 'ε', name: 'epsilon — สภาพยอม (permittivity), ความเครียด' },
      { char: 'η', name: 'eta — ประสิทธิภาพ (efficiency)' },
      { char: 'θ', name: 'theta — มุม' },
      { char: 'κ', name: 'kappa — ค่าคงที่สปริง, การนำความร้อน' },
      { char: 'λ', name: 'lambda — ความยาวคลื่น' },
      { char: 'μ', name: 'mu — ไมโคร (10⁻⁶), สัมประสิทธิ์ความเสียดทาน' },
      { char: 'ν', name: 'nu — ความถี่' },
      { char: 'π', name: 'pi — 3.14159…' },
      { char: 'ρ', name: 'rho — ความหนาแน่น, สภาพต้านทานไฟฟ้า' },
      { char: 'σ', name: 'sigma — ค่าคงตัว Stefan–Boltzmann, ความเค้น' },
      { char: 'τ', name: 'tau — ทอร์ก, ค่าคงเวลา' },
      { char: 'φ', name: 'phi — ฟลักซ์แม่เหล็ก, มุมเฟส' },
      { char: 'ω', name: 'omega — ความเร็วเชิงมุม, ความถี่เชิงมุม' },
    ],
  },
  {
    label: 'อักษรกรีก (ตัวใหญ่)',
    symbols: [
      { char: 'Γ', name: 'Gamma' },
      { char: 'Δ', name: 'Delta — ผลต่าง เช่น Δv, Δt, ΔE' },
      { char: 'Θ', name: 'Theta' },
      { char: 'Λ', name: 'Lambda' },
      { char: 'Π', name: 'Pi — ผลคูณ' },
      { char: 'Σ', name: 'Sigma — ผลรวม' },
      { char: 'Φ', name: 'Phi — ฟลักซ์แม่เหล็กรวม' },
      { char: 'Ψ', name: 'Psi — ฟังก์ชันคลื่น' },
      { char: 'Ω', name: 'Omega — โอห์ม หน่วยความต้านทาน' },
    ],
  },
  {
    label: 'สัญลักษณ์ฟิสิกส์',
    symbols: [
      { char: '∠', name: 'มุม (angle)' },
      { char: '°', name: 'องศา — มุม (°) และอุณหภูมิ' },
      { char: '⊙', name: 'กระแส/สนามออกจากหน้ากระดาษ' },
      { char: '⊗', name: 'กระแส/สนามเข้าสู่หน้ากระดาษ' },
      { char: 'ℏ', name: 'h-bar — ค่าคงตัวพลังค์ / 2π' },
      { char: '∫', name: 'อินทิกรัล (integral)' },
      { char: '∂', name: 'อนุพันธ์ย่อย (partial derivative)' },
      { char: '∇', name: 'nabla — gradient, divergence, curl' },
      { char: 'ℓ', name: 'script l — ความยาว' },
    ],
  },
  {
    label: 'สัญลักษณ์คณิตศาสตร์',
    symbols: [
      { char: '±', name: 'บวกหรือลบ (plus–minus)' },
      { char: '×', name: 'คูณ / cross product' },
      { char: '·', name: 'dot product, การคูณ' },
      { char: '÷', name: 'หาร' },
      { char: '√', name: 'รากที่สอง' },
      { char: '∝', name: 'แปรผันตรง (proportional to)' },
      { char: '≈', name: 'ประมาณเท่ากับ' },
      { char: '≠', name: 'ไม่เท่ากับ' },
      { char: '≤', name: 'น้อยกว่าหรือเท่ากับ' },
      { char: '≥', name: 'มากกว่าหรือเท่ากับ' },
      { char: '∞', name: 'อนันต์' },
      { char: '∑', name: 'ซิกมา — ผลรวม' },
    ],
  },
  {
    label: 'ลูกศรและทิศทาง',
    symbols: [
      { char: '→', name: 'ลูกศรขวา — เวกเตอร์, ทิศทาง' },
      { char: '←', name: 'ลูกศรซ้าย' },
      { char: '↑', name: 'ลูกศรขึ้น' },
      { char: '↓', name: 'ลูกศรลง' },
      { char: '⇒', name: 'ดังนั้น / implies' },
      { char: '⊥', name: 'ตั้งฉาก (perpendicular)' },
      { char: '∥', name: 'ขนาน (parallel)' },
    ],
  },
]

// ─── SymbolPicker (identical UX to RichTextEditor) ────────────────────────────

export function SymbolPicker({ onInsert }: { onInsert: (char: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title="แทรกอักษรกรีก / สัญลักษณ์พิเศษ"
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className={cn(
          'flex items-center gap-1 px-2 h-9 rounded-md border text-sm font-medium transition-colors',
          open
            ? 'bg-foreground text-background border-foreground'
            : 'text-muted-foreground border-border bg-card hover:bg-muted hover:border-ring',
        )}
      >
        <span className="font-serif text-base leading-none">Ω</span>
        <span className="text-xs hidden sm:inline">สัญลักษณ์</span>
      </button>

      {open && (
        <Card radius="md" elevation="xl" padding="sm" className="absolute top-full left-0 mt-1 z-50 w-80">
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {SYMBOL_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.symbols.map(({ char, name }) => (
                    <button
                      key={char}
                      type="button"
                      title={name}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onInsert(char)
                        setOpen(false)
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded border border-border text-foreground text-sm font-serif hover:bg-primary/10 hover:border-primary/20 hover:text-primary transition-colors"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
            วางเมาส์บนสัญลักษณ์เพื่อดูคำอธิบาย
          </p>
        </Card>
      )}
    </div>
  )
}

// ─── SpecialCharInput ─────────────────────────────────────────────────────────
// Input ธรรมดา + ปุ่ม Ω เดียวกับ RichTextEditor แทรกที่ตำแหน่ง cursor

interface SpecialCharInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  id?: string
  type?: string
}

export function SpecialCharInput({
  value,
  onChange,
  placeholder,
  className,
  id,
  type = 'text',
}: SpecialCharInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function insertChar(char: string) {
    const input = inputRef.current
    if (!input) { onChange(value + char); return }

    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length
    const next = value.slice(0, start) + char + value.slice(end)
    onChange(next)

    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + char.length, start + char.length)
    })
  }

  return (
    <div className="flex gap-1.5 items-center">
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
          'transition-colors placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
      <SymbolPicker onInsert={insertChar} />
    </div>
  )
}

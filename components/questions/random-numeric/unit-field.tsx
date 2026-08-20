'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRef, useState } from 'react'

// ─── UnitField ────────────────────────────────────────────────────────────────

export const TO_SUPER: Record<string, string> = {
  '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
  '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾',
  'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ',
  'k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ',
  'v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ',
}
export const TO_SUB: Record<string, string> = {
  '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
  '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎',
  'a':'ₐ','e':'ₑ','o':'ₒ','x':'ₓ','h':'ₕ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','p':'ₚ','s':'ₛ','t':'ₜ',
}

export const UNIT_CHARS_OTHER = [
  { group: 'ตัวคั่น', chars: ['·', '×', '/', '⁻'] },
  { group: 'กรีก', chars: ['μ', 'Ω', 'θ', 'α', 'β', 'γ', 'λ', 'ρ'] },
  { group: 'อื่นๆ', chars: ['°', 'Δ', '∞', '%', '√', '∑'] },
]

export function UnitField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

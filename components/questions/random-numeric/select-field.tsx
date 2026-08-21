'use client'

import { ChevronDown } from 'lucide-react'
import { NativeSelect } from '@/components/ui/native-select'

// ─── SelectField ──────────────────────────────────────────────────────────────

export function SelectField({ label, value, onChange, placeholder, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; options: { value: string; label: string }[]; disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="relative">
        <NativeSelect
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled} className="w-full pl-3 pr-8 appearance-none cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

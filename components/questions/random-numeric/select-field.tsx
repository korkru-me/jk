'use client'

import { ChevronDown } from 'lucide-react'

// ─── SelectField ──────────────────────────────────────────────────────────────

export function SelectField({ label, value, onChange, placeholder, options, disabled }: {
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

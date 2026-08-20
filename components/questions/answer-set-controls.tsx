'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { PartLabelStyle } from '@/lib/part-labels'

// Shared building blocks for any "answer set" UI (numeric sub-questions, true/false
// statements, ...): a labeled card, a label-style picker, and an add button. The
// first item in a set is locked (can't be removed) and stays bare — no card chrome,
// no label — until a second item is added, at which point both get labeled.

export const LABEL_STYLE_OPTIONS: { value: PartLabelStyle; sample: string }[] = [
  { value: 'thai', sample: 'ก ข ค' },
  { value: 'number', sample: '1 2 3' },
  { value: 'latin', sample: 'a b c' },
]

export function LabelStyleToggle({ value, onChange }: { value: PartLabelStyle; onChange: (v: PartLabelStyle) => void }) {
  return (
    <div className="flex gap-1.5">
      {LABEL_STYLE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-lg border text-xs font-medium font-mono transition-colors ${
            value === opt.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-ring'
          }`}
        >
          {opt.sample}
        </button>
      ))}
    </div>
  )
}

export function AnswerPartCard({
  label, locked, onRemove, children,
}: {
  label: string
  locked?: boolean
  onRemove?: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`border rounded-xl overflow-hidden bg-card ${locked ? 'border-primary/20' : 'border-border'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${locked ? 'bg-primary/10 border-primary/20' : 'bg-muted border-border'}`}>
        <span className={`text-sm font-bold ${locked ? 'text-primary' : 'text-muted-foreground'}`}>
          ข้อย่อย {label})
          {locked && <span className="ml-1.5 font-normal text-primary text-xs">(คำตอบหลัก)</span>}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> ลบข้อนี้
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

export function AddSubItemButton({ onClick, label = 'เพิ่มโจทย์ย่อย' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary border-2 border-dashed border-primary/20 rounded-xl hover:border-primary hover:bg-primary/10 transition-colors w-full justify-center"
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  )
}

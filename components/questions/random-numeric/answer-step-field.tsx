'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ─── AnswerStepField ──────────────────────────────────────────────────────────

export const STEP_PRESETS = [
  { label: 'ปิด', value: 0 },
  { label: '0.01', value: 0.01 },
  { label: '0.1', value: 0.1 },
  { label: '0.5', value: 0.5 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
]

export function AnswerStepField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const isOff = !value || value <= 0
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-semibold text-muted-foreground">ขนาดก้าวคำตอบ</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
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
                ? 'bg-primary text-white border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/20 hover:text-primary'
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
      <p className="text-xs text-muted-foreground">
        {isOff
          ? 'ปิดอยู่ — คำตอบอาจเป็นเลขทศนิยมใดก็ได้'
          : `คำตอบต้องเป็นทวีคูณของ ${value}  ตัวอย่าง: ${[1,2,3,5].map(n => +(n * value).toPrecision(6)).join(', ')}...`}
      </p>
    </div>
  )
}

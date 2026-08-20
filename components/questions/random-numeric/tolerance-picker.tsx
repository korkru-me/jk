'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEffect, useState } from 'react'

// ─── TolerancePicker ──────────────────────────────────────────────────────────

export function TolerancePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [mode, setMode] = useState<'decimal' | 'percent'>(value < 0 ? 'percent' : 'decimal')
  const [display, setDisplay] = useState(Math.abs(value))

  useEffect(() => {
    setMode(value < 0 ? 'percent' : 'decimal')
    setDisplay(Math.abs(value))
  }, [value])

  function changeMode(m: 'decimal' | 'percent') {
    setMode(m)
    onChange(m === 'percent' ? -display : display)
  }
  function changeValue(v: number) {
    setDisplay(v)
    onChange(mode === 'percent' ? -v : v)
  }

  return (
    <div className="space-y-1.5">
      <Label>ค่าคลาดเคลื่อนที่ยอมรับ <span className="font-normal text-muted-foreground text-xs">(ใช้กับทุกข้อ)</span></Label>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(['decimal', 'percent'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`px-3 py-1.5 font-medium transition-colors ${mode === m ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              {m === 'decimal' ? 'ทศนิยม' : '%'}
            </button>
          ))}
        </div>
        <Input type="number" min={0} step={mode === 'decimal' ? 0.01 : 0.1} value={display} onChange={e => changeValue(Number(e.target.value))} className="w-28" />
        {mode === 'percent' && <span className="text-sm text-muted-foreground">%</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'decimal'
          ? `ยอมรับผิดพลาดได้ไม่เกิน ±${display} จากคำตอบที่ถูกต้อง`
          : `ยอมรับผิดพลาดได้ไม่เกิน ±${display}% ของคำตอบที่ถูกต้อง`}
      </p>
    </div>
  )
}

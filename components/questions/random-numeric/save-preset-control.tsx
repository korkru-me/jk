'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createFormulaPreset } from '@/lib/actions/questions'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PresetWithCat } from './shared'
import type { Variable } from '@/lib/types'

// ─── SavePresetControl ────────────────────────────────────────────────────────
// Offers to save a typed equation that doesn't already exist in the formula library.

export function SavePresetControl({ equation, targetVariable, variables, onSaved }: {
  equation: string
  targetVariable: string
  variables: Variable[]
  onSaved: (p: PresetWithCat) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('ตั้งชื่อสมการก่อนบันทึก'); return }
    setSaving(true)
    const result = await createFormulaPreset({
      formula_name: name.trim(),
      equation,
      target_variable: targetVariable,
      variables: variables.filter(v => !v.is_answer).map(v => ({ name: v.name, min: v.min, max: v.max })),
      description: description.trim() || undefined,
    })
    setSaving(false)
    if (result.error) { toast.error(result.error); return }
    toast.success('บันทึกสมการลงคลังแล้ว')
    if (result.data) onSaved(result.data as PresetWithCat)
    setExpanded(false)
    setName('')
    setDescription('')
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-blue-800 font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> บันทึกสมการนี้ลงคลังสมการ
      </button>
    )
  }

  return (
    <div className="border border-primary/20 bg-primary/10 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-primary">บันทึกสมการนี้ลงคลังสมการ</p>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="ตั้งชื่อสมการ เช่น กฎข้อที่สองของนิวตัน" className="h-8 text-sm" />
      <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="คำอธิบาย (ไม่บังคับ)" className="h-8 text-sm" />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(false)} disabled={saving} className="h-8 text-xs">
          ยกเลิก
        </Button>
      </div>
    </div>
  )
}

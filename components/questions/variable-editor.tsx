'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Variable } from '@/lib/types'

interface VariableEditorProps {
  variables: Variable[]
  onChange: (vars: Variable[]) => void
}

const EMPTY_VAR: Variable = { name: '', min: 1, max: 10, unit: '', decimals: 0 }

export function VariableEditor({ variables, onChange }: VariableEditorProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Variable>({ ...EMPTY_VAR })
  const [error, setError] = useState('')

  function updateVar(index: number, field: keyof Variable, raw: string) {
    const updated = variables.map((v, i) => {
      if (i !== index) return v
      const val = ['min', 'max', 'decimals'].includes(field) ? Number(raw) : raw
      return { ...v, [field]: val }
    })
    onChange(updated)
  }

  function removeVar(index: number) {
    onChange(variables.filter((_, i) => i !== index))
  }

  function handleAdd() {
    setError('')
    if (!draft.name.trim()) { setError('ต้องมีชื่อตัวแปร'); return }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(draft.name)) {
      setError('ชื่อตัวแปรต้องเป็นภาษาอังกฤษ (a-z, 0-9, _)')
      return
    }
    if (variables.some((v) => v.name === draft.name)) {
      setError('ชื่อตัวแปรซ้ำ')
      return
    }
    if (draft.min > draft.max) { setError('ค่าต่ำสุดต้องน้อยกว่าค่าสูงสุด'); return }
    onChange([...variables, { ...draft }])
    setDraft({ ...EMPTY_VAR })
    setAdding(false)
  }

  return (
    <div className="space-y-3">
      {/* Variable list */}
      {variables.length > 0 && (
        <div className="space-y-2">
          {variables.map((v, i) => (
            <div key={i} className="border rounded-lg p-3 bg-gray-50">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div>
                  <Label className="text-xs text-gray-500">ชื่อ</Label>
                  <Input
                    value={v.name}
                    onChange={(e) => updateVar(i, 'name', e.target.value)}
                    className="h-8 font-mono text-sm"
                    placeholder="m"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">ต่ำสุด</Label>
                  <Input
                    type="number"
                    value={v.min}
                    onChange={(e) => updateVar(i, 'min', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">สูงสุด</Label>
                  <Input
                    type="number"
                    value={v.max}
                    onChange={(e) => updateVar(i, 'max', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">หน่วย</Label>
                  <Input
                    value={v.unit}
                    onChange={(e) => updateVar(i, 'unit', e.target.value)}
                    className="h-8 text-sm"
                    placeholder="kg"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500">ทศนิยม</Label>
                    <Input
                      type="number"
                      min={0}
                      max={6}
                      value={v.decimals}
                      onChange={(e) => updateVar(i, 'decimals', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVar(i)}
                    className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors text-sm"
                    title="ลบตัวแปร"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-3">
          <p className="text-sm font-medium text-blue-800">เพิ่มตัวแปรใหม่</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div>
              <Label className="text-xs text-gray-600">ชื่อ *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-8 font-mono text-sm"
                placeholder="m"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">ต่ำสุด *</Label>
              <Input
                type="number"
                value={draft.min}
                onChange={(e) => setDraft({ ...draft, min: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">สูงสุด *</Label>
              <Input
                type="number"
                value={draft.max}
                onChange={(e) => setDraft({ ...draft, max: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">หน่วย</Label>
              <Input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                className="h-8 text-sm"
                placeholder="kg"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">ทศนิยม</Label>
              <Input
                type="number"
                min={0}
                max={6}
                value={draft.decimals}
                onChange={(e) => setDraft({ ...draft, decimals: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleAdd}>
              เพิ่ม
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setAdding(false); setError(''); setDraft({ ...EMPTY_VAR }) }}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          className="w-full border-dashed"
        >
          + เพิ่มตัวแปร
        </Button>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { FormulaEditor } from './formula-editor/index'
import type { AnswerPart, Variable, FormulaPreset } from '@/lib/types'

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ']

function getLabel(index: number): string {
  return PART_LABELS[index] ?? String(index + 1)
}

function newPart(): AnswerPart {
  return {
    id: Math.random().toString(36).slice(2),
    sub_text: '',
    formula: '',
    unit: '',
    tolerance: 0.1,
  }
}

interface AnswerPartsEditorProps {
  parts: AnswerPart[]
  variables: Variable[]
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  onChange: (parts: AnswerPart[]) => void
  onVariablesChange: (vars: Variable[]) => void
}

export function AnswerPartsEditor({
  parts,
  variables,
  presets,
  onChange,
  onVariablesChange,
}: AnswerPartsEditorProps) {
  const isMulti = parts.length > 1

  function updatePart(index: number, patch: Partial<AnswerPart>) {
    onChange(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addPart() {
    onChange([...parts, newPart()])
  }

  function removePart(index: number) {
    if (parts.length <= 1) return
    onChange(parts.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      {parts.map((part, index) => (
        <PartCard
          key={part.id}
          part={part}
          index={index}
          label={getLabel(index)}
          isMulti={isMulti}
          canRemove={parts.length > 1}
          variables={variables}
          presets={presets}
          onChange={(patch) => updatePart(index, patch)}
          onVariablesChange={onVariablesChange}
          onRemove={() => removePart(index)}
        />
      ))}

      <button
        type="button"
        onClick={addPart}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border-2 border-dashed border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        เพิ่มข้อย่อย
      </button>
    </div>
  )
}

// ─── PartCard ────────────────────────────────────────────────────────────────

interface PartCardProps {
  part: AnswerPart
  index: number
  label: string
  isMulti: boolean
  canRemove: boolean
  variables: Variable[]
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  onChange: (patch: Partial<AnswerPart>) => void
  onVariablesChange: (vars: Variable[]) => void
  onRemove: () => void
}

function PartCard({
  part,
  label,
  isMulti,
  canRemove,
  variables,
  presets,
  onChange,
  onVariablesChange,
  onRemove,
}: PartCardProps) {
  const [toleranceMode, setToleranceMode] = useState<'decimal' | 'percent'>(
    part.tolerance < 0 ? 'percent' : 'decimal'
  )
  const [toleranceValue, setToleranceValue] = useState(Math.abs(part.tolerance))

  function handleToleranceModeChange(mode: 'decimal' | 'percent') {
    setToleranceMode(mode)
    const stored = mode === 'percent' ? -toleranceValue : toleranceValue
    onChange({ tolerance: stored })
  }

  function handleToleranceValueChange(val: number) {
    setToleranceValue(val)
    const stored = toleranceMode === 'percent' ? -val : val
    onChange({ tolerance: stored })
  }

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${isMulti ? 'border-gray-200' : 'border-gray-200'}`}>
      {/* Card header — only shown when multi */}
      {isMulti && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-700">
            ข้อย่อย {label})
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ลบข้อนี้
            </button>
          )}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Sub-text (only shown when multi) */}
        {isMulti && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              คำถามย่อย <span className="font-normal">(ไม่บังคับ)</span>
            </Label>
            <Input
              value={part.sub_text}
              onChange={(e) => onChange({ sub_text: e.target.value })}
              placeholder={`เช่น จงหาความเร่งของวัตถุ`}
              className="text-sm"
            />
          </div>
        )}

        {/* Formula editor */}
        <FormulaEditor
          variables={variables}
          value={part.formula}
          unit={part.unit}
          presets={presets}
          onChange={(formula) => onChange({ formula })}
          onVariablesChange={onVariablesChange}
          onUnitChange={(unit) => onChange({ unit })}
        />

        {/* Unit */}
        <div className="space-y-1.5">
          <Label>หน่วยของคำตอบ</Label>
          <RichTextEditor
            value={part.unit}
            onChange={(unit) => onChange({ unit })}
            placeholder="เช่น m/s², N·m, kg·m/s"
            rows={1}
          />
          <p className="text-xs text-gray-400">
            ใช้ปุ่ม x² สำหรับตัวยกกำลัง เช่น m/s²
          </p>
        </div>

        {/* Tolerance */}
        <div className="space-y-1.5">
          <Label>ค่าคลาดเคลื่อนที่ยอมรับ</Label>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => handleToleranceModeChange('decimal')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  toleranceMode === 'decimal'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                ทศนิยม
              </button>
              <button
                type="button"
                onClick={() => handleToleranceModeChange('percent')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  toleranceMode === 'percent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                %
              </button>
            </div>
            <Input
              type="number"
              min={0}
              step={toleranceMode === 'decimal' ? 0.01 : 0.1}
              value={toleranceValue}
              onChange={(e) => handleToleranceValueChange(Number(e.target.value))}
              className="w-28"
            />
            {toleranceMode === 'percent' && (
              <span className="text-sm text-gray-500">%</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {toleranceMode === 'decimal'
              ? `ยอมรับผิดพลาดได้ไม่เกิน ±${toleranceValue} จากคำตอบที่ถูกต้อง`
              : `ยอมรับผิดพลาดได้ไม่เกิน ±${toleranceValue}% ของคำตอบที่ถูกต้อง`}
          </p>
        </div>
      </div>
    </div>
  )
}

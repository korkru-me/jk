'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import type { Variable, FormulaPreset } from '@/lib/types'

interface MethodPresetsProps {
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  variables: Variable[]
  value: string
  unit: string
  onSelect: (formula: string, vars: Variable[], unit: string) => void
}

export function MethodPresets({ presets, variables, value, unit, onSelect }: MethodPresetsProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const categories = Array.from(
    new Map(
      presets
        .filter((p) => p.question_categories)
        .map((p) => [p.category_id, p.question_categories!.name])
    ).entries()
  )

  const filtered =
    selectedCategory === 'all'
      ? presets
      : presets.filter((p) => p.category_id === selectedCategory)

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>เลือกหมวด</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            ทั้งหมด
          </button>
          {categories.map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedCategory(id)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                selectedCategory === id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>สูตรในหมวดนี้</Label>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">ไม่พบสูตรในหมวดนี้</p>
          )}
          {filtered.map((preset) => (
            <div
              key={preset.id}
              className="border rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{preset.formula_name}</p>
                  <p className="font-mono text-sm text-blue-700 mt-0.5">{preset.equation}</p>
                  {preset.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelect(
                      preset.equation
                        .split('=')
                        .slice(1)
                        .join('=')
                        .trim() || preset.equation,
                      preset.variables as Variable[],
                      ''
                    )
                  }
                  className="shrink-0 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  เลือก
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {value && (
        <div className="space-y-1.5">
          <Label>สูตรที่เลือก:</Label>
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg font-mono text-sm">
            {value}
          </div>
        </div>
      )}

    </div>
  )
}

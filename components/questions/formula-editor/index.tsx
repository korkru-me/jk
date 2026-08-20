'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MethodAuto } from './method-auto'
import { MethodPresets } from './method-presets'
import { MethodBuilder } from './method-builder'
import { MethodCopy } from './method-copy'
import { PreviewPanel } from './preview-panel'
import type { Variable, FormulaPreset } from '@/lib/types'
import { Card } from '@/components/ui/card'

interface FormulaEditorProps {
  variables: Variable[]
  value: string
  unit: string
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  onChange: (formula: string) => void
  onVariablesChange?: (vars: Variable[]) => void
  onUnitChange?: (unit: string) => void
}

const TABS = [
  { value: 'auto', label: '✏️ พิมพ์เอง' },
  { value: 'presets', label: '📚 คลังสูตร' },
  { value: 'builder', label: '🔢 ปุ่มกด' },
  { value: 'copy', label: '📋 ลอกจาก' },
]

export function FormulaEditor({
  variables,
  value,
  unit,
  presets,
  onChange,
  onVariablesChange,
  onUnitChange,
}: FormulaEditorProps) {
  function handlePresetSelect(formula: string, vars: Variable[], selectedUnit: string) {
    onChange(formula)
    if (onVariablesChange) onVariablesChange(vars)
    if (onUnitChange) onUnitChange(selectedUnit)
  }

  return (
    <Card radius="md" className="overflow-hidden">
      <Tabs defaultValue="auto">
        <div className="border-b bg-muted px-3 pt-2">
          <TabsList variant="line" className="w-full justify-start gap-0">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2 text-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="p-4">
          <TabsContent value="auto">
            <MethodAuto
              variables={variables}
              value={value}
              unit={unit}
              onChange={onChange}
            />
          </TabsContent>

          <TabsContent value="presets">
            <MethodPresets
              presets={presets}
              variables={variables}
              value={value}
              unit={unit}
              onSelect={handlePresetSelect}
            />
          </TabsContent>

          <TabsContent value="builder">
            <MethodBuilder
              variables={variables}
              value={value}
              unit={unit}
              onChange={onChange}
            />
          </TabsContent>

          <TabsContent value="copy">
            <MethodCopy
              variables={variables}
              value={value}
              unit={unit}
              onSelect={handlePresetSelect}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Persistent preview — stays visible when switching tabs */}
      <div className="border-t">
        <PreviewPanel formula={value} variables={variables} unit={unit} />
      </div>
    </Card>
  )
}

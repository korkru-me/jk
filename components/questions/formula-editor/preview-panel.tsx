'use client'

import { useState } from 'react'
import { randomizeVariables, evaluateFormula } from '@/lib/math/evaluator'
import type { Variable } from '@/lib/types'
import { Button } from '@/components/ui/button'

interface PreviewPanelProps {
  formula: string
  variables: Variable[]
  unit: string
}

export function PreviewPanel({ formula, variables, unit }: PreviewPanelProps) {
  const [values, setValues] = useState<Record<string, number> | null>(null)
  const [result, setResult] = useState<number | string | null>(null)

  function handlePreview() {
    if (!formula || variables.length === 0) return
    const randomVals = randomizeVariables(variables)
    setValues(randomVals)
    const ans = evaluateFormula(formula, randomVals)
    setResult(ans)
  }

  const hasFormula = formula.trim().length > 0

  return (
    <div className="mt-3 border rounded-lg bg-gray-50 overflow-hidden">
      <div className="px-4 py-2 border-b bg-white flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">🔍 ดูเฉลย</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handlePreview}
          disabled={!hasFormula}
        >
          {values ? 'สุ่มชุดใหม่' : 'ดูเฉลย'}
        </Button>
      </div>

      {values && result !== null ? (
        <div className="p-4 space-y-2 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-1">ค่าตัวแปรที่สุ่มได้:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(values).map(([k, v]) => (
                <span key={k} className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-xs font-mono">
                  {k} = {v}
                </span>
              ))}
            </div>
          </div>
          <div className="pt-1">
            <p className="text-xs text-gray-500 mb-1">คำตอบที่คำนวณได้:</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-gray-900">
                {typeof result === 'number' ? result.toFixed(4).replace(/\.?0+$/, '') : result}
              </span>
              {unit && <span className="text-gray-600">{unit}</span>}
              {typeof result === 'number' ? (
                <span className="text-green-600 text-xs">✓ คำนวณได้</span>
              ) : (
                <span className="text-red-500 text-xs">✗ ตรวจสอบสูตรอีกครั้ง</span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 pt-1">
            💡 กรณาคำนวณเองเพื่อเทียบ: ค่าตรง = สูตรของคุณถูกต้อง
          </p>
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-400 text-center">
          {hasFormula ? 'กดปุ่ม "ดูเฉลย" เพื่อทดสอบสูตร' : 'กรอกสูตรคำตอบก่อน'}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { liveCalculate } from '@/lib/math/evaluator'
import type { Variable } from '@/lib/types'

interface MethodAutoProps {
  variables: Variable[]
  value: string
  onChange: (formula: string) => void
  unit: string
}

export function MethodAuto({ variables, value, onChange, unit }: MethodAutoProps) {
  const [solverOpen, setSolverOpen] = useState(false)
  const [equation, setEquation] = useState('')
  const [target, setTarget] = useState('')
  const [solving, setSolving] = useState(false)
  const [solverError, setSolverError] = useState('')

  const valueVars = variables.filter((v) => v.type !== 'reference')
  const liveResult = value.trim() ? liveCalculate(value, variables) : null
  const isValid = typeof liveResult === 'number'

  function appendVar(name: string) {
    onChange(value + name)
  }

  async function handleSolve() {
    if (!equation.trim() || !target) {
      setSolverError('กรอกสมการและเลือกตัวแปรที่ต้องการหา')
      return
    }
    setSolving(true)
    setSolverError('')
    try {
      const nerdamer = (await import('nerdamer/all')).default as any
      const result = nerdamer.solve(equation, target).toString()
      const clean = result.replace(/\[|\]/g, '').trim()
      onChange(clean)
      setSolverOpen(false)
    } catch {
      setSolverError('ไม่สามารถแก้สมการได้ ลองใส่สมการแบบอื่น')
    } finally {
      setSolving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Primary: direct formula input */}
      <div className="space-y-1.5">
        <Label>พิมพ์สูตรคำตอบโดยตรง</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="เช่น  F/m  หรือ  sqrt(2*h/g)  หรือ  0.5*m*v^2"
          className="font-mono text-base"
        />
        <p className="text-xs text-gray-500">
          * คูณ &nbsp;/&nbsp; หาร &nbsp;^ ยกกำลัง &nbsp;sqrt( ) รากที่สอง &nbsp;pi ค่าพาย
        </p>
      </div>

      {/* Variable chips */}
      {valueVars.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">คลิกเพื่อแทรกตัวแปร:</Label>
          <div className="flex flex-wrap gap-2">
            {valueVars.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => appendVar(v.name)}
                className="px-3 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm font-mono hover:bg-blue-100 transition-colors"
              >
                {v.name}
                {v.unit && <span className="ml-1 text-xs opacity-60">({v.unit})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline live result */}
      {value.trim() && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
          isValid ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <span className="font-mono flex-1 truncate">{value}</span>
          <span className="opacity-40">=</span>
          <span className="font-bold font-mono shrink-0">
            {isValid ? String(liveResult) : 'สูตรไม่ถูกต้อง'}
          </span>
          {isValid && unit && <span className="shrink-0">{unit}</span>}
          <span className="text-xs opacity-50 shrink-0">(ค่ากลาง)</span>
        </div>
      )}

      {/* Equation solver (collapsible) */}
      <div className="border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setSolverOpen((o) => !o)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-sm bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <span className="font-medium text-gray-700">
            ✨ แก้สมการอัตโนมัติ
            <span className="ml-1 text-xs font-normal text-gray-400">(ป้อนสมการ ระบบหาสูตรให้)</span>
          </span>
          <span className="text-gray-400 text-xs">{solverOpen ? '▲ ซ่อน' : '▼ เปิด'}</span>
        </button>

        {solverOpen && (
          <div className="p-4 space-y-3 border-t bg-white">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">สมการตั้งต้น</Label>
              <Input
                value={equation}
                onChange={(e) => setEquation(e.target.value)}
                placeholder="เช่น  F = m * a  หรือ  v^2 = u^2 + 2*a*s"
                className="font-mono"
                autoFocus
              />
            </div>

            {valueVars.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">ต้องการหาตัวแปร</Label>
                <div className="flex flex-wrap gap-2">
                  {valueVars.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => setTarget(v.name)}
                      className={`px-3 py-1 rounded-lg border text-sm font-mono transition-colors ${
                        target === v.name
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="button"
              size="sm"
              onClick={handleSolve}
              disabled={solving || !equation.trim() || !target}
            >
              {solving ? 'กำลังแก้สมการ...' : '🔍 แก้สมการ → นำไปใช้'}
            </Button>

            {solverError && <p className="text-sm text-red-500">{solverError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

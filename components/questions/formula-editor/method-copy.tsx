'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchQuestions } from '@/lib/actions/questions'
import type { Variable } from '@/lib/types'

interface SearchResult {
  id: string
  title: string
  answer_formula: string
  variables: Variable[]
  answer_unit: string | null
}

interface MethodCopyProps {
  variables: Variable[]
  value: string
  unit: string
  onSelect: (formula: string, vars: Variable[], unit: string) => void
}

export function MethodCopy({ variables, value, unit, onSelect }: MethodCopyProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isPending, startTransition] = useTransition()

  function handleSearch(q: string) {
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    startTransition(async () => {
      const data = await searchQuestions(q) as SearchResult[]
      setResults(data)
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>🔍 ค้นหาโจทย์ที่มีสูตรคล้ายกัน</Label>
        <Input
          placeholder="พิมพ์ชื่อโจทย์..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {isPending && (
        <p className="text-sm text-muted-foreground text-center py-2">กำลังค้นหา...</p>
      )}

      {results.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ผลการค้นหา (จากคลังส่วนตัว):</Label>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {results.map((q) => (
              <div key={q.id} className="border rounded-lg p-3 hover:border-primary/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{q.title}</p>
                    <p className="font-mono text-xs text-primary mt-0.5">{q.answer_formula}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ตัวแปร: {(q.variables as Variable[]).map((v) => v.name).join(', ')} {q.answer_unit ? `| หน่วย: ${q.answer_unit}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(
                        q.answer_formula,
                        q.variables as Variable[],
                        q.answer_unit ?? ''
                      )
                    }
                    className="shrink-0 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    ใช้สูตรนี้
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {query.length >= 2 && !isPending && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">ไม่พบโจทย์ที่ตรงกัน</p>
      )}

      {value && (
        <div className="space-y-1.5">
          <Label>สูตรที่เลือก:</Label>
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg font-mono text-sm">
            {value}
          </div>
        </div>
      )}

    </div>
  )
}

'use client'

import { PYTHAGOREAN_FAMILIES } from '@/lib/math/evaluator'
import { Plus, X } from 'lucide-react'
import type { PythagoreanGroup } from '@/lib/types'
import { Card } from '@/components/ui/card'

// ─── PythagoreanModePanel ─────────────────────────────────────────────────────

export function PythagoreanModePanel({ enabled, onEnabledChange, groups, onGroupsChange, availableVarNames }: {
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  groups: PythagoreanGroup[]
  onGroupsChange: (g: PythagoreanGroup[]) => void
  availableVarNames: string[]
}) {
  function addGroup() {
    const mapped = new Set(groups.flatMap(g => [g.a_var, g.b_var, g.c_var]))
    const free = availableVarNames.filter(n => !mapped.has(n))
    onGroupsChange([...groups, {
      id: crypto.randomUUID(),
      a_var: free[0] ?? availableVarNames[0] ?? '',
      b_var: free[1] ?? availableVarNames[1] ?? '',
      c_var: free[2] ?? availableVarNames[2] ?? '',
    }])
  }

  function removeGroup(id: string) {
    onGroupsChange(groups.filter(g => g.id !== id))
  }

  function updateGroup(id: string, patch: Partial<PythagoreanGroup>) {
    onGroupsChange(groups.map(g => g.id === id ? { ...g, ...patch } : g))
  }

  return (
    <Card radius="md" elevation="sm" className="border-tint-1/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-tint-1/10 border-b border-tint-1/20">
        <div>
          <p className="text-sm font-bold text-tint-1">โหมดชุดตัวเลขพิเศษ (Pythagorean)</p>
          <p className="text-xs text-tint-1 mt-0.5">
            สุ่มหยิบชุด (a, b, c) ที่ a² + b² = c² ลงตัวเสมอ — เหมาะสำหรับโจทย์เวกเตอร์และ ก.พ.ท.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (enabled) onGroupsChange([])
            onEnabledChange(!enabled)
          }}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-tint-1' : 'bg-muted'}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-card rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {enabled && (
        <div className="p-4 space-y-4">
          {/* Triple preview */}
          <div className="bg-tint-1/10 border border-tint-1/20 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-tint-1">ชุดตัวเลขที่ระบบจะสุ่มใช้ ({ALL_PYTHAGOREAN_TRIPLES_COUNT} ชุด):</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PYTHAGOREAN_FAMILIES.map(f => (
                <div key={f.name} className="space-y-0.5">
                  <p className="text-[10px] font-bold text-tint-1">{f.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                    {f.triples.map(t => `(${t[0]}, ${t[1]}, ${t[2]})`).join('  ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Group editor */}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              ยังไม่มีกลุ่ม — กด &ldquo;เพิ่มกลุ่ม&rdquo; ด้านล่างเพื่อ map ตัวแปรกับตำแหน่ง a, b, c
            </p>
          )}

          {groups.map((g, gi) => (
            <div key={g.id} className="border border-tint-1/20 rounded-xl p-3 space-y-2 bg-tint-1/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-tint-1">กลุ่มที่ {gi + 1}</p>
                <button type="button" onClick={() => removeGroup(g.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['a_var', 'b_var', 'c_var'] as const).map((slot, si) => (
                  <div key={slot}>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                      {si === 0 ? 'ด้านสั้น a' : si === 1 ? 'ด้านยาว b' : 'ด้านเฉียง c'}
                    </p>
                    <select
                      value={g[slot]}
                      onChange={e => updateGroup(g.id, { [slot]: e.target.value })}
                      className="w-full h-8 text-xs font-mono border border-tint-1/20 rounded-lg px-2 bg-card focus:outline-none focus:ring-1 focus:ring-tint-1/40"
                    >
                      <option value="">-- เลือก --</option>
                      {availableVarNames.map(n => (
                        <option key={n} value={n}>{'{' + n + '}'}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-tint-1">a² + b² = c² — ระบบจะสุ่มหยิบชุดตัวเลขทั้งแพ็กเกจ</p>
            </div>
          ))}

          <button
            type="button"
            onClick={addGroup}
            disabled={availableVarNames.length < 3}
            className="flex items-center gap-1.5 text-xs text-tint-1 hover:text-tint-1 font-medium transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มกลุ่มตัวแปร Pythagorean
          </button>
          {availableVarNames.length < 3 && (
            <p className="text-xs text-destructive">ต้องมีตัวแปรอย่างน้อย 3 ตัวก่อนใช้โหมดนี้</p>
          )}
        </div>
      )}
    </Card>
  )
}

export const ALL_PYTHAGOREAN_TRIPLES_COUNT = PYTHAGOREAN_FAMILIES.reduce((s, f) => s + f.triples.length, 0)

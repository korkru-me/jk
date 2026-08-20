'use client'

import { useState, useCallback, useEffect } from 'react'
import { Shuffle, GripVertical, Zap, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

// ---- Physics Randomizer Demo ----

type FormulaTemplate = {
  id: string
  name: string
  formula: string
  vars: { key: string; label: string; unit: string; min: number; max: number; step: number }[]
  result: (vals: Record<string, number>) => { label: string; value: number; unit: string }
  description: (vals: Record<string, number>, res: { value: number }) => string
}

const FORMULAS: FormulaTemplate[] = [
  {
    id: 'newton2',
    name: 'กฎข้อที่ 2 ของนิวตัน',
    formula: 'F = ma',
    vars: [
      { key: 'm', label: 'มวล (m)', unit: 'kg', min: 1, max: 20, step: 0.1 },
      { key: 'a', label: 'ความเร่ง (a)', unit: 'm/s²', min: 0.5, max: 15, step: 0.1 },
    ],
    result: (v) => ({ label: 'F', value: v.m * v.a, unit: 'N' }),
    description: (v, r) =>
      `วัตถุมวล ${v.m} kg เคลื่อนที่ด้วยความเร่ง ${v.a} m/s² จงหาแรงสุทธิที่กระทำต่อวัตถุ`,
  },
  {
    id: 'kinematics',
    name: 'สมการการเคลื่อนที่',
    formula: 'v = u + at',
    vars: [
      { key: 'u', label: 'ความเร็วต้น (u)', unit: 'm/s', min: 0, max: 30, step: 0.5 },
      { key: 'a', label: 'ความเร่ง (a)', unit: 'm/s²', min: 1, max: 10, step: 0.5 },
      { key: 't', label: 'เวลา (t)', unit: 's', min: 1, max: 10, step: 0.5 },
    ],
    result: (v) => ({ label: 'v', value: v.u + v.a * v.t, unit: 'm/s' }),
    description: (v, r) =>
      `วัตถุเคลื่อนที่ด้วยความเร็วต้น ${v.u} m/s มีความเร่ง ${v.a} m/s² นาน ${v.t} s ความเร็วปลายคือเท่าใด`,
  },
  {
    id: 'energy',
    name: 'พลังงานจลน์',
    formula: 'KE = ½mv²',
    vars: [
      { key: 'm', label: 'มวล (m)', unit: 'kg', min: 0.5, max: 20, step: 0.5 },
      { key: 'v', label: 'ความเร็ว (v)', unit: 'm/s', min: 1, max: 30, step: 0.5 },
    ],
    result: (v) => ({ label: 'KE', value: 0.5 * v.m * v.v * v.v, unit: 'J' }),
    description: (v, r) =>
      `วัตถุมวล ${v.m} kg เคลื่อนที่ด้วยความเร็ว ${v.v} m/s พลังงานจลน์ของวัตถุคือเท่าใด`,
  },
]

function randomInRange(min: number, max: number, step: number) {
  const steps = Math.floor((max - min) / step)
  const picked = Math.floor(Math.random() * (steps + 1))
  return Math.round((min + picked * step) * 100) / 100
}

function genValues(template: FormulaTemplate) {
  const vals: Record<string, number> = {}
  for (const v of template.vars) {
    vals[v.key] = randomInRange(v.min, v.max, v.step)
  }
  return vals
}

function midValues(template: FormulaTemplate) {
  const vals: Record<string, number> = {}
  for (const v of template.vars) {
    const steps = Math.round((v.max - v.min) / v.step / 2)
    vals[v.key] = Math.round((v.min + steps * v.step) * 100) / 100
  }
  return vals
}

function PhysicsDemo() {
  const [tplIdx, setTplIdx] = useState(0)
  const tpl = FORMULAS[tplIdx]
  // Deterministic on first render so server and client markup match;
  // real randomization happens client-only in the effect below.
  const [vals, setVals] = useState<Record<string, number>>(() => midValues(FORMULAS[0]))
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setVals(genValues(FORMULAS[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const randomize = useCallback(() => {
    setVals(genValues(tpl))
    setRevealed(false)
  }, [tpl])

  function switchTemplate(idx: number) {
    setTplIdx(idx)
    setVals(genValues(FORMULAS[idx]))
    setRevealed(false)
  }

  const res = tpl.result(vals)

  return (
    <div className="space-y-4">
      {/* Formula tabs */}
      <div className="flex flex-wrap gap-2">
        {FORMULAS.map((f, i) => (
          <button
            key={f.id}
            onClick={() => switchTemplate(i)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              i === tplIdx
                ? 'bg-primary text-white'
                : 'border border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {f.formula} — {f.name}
          </button>
        ))}
      </div>

      {/* Question card */}
      <Card radius="md" padding="md">
        <div className="flex items-start justify-between mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary dark:bg-indigo-950/60">
            <Calculator className="h-3 w-3" />
            {tpl.name}
          </span>
          <button
            onClick={randomize}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <Shuffle className="h-3 w-3" />
            สุ่มตัวเลขใหม่
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          {tpl.description(vals, res)}
        </p>

        {/* Variable chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {tpl.vars.map((v) => (
            <span
              key={v.key}
              className="inline-flex items-center gap-1 rounded-lg border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-mono font-semibold text-success dark:border-emerald-800/50 dark:bg-emerald-950/40"
            >
              {v.key} = {vals[v.key]} {v.unit}
            </span>
          ))}
        </div>

        {/* Answer */}
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/20 hover:text-primary transition-colors dark:border-slate-700 dark:hover:border-primary"
          >
            กดเพื่อดูเฉลย
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-success/10 px-4 py-3 dark:bg-emerald-950/30">
            <Zap className="h-4 w-4 text-success" />
            <span className="text-sm text-muted-foreground">คำตอบ:</span>
            <span className="text-lg font-bold text-success">
              {res.label} = {res.value.toFixed(2)} {res.unit}
            </span>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        นักเรียนแต่ละคนจะได้รับตัวเลขต่างกัน — ระบบตรวจคะแนนอัตโนมัติโดยไม่ต้องตรวจด้วยมือ
      </p>
    </div>
  )
}

// ---- Drag-and-Drop Card Demo ----

const INITIAL_CARDS = [
  { id: 'c1', topic: 'แรงและการเคลื่อนที่', level: 'ง่าย', points: 4 },
  { id: 'c2', topic: 'พลังงานจลน์และศักย์', level: 'ปานกลาง', points: 6 },
  { id: 'c3', topic: 'คลื่นกลและเสียง', level: 'ปานกลาง', points: 6 },
  { id: 'c4', topic: 'ไฟฟ้าและแม่เหล็ก', level: 'ยาก', points: 10 },
]

const LEVEL_CLS: Record<string, string> = {
  ง่าย: 'bg-success/10 text-success dark:bg-emerald-950/60',
  ปานกลาง: 'bg-warning/10 text-warning dark:bg-amber-950/60',
  ยาก: 'bg-destructive/10 text-destructive dark:bg-red-950/60',
}

function DragDemo() {
  const [cards, setCards] = useState(INITIAL_CARDS)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  function onDragStart(id: string) {
    setDragging(id)
  }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    setOver(id)
  }

  function onDrop(targetId: string) {
    if (!dragging || dragging === targetId) return
    setCards((prev) => {
      const fromIdx = prev.findIndex((c) => c.id === dragging)
      const toIdx = prev.findIndex((c) => c.id === targetId)
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        ลากวางเพื่อจัดลำดับข้อสอบในชุด — ตัวอย่างการจัดการชุดข้อสอบ
      </p>
      {cards.map((card, idx) => (
        <div
          key={card.id}
          draggable
          onDragStart={() => onDragStart(card.id)}
          onDragOver={(e) => onDragOver(e, card.id)}
          onDrop={() => onDrop(card.id)}
          onDragEnd={() => { setDragging(null); setOver(null) }}
          className={cn(
            'flex items-center gap-3 rounded-xl border bg-card p-3.5 cursor-grab active:cursor-grabbing transition-all select-none',
            'dark:bg-slate-900',
            dragging === card.id
              ? 'opacity-50 scale-95 border-primary/20'
              : over === card.id
                ? 'border-primary ring-2 ring-indigo-100 dark:border-primary dark:ring-indigo-900/50'
                : 'border-border',
          )}
        >
          <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:bg-indigo-950/60">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {card.topic}
            </p>
          </div>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEVEL_CLS[card.level])}>
            {card.level}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {card.points} คะแนน
          </span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground text-center">
        รวม {cards.reduce((s, c) => s + c.points, 0)} คะแนน
      </p>
    </div>
  )
}

// ---- Main Demo Component ----

export function InteractiveDemo() {
  const [tab, setTab] = useState<'physics' | 'drag'>('physics')

  return (
    <section className="bg-card py-20 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            ทดลองใช้งานได้เลย ไม่ต้องล็อกอิน
          </h2>
          <p className="mt-3 text-muted-foreground">
            สัมผัสประสบการณ์จริงก่อนตัดสินใจ ฟีเจอร์หลักทั้งสองอยู่ด้านล่างนี้
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          {/* Tabs */}
          <div className="mb-6 flex rounded-xl border border-border bg-muted p-1 dark:border-slate-700 dark:bg-slate-900">
            <button
              onClick={() => setTab('physics')}
              className={cn(
                'flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all',
                tab === 'physics'
                  ? 'bg-card text-foreground shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-200',
              )}
            >
              สุ่มตัวเลขฟิสิกส์
            </button>
            <button
              onClick={() => setTab('drag')}
              className={cn(
                'flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all',
                tab === 'drag'
                  ? 'bg-card text-foreground shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-200',
              )}
            >
              จัดลำดับข้อสอบ
            </button>
          </div>

          {tab === 'physics' ? <PhysicsDemo /> : <DragDemo />}
        </div>
      </div>
    </section>
  )
}

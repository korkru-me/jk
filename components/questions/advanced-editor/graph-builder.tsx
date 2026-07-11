'use client'

import { useState, useCallback } from 'react'
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceDot,
  Line,
} from 'recharts'
import { Plus, Trash2, Download, ArrowRight, Circle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VectorPoint {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  color: string
}

interface LabeledPoint {
  id: string
  x: number
  y: number
  label: string
  color: string
}

interface GraphState {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  vectors: VectorPoint[]
  points: LabeledPoint[]
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']

function newVector(): VectorPoint {
  return {
    id: crypto.randomUUID(),
    x1: 0,
    y1: 0,
    x2: 3,
    y2: 4,
    label: 'F',
    color: '#3b82f6',
  }
}

function newPoint(): LabeledPoint {
  return {
    id: crypto.randomUUID(),
    x: 2,
    y: 3,
    label: 'A',
    color: '#ef4444',
  }
}

// ─── Custom ArrowDot (renders arrow tip on a line endpoint) ──────────────────

function CustomArrow({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (cx === undefined || cy === undefined) return null
  return (
    <circle cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1.5} />
  )
}

// ─── Graph Builder Component ──────────────────────────────────────────────────

interface Props {
  onInsert?: (svgDataUrl: string) => void
}

export function GraphBuilder({ onInsert }: Props) {
  const [graph, setGraph] = useState<GraphState>({
    xMin: -5,
    xMax: 10,
    yMin: -5,
    yMax: 10,
    vectors: [],
    points: [],
  })
  const [activeTab, setActiveTab] = useState<'vectors' | 'points' | 'axes'>('vectors')

  const addVector = useCallback(() => {
    setGraph(g => ({ ...g, vectors: [...g.vectors, newVector()] }))
  }, [])

  const addPoint = useCallback(() => {
    setGraph(g => ({ ...g, points: [...g.points, newPoint()] }))
  }, [])

  const updateVector = useCallback((id: string, patch: Partial<VectorPoint>) => {
    setGraph(g => ({ ...g, vectors: g.vectors.map(v => v.id === id ? { ...v, ...patch } : v) }))
  }, [])

  const updatePoint = useCallback((id: string, patch: Partial<LabeledPoint>) => {
    setGraph(g => ({ ...g, points: g.points.map(p => p.id === id ? { ...p, ...patch } : p) }))
  }, [])

  const removeVector = useCallback((id: string) => {
    setGraph(g => ({ ...g, vectors: g.vectors.filter(v => v.id !== id) }))
  }, [])

  const removePoint = useCallback((id: string) => {
    setGraph(g => ({ ...g, points: g.points.filter(p => p.id !== id) }))
  }, [])

  // Build data for vector lines (each vector is 2 points)
  const vectorLineData = graph.vectors.map(v => [
    { x: v.x1, y: v.y1 },
    { x: v.x2, y: v.y2 },
  ])

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 text-sm">
        {(['vectors', 'points', 'axes'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-400 border-b-2 border-blue-600'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'vectors' ? 'เวกเตอร์' : tab === 'points' ? 'จุด' : 'แกน'}
          </button>
        ))}
      </div>

      <div className="flex gap-0 flex-col sm:flex-row">
        {/* Control panel */}
        <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-gray-800 p-3 space-y-3 overflow-y-auto max-h-64 sm:max-h-none">

          {activeTab === 'vectors' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={addVector}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                เพิ่มเวกเตอร์
              </button>

              {graph.vectors.map((v, idx) => (
                <div key={v.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5" style={{ color: v.color }} />
                      เวกเตอร์ {idx + 1}
                    </span>
                    <button type="button" onClick={() => removeVector(v.id)}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <NumberInput label="x₁" value={v.x1} onChange={val => updateVector(v.id, { x1: val })} />
                    <NumberInput label="y₁" value={v.y1} onChange={val => updateVector(v.id, { y1: val })} />
                    <NumberInput label="x₂" value={v.x2} onChange={val => updateVector(v.id, { x2: val })} />
                    <NumberInput label="y₂" value={v.y2} onChange={val => updateVector(v.id, { y2: val })} />
                  </div>

                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                      value={v.label}
                      onChange={e => updateVector(v.id, { label: e.target.value })}
                      placeholder="ชื่อ"
                    />
                    <div className="flex gap-1">
                      {COLORS.slice(0, 4).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateVector(v.id, { color: c })}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full transition-transform ${v.color === c ? 'scale-125 ring-2 ring-white ring-offset-1' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {graph.vectors.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">กดปุ่มด้านบนเพื่อเพิ่มเวกเตอร์</p>
              )}
            </div>
          )}

          {activeTab === 'points' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={addPoint}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                เพิ่มจุด
              </button>

              {graph.points.map((p, idx) => (
                <div key={p.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Circle className="w-3 h-3 fill-current" style={{ color: p.color }} />
                      จุด {idx + 1}
                    </span>
                    <button type="button" onClick={() => removePoint(p.id)}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberInput label="x" value={p.x} onChange={val => updatePoint(p.id, { x: val })} />
                    <NumberInput label="y" value={p.y} onChange={val => updatePoint(p.id, { y: val })} />
                  </div>

                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                      value={p.label}
                      onChange={e => updatePoint(p.id, { label: e.target.value })}
                      placeholder="ชื่อจุด"
                    />
                    <div className="flex gap-1">
                      {COLORS.slice(0, 4).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updatePoint(p.id, { color: c })}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full transition-transform ${p.color === c ? 'scale-125 ring-2 ring-white ring-offset-1' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {graph.points.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">กดปุ่มด้านบนเพื่อเพิ่มจุด</p>
              )}
            </div>
          )}

          {activeTab === 'axes' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ช่วงแกน</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="X min" value={graph.xMin} onChange={val => setGraph(g => ({ ...g, xMin: val }))} />
                <NumberInput label="X max" value={graph.xMax} onChange={val => setGraph(g => ({ ...g, xMax: val }))} />
                <NumberInput label="Y min" value={graph.yMin} onChange={val => setGraph(g => ({ ...g, yMin: val }))} />
                <NumberInput label="Y max" value={graph.yMax} onChange={val => setGraph(g => ({ ...g, yMax: val }))} />
              </div>
            </div>
          )}
        </div>

        {/* Chart canvas */}
        <div className="flex-1 p-3 min-h-[280px]">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[graph.xMin, graph.xMax]}
                tickCount={7}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[graph.yMin, graph.yMax]}
                tickCount={7}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />

              {/* Axes at zero */}
              <ReferenceLine x={0} stroke="#374151" strokeWidth={1.5} />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />

              {/* Vectors as line segments */}
              {vectorLineData.map((pts, idx) => {
                const v = graph.vectors[idx]
                return (
                  <Line
                    key={v.id}
                    data={pts}
                    dataKey="y"
                    type="linear"
                    dot={<CustomArrow color={v.color} />}
                    stroke={v.color}
                    strokeWidth={2}
                    isAnimationActive={false}
                    label={false}
                  />
                )
              })}

              {/* Labeled points */}
              {graph.points.map(p => (
                <ReferenceDot
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  r={5}
                  fill={p.color}
                  stroke="white"
                  strokeWidth={1.5}
                  label={{ value: p.label, position: 'top', fill: p.color, fontSize: 11, fontWeight: 700 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footer */}
      {onInsert && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={() => onInsert('graph-placeholder')}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            แทรกกราฟลงในโจทย์
          </button>
        </div>
      )}
    </div>
  )
}

// ─── NumberInput ──────────────────────────────────────────────────────────────

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 dark:text-gray-400 font-medium mb-0.5">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        step="any"
      />
    </div>
  )
}

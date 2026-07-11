'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import type { Question } from '@/lib/types'
import type { AnalyticsSubmissionRow } from '../page'
import { DistractorChart } from './distractor-chart'

function seedRand(seed: string, index: number): number {
  const h = [...seed].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (index + 7) * 2654435761) >>> 0) % 1000) / 1000
}

interface Props {
  questions: Question[]
  submissions: AnalyticsSubmissionRow[]
  assignmentId: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="text-gray-500 mb-0.5">อัตราการตอบผิด</p>
      <p className="font-bold text-red-600 text-base">{payload[0].value}%</p>
    </div>
  )
}

export function ItemAnalysisSection({ questions, submissions, assignmentId }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  if (questions.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">ไม่มีข้อมูลโจทย์</p>
      </div>
    )
  }

  // Generate mock error rates (% who answered WRONG)
  const qStats = questions.map((q, i) => {
    const errorRate = Math.round(20 + seedRand(q.id + assignmentId, i) * 68)
    return { q, errorRate, index: i }
  })

  // Sort by highest error rate, take top 5
  const top5 = [...qStats].sort((a, b) => b.errorRate - a.errorRate).slice(0, 5)

  const chartData = top5.map((item, i) => ({
    name: `ข้อ ${item.index + 1}`,
    fullName: item.q.title,
    errorRate: item.errorRate,
    qIndex: item.index,
    q: item.q,
  }))

  const selectedItem = selectedIdx !== null ? chartData[selectedIdx] : null

  return (
    <div className="space-y-5">
      {/* Top bar: info */}
      <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>5 ข้อที่มีนักเรียนตอบผิดมากที่สุด · กดที่แท่งกราฟหรือรายการเพื่อดู Distractor Analysis</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
        {/* Main chart */}
        <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">อัตราการตอบผิดรายข้อ (Top 5)</p>
          <p className="text-xs text-gray-400 mb-4">ยิ่งสูง = นักเรียนตอบผิดมากกว่า → ควรทบทวน</p>

          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={v => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
              <Bar dataKey="errorRate" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === selectedIdx ? '#ef4444' :
                      entry.errorRate >= 60 ? '#fca5a5' :
                      entry.errorRate >= 40 ? '#fcd34d' :
                      '#86efac'
                    }
                    cursor="pointer"
                    onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distractor chart panel */}
        {selectedItem && (
          <div className="lg:w-[320px]">
            <DistractorChart question={selectedItem.q} qLabel={selectedItem.name} assignmentId={assignmentId} />
          </div>
        )}
      </div>

      {/* Question detail cards */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50">
          <p className="text-sm font-semibold text-gray-900">รายละเอียด 5 ข้อที่ควรทบทวน</p>
        </div>
        {chartData.map((item, i) => (
          <button
            key={item.q.id}
            onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
            className={`w-full flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 transition-colors text-left ${
              i === selectedIdx ? 'bg-red-50' : 'hover:bg-gray-50/50'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${
              item.errorRate >= 60 ? 'bg-red-100 text-red-600' :
              item.errorRate >= 40 ? 'bg-amber-100 text-amber-600' :
              'bg-green-100 text-green-600'
            }`}>
              {item.name.replace('ข้อ ', '')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.q.title}</p>
              <p className="text-xs text-gray-400 truncate mt-0.5">{item.q.question_text}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-lg font-black tabular-nums ${
                item.errorRate >= 60 ? 'text-red-500' :
                item.errorRate >= 40 ? 'text-amber-500' :
                'text-green-500'
              }`}>{item.errorRate}%</p>
              <p className="text-[10px] text-gray-400">ตอบผิด</p>
            </div>
            <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${
              i === selectedIdx ? 'rotate-90 text-red-400' : 'text-gray-300'
            }`} />
          </button>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'

function seededFraction(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function generateHeatmapData(anchorDate: string) {
  // Use midday UTC so subtracting days never crosses into a different local
  // date, and use the server-provided anchor for identical SSR/client output.
  const today = new Date(`${anchorDate}T12:00:00.000Z`)
  const data: { date: string; count: number; label: string }[] = []

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(today.getUTCDate() - i)

    const date = d.toISOString().slice(0, 10)
    const dateStr = d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Bangkok',
    })
    const random = seededFraction(`${anchorDate}:${date}`)

    // Midterm was ~14 days ago: spike before it (days 16–18 ago), low after, high at end
    let count = Math.floor(random * 12) + 2
    if (i >= 15 && i <= 18) count = Math.floor(random * 20) + 30 // pre-midterm peak
    else if (i >= 10 && i <= 14) count = Math.floor(random * 8) + 1  // post-exam lull
    else if (i <= 3) count = Math.floor(random * 15) + 15 // recent activity

    data.push({ date, count, label: dateStr })
  }
  return data
}

function getColor(count: number, max: number): string {
  const ratio = count / max
  if (ratio > 0.8) return 'bg-blue-600'
  if (ratio > 0.6) return 'bg-blue-500'
  if (ratio > 0.4) return 'bg-blue-300'
  if (ratio > 0.2) return 'bg-blue-100'
  return 'bg-gray-100'
}

export function EngagementHeatmap({ anchorDate }: { anchorDate: string }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; count: number } | null>(null)
  const data = useMemo(() => generateHeatmapData(anchorDate), [anchorDate])
  const max = useMemo(() => Math.max(...data.map(day => day.count)), [data])

  return (
    <div className="bg-white rounded-xl ring-1 ring-black/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">การเข้าใช้งาน 30 วันที่ผ่านมา</p>
          <p className="text-xs text-gray-400 mt-0.5">จำนวนนักเรียนที่เข้าทำแบบทดสอบต่อวัน</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">น้อย</span>
          {['bg-gray-100', 'bg-blue-100', 'bg-blue-300', 'bg-blue-500', 'bg-blue-600'].map(c => (
            <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span className="text-[10px] text-gray-400">มาก</span>
        </div>
      </div>

      <div className="relative">
        <div className="flex gap-1 flex-wrap">
          {data.map(day => (
            <div
              key={day.date}
              className={`w-7 h-7 rounded-md cursor-pointer transition-all hover:scale-110 hover:ring-2 hover:ring-blue-400 ${getColor(day.count, max)}`}
              onMouseEnter={e => {
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                setTooltip({ x: rect.left, y: rect.top - 40, label: day.label, count: day.count })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </div>

        {tooltip && (
          <div
            className="fixed z-50 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg pointer-events-none shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <span className="font-semibold">{tooltip.count} คน</span>
            <span className="text-gray-400 ml-1">· {tooltip.label}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <div className="w-2 h-2 rounded-full bg-blue-600" />
        <p className="text-xs text-gray-500">
          ยอดสูงสุดช่วง <span className="font-semibold text-gray-700">ก่อนสอบกลางภาค</span> ({max} คน/วัน)
        </p>
      </div>
    </div>
  )
}

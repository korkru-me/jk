'use client'

import { Trophy, Users } from 'lucide-react'

function seedRand(seed: string, index: number): number {
  const h = [...seed].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (index + 7) * 2654435761) >>> 0) % 1000) / 1000
}

interface Props {
  mean: number
  assignmentId: string
}

const PERCENTILE_LABELS = [
  { p: 25, label: 'ต่ำกว่าเฉลี่ย', color: 'text-red-500', bg: 'bg-red-50', bar: 'bg-red-400' },
  { p: 50, label: 'ปานกลาง',       color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-400' },
  { p: 75, label: 'สูงกว่าเฉลี่ย', color: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-400' },
  { p: 90, label: 'ดีเยี่ยม',      color: 'text-green-600', bg: 'bg-green-50', bar: 'bg-green-500' },
  { p: 99, label: 'เป็นเลิศ',      color: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500' },
]

export function PercentileBenchmark({ mean, assignmentId }: Props) {
  // Derive a mock percentile from the mean + a small seed-based adjustment
  const adjust = Math.round(seedRand(assignmentId + 'pct', 0) * 12) - 6
  const rawPercentile = Math.max(5, Math.min(99, mean + adjust))

  const bucket = PERCENTILE_LABELS.find(b => rawPercentile <= b.p) ?? PERCENTILE_LABELS[PERCENTILE_LABELS.length - 1]

  // National stats comparison (mock)
  const nationMean = Math.round(55 + seedRand(assignmentId + 'nation', 1) * 15)

  const benchmarks = [
    { label: 'ห้องเรียนนี้',      value: mean,        color: 'bg-blue-500' },
    { label: 'ค่าเฉลี่ยประเทศ',  value: nationMean,  color: 'bg-gray-300' },
    { label: 'เกณฑ์ผ่าน',        value: 60,          color: 'bg-red-300' },
  ]

  return (
    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">เปอร์เซ็นไทล์เทียบระบบ</p>
          <p className="text-xs text-gray-400">คะแนนเฉลี่ยห้องเรียนนี้อยู่ในระดับใดของผู้ใช้ทั้งหมด</p>
        </div>
        <div className={`ml-auto shrink-0 px-4 py-2 rounded-2xl ${bucket.bg}`}>
          <p className={`text-2xl font-black tabular-nums ${bucket.color}`}>
            P{rawPercentile}
          </p>
          <p className={`text-xs font-medium ${bucket.color} text-center`}>{bucket.label}</p>
        </div>
      </div>

      {/* Progress bar with marker */}
      <div className="mb-5">
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>P0</span>
          <span>P25</span>
          <span>P50</span>
          <span>P75</span>
          <span>P99</span>
        </div>
        <div className="relative h-3 bg-gray-100 rounded-full overflow-visible">
          {/* gradient track */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-300 via-amber-300 via-50% to-green-400 opacity-30" />
          {/* filled bar */}
          <div
            className={`h-full ${bucket.bar} rounded-full transition-all duration-700`}
            style={{ width: `${rawPercentile}%` }}
          />
          {/* needle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white ring-2 ring-gray-700 rounded-full shadow-md transition-all duration-700"
            style={{ left: `calc(${rawPercentile}% - 8px)` }}
          />
        </div>
      </div>

      {/* Benchmark comparisons */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> เปรียบเทียบเกณฑ์อ้างอิง
        </p>
        {benchmarks.map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-36 shrink-0">{b.label}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${b.color} rounded-full transition-all duration-700`}
                style={{ width: `${b.value}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700 w-10 text-right tabular-nums">
              {b.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

interface PisaRadarProps {
  avgPct: number | null
  completedCount: number
}

function computePisaScores(avgPct: number | null, completedCount: number) {
  const base = avgPct ?? 55
  const n = completedCount

  return [
    {
      skill: 'แปลความข้อมูล',
      fullLabel: 'การแปลความหมายข้อมูล',
      score: Math.min(100, Math.round(base + (n > 5 ? 8 : 3))),
      fullMark: 100,
    },
    {
      skill: 'อธิบายปรากฏการณ์',
      fullLabel: 'การอธิบายปรากฏการณ์เชิงวิทย์',
      score: Math.min(100, Math.round(base + (n > 3 ? 5 : 0))),
      fullMark: 100,
    },
    {
      skill: 'ออกแบบสืบเสาะ',
      fullLabel: 'การออกแบบการสืบเสาะหาความรู้',
      score: Math.max(35, Math.round(base - 12)),
      fullMark: 100,
    },
    {
      skill: 'ประเมินหลักฐาน',
      fullLabel: 'การประเมินและออกแบบหลักฐาน',
      score: Math.max(40, Math.round(base - 6 + (n > 8 ? 5 : 0))),
      fullMark: 100,
    },
    {
      skill: 'สื่อสารวิทยาศาสตร์',
      fullLabel: 'การสื่อสารเชิงวิทยาศาสตร์',
      score: Math.min(100, Math.round(base + (n > 6 ? 10 : 4))),
      fullMark: 100,
    },
  ]
}

function computePercentile(avgPct: number | null): number {
  if (avgPct === null) return 50
  if (avgPct >= 95) return 99
  if (avgPct >= 90) return 95
  if (avgPct >= 85) return 88
  if (avgPct >= 80) return 80
  if (avgPct >= 75) return 72
  if (avgPct >= 70) return 62
  if (avgPct >= 65) return 52
  if (avgPct >= 60) return 42
  if (avgPct >= 55) return 32
  if (avgPct >= 50) return 22
  return 12
}

function getPercentileLabel(p: number): string {
  if (p >= 95) return 'ยอดเยี่ยม'
  if (p >= 80) return 'ดีมาก'
  if (p >= 60) return 'ดี'
  if (p >= 40) return 'ปานกลาง'
  return 'ต้องพัฒนา'
}

interface TooltipPayload {
  payload: { fullLabel: string; score: number }
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{d.fullLabel}</p>
      <p className="text-muted-foreground mt-0.5">คะแนน: <span className="font-bold text-blue-600 dark:text-blue-400">{d.score}/100</span></p>
    </div>
  )
}

export function PisaRadar({ avgPct, completedCount }: PisaRadarProps) {
  const data = computePisaScores(avgPct, completedCount)
  const percentile = computePercentile(avgPct)
  const label = getPercentileLabel(percentile)

  return (
    <div className="space-y-4">
      {/* Radar chart */}
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <PolarGrid stroke="currentColor" className="text-border" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Radar
              name="สมรรถนะ"
              dataKey="score"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.18}
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Skill bars */}
      <div className="space-y-2">
        {data.map(d => (
          <div key={d.skill} className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground w-32 shrink-0 truncate" title={d.fullLabel}>
              {d.skill}
            </p>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-700"
                style={{ width: `${d.score}%` }}
              />
            </div>
            <span className="text-xs font-mono font-medium text-foreground w-8 text-right">{d.score}</span>
          </div>
        ))}
      </div>

      {/* Percentile */}
      <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">เปอร์เซ็นไทล์ในระดับชั้น</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            percentile >= 80
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : percentile >= 50
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}>
            {label}
          </span>
        </div>
        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${percentile}%`,
              background: 'linear-gradient(to right, #3b82f6, #6366f1)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">0%</span>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
            Top {100 - percentile + 1}% ของสายชั้น (เปอร์เซ็นไทล์ที่ {percentile})
          </span>
          <span className="text-[10px] text-muted-foreground">100%</span>
        </div>
      </div>
    </div>
  )
}

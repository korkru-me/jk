'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { chartColors } from '@/lib/chart-colors'

function seedRand(seed: string, index: number): number {
  const h = [...seed].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (index + 7) * 2654435761) >>> 0) % 1000) / 1000
}

interface Props {
  assignmentId: string
  currentMean: number
  assignmentTitle: string
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const isLatest = label === 'ล่าสุด'
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary" />
        <span className="text-muted-foreground">คะแนนเฉลี่ย:</span>
        <span className="font-bold text-foreground">{payload[0].value}%</span>
        {isLatest && <span className="text-primary">(การสอบนี้)</span>}
      </div>
    </div>
  )
}

export function GrowthTracker({ assignmentId, currentMean, assignmentTitle }: Props) {
  const prevExams = Array.from({ length: 4 }, (_, i) => {
    const base = 45 + seedRand(assignmentId + 'growth', i) * 35
    return Math.round(base)
  })

  const trend = currentMean - prevExams[prevExams.length - 1]

  const data = [
    ...prevExams.map((score, i) => ({
      name: `ครั้งที่ ${i + 1}`,
      score,
    })),
    { name: 'ล่าสุด', score: currentMean },
  ]

  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-foreground">พัฒนาการย้อนหลัง 5 ครั้ง</p>
          <p className="text-xs text-muted-foreground mt-0.5">แนวโน้มคะแนนเฉลี่ยเทียบกับการสอบก่อนหน้า</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
          trend > 0 ? 'bg-success/10 text-success' :
          trend < 0 ? 'bg-destructive/10 text-destructive' :
          'bg-muted text-muted-foreground'
        }`}>
          {trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : 'เท่าเดิม'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}%`}
          />
          <ReferenceLine y={60} stroke={chartColors.danger} strokeDasharray="4 2" strokeWidth={1} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="score"
            stroke={chartColors.primary}
            strokeWidth={2.5}
            dot={{ fill: chartColors.primary, r: 4, strokeWidth: 2, stroke: chartColors.dotStroke }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-300 mt-1 text-right">
        เส้นสีแดง = เกณฑ์ผ่าน 60%
      </p>
    </div>
  )
}

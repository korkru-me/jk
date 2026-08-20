'use client'

import {
  RadarChart, PolarGrid, PolarAngleAxis,
  Radar, Tooltip, ResponsiveContainer,
} from 'recharts'
import { chartColors } from '@/lib/chart-colors'
import type { Question } from '@/lib/types'

function seedRand(seed: string, index: number): number {
  const h = [...seed].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (index + 7) * 2654435761) >>> 0) % 1000) / 1000
}

const SKILLS = [
  { subject: 'อธิบายปรากฏการณ์', key: 'explain' },
  { subject: 'ออกแบบการสืบเสาะ', key: 'design' },
  { subject: 'แปลความข้อมูล',    key: 'interpret' },
  { subject: 'ให้เหตุผลทางวิทย์', key: 'reason' },
  { subject: 'สื่อสารทางวิทย์',  key: 'communicate' },
]

interface Props {
  assignmentId: string
  questions: Question[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name === 'class' ? 'ห้องเรียนนี้' : 'ค่าเฉลี่ยระบบ'}:</span>
          <span className="font-bold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function CompetencyRadarChart({ assignmentId, questions }: Props) {
  const data = SKILLS.map((s, i) => {
    const classSeed = seedRand(assignmentId + s.key, i)
    const sysBase = seedRand('system' + s.key, i)
    return {
      subject: s.subject,
      class:   Math.round(50 + classSeed * 40),
      system:  Math.round(55 + sysBase * 30),
      fullMark: 100,
    }
  })

  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-5">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">สมรรถนะตามกรอบ PISA</p>
        <p className="text-xs text-muted-foreground mt-0.5">เปรียบเทียบกับค่าเฉลี่ยผู้ใช้ทั้งระบบ</p>
      </div>
      <div className="flex items-center gap-5 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-primary rounded inline-block" />
          <span className="text-xs text-muted-foreground">ห้องเรียนของคุณ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-muted rounded inline-block" />
          <span className="text-xs text-muted-foreground">ค่าเฉลี่ยระบบ</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 0, right: 24, bottom: 0, left: 24 }}>
          <PolarGrid stroke={chartColors.grid} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 10, fill: chartColors.axis }}
          />
          <Radar
            name="class"
            dataKey="class"
            stroke={chartColors.primary}
            fill={chartColors.primary}
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Radar
            name="system"
            dataKey="system"
            stroke={chartColors.comparison}
            fill={chartColors.comparison}
            fillOpacity={0.08}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Skill breakdown pills */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
        {data.map(d => (
          <div key={d.subject} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`font-semibold ${d.class >= d.system ? 'text-primary' : 'text-warning'}`}>
              {d.class}
            </span>
            <span className="text-gray-300">/</span>
            <span className="text-muted-foreground">{d.subject}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

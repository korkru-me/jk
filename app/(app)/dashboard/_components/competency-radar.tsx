'use client'

import {
  RadarChart, PolarGrid, PolarAngleAxis,
  Radar, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const DATA = [
  { subject: 'อธิบายปรากฏการณ์', class: 72, national: 65, fullMark: 100 },
  { subject: 'ออกแบบการสืบเสาะ', class: 58, national: 61, fullMark: 100 },
  { subject: 'แปลความหมายข้อมูล', class: 65, national: 68, fullMark: 100 },
  { subject: 'การให้เหตุผล', class: 80, national: 72, fullMark: 100 },
  { subject: 'การสื่อสารทางวิทย์', class: 69, national: 70, fullMark: 100 },
]

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name === 'class' ? 'ห้องเรียน' : 'เฉลี่ยประเทศ'}:</span>
          <span className="font-bold text-gray-900">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function CompetencyRadar() {
  return (
    <div className="bg-white rounded-xl ring-1 ring-black/5 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-gray-900">กราฟสมรรถนะตามกรอบ PISA</p>
        <p className="text-xs text-gray-400 mt-0.5">เปรียบเทียบห้องเรียนกับค่าเฉลี่ยระดับประเทศ</p>
      </div>
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-500 rounded inline-block" />
          <span className="text-xs text-gray-500">ห้องเรียนของคุณ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-gray-300 rounded inline-block border-dashed" />
          <span className="text-xs text-gray-500">เฉลี่ยประเทศ</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={DATA} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
          <PolarGrid stroke="#f0f0f0" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 10, fill: '#6b7280' }}
          />
          <Radar
            name="class"
            dataKey="class"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Radar
            name="national"
            dataKey="national"
            stroke="#d1d5db"
            fill="#d1d5db"
            fillOpacity={0.1}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

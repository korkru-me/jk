'use client'

import { HardDrive, Image, FileQuestion, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'

const RESOURCES = [
  {
    label: 'พื้นที่จัดเก็บรูปภาพ',
    used: 450,
    max: 500,
    unit: 'MB',
    icon: Image,
  },
  {
    label: 'จำนวนโจทย์',
    used: 1250,
    max: 2000,
    unit: 'ข้อ',
    icon: FileQuestion,
  },
  {
    label: 'สมาชิกในองค์กร',
    used: 8,
    max: 10,
    unit: 'คน',
    icon: Users,
  },
]

function getBarColor(pct: number) {
  if (pct >= 85) return 'bg-flag'
  if (pct >= 60) return 'bg-warning'
  return 'bg-success'
}

function getTextColor(pct: number) {
  if (pct >= 85) return 'text-flag'
  if (pct >= 60) return 'text-warning'
  return 'text-success'
}

export function ResourceUsage() {
  return (
    <Card radius="md" edge="ring" padding="md">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">การใช้ทรัพยากร</p>
      </div>
      <div className="space-y-4">
        {RESOURCES.map(res => {
          const pct = Math.round((res.used / res.max) * 100)
          const Icon = res.icon
          return (
            <div key={res.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{res.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-bold ${getTextColor(pct)}`}>{pct}%</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({res.used}/{res.max} {res.unit})
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${getBarColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {pct >= 85 && (
                <p className="text-[10px] text-flag mt-1">⚠ ใกล้เต็ม — พิจารณาอัปเกรดแพ็กเกจ</p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

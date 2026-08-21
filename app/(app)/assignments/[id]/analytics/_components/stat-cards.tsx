'use client'

import { TrendingUp, BarChart2, ArrowUp, ArrowDown } from 'lucide-react'

interface Props {
  mean: number
  median: number
  max: number
  min: number
  count: number
}

export function StatCards({ mean, median, max, min, count }: Props) {
  const cards = [
    {
      label: 'คะแนนเฉลี่ย (Mean)',
      value: `${mean}%`,
      sub: `จาก ${count} คน`,
      icon: TrendingUp,
      color: 'bg-primary/10',
      iconColor: 'text-primary',
      ring: 'ring-blue-100',
      bar: mean,
      barColor: 'bg-primary',
    },
    {
      label: 'มัธยฐาน (Median)',
      value: `${median}%`,
      sub: 'ค่ากลางของการกระจาย',
      icon: BarChart2,
      color: 'bg-tint-1/10',
      iconColor: 'text-tint-1',
      ring: 'ring-violet-100',
      bar: median,
      barColor: 'bg-tint-1',
    },
    {
      label: 'คะแนนสูงสุด (Max)',
      value: `${max}%`,
      sub: 'นักเรียนที่ทำได้ดีที่สุด',
      icon: ArrowUp,
      color: 'bg-success/10',
      iconColor: 'text-success',
      ring: 'ring-green-100',
      bar: max,
      barColor: 'bg-success',
    },
    {
      label: 'คะแนนต่ำสุด (Min)',
      value: `${min}%`,
      sub: 'นักเรียนที่ต้องซ่อมเสริม',
      icon: ArrowDown,
      color: 'bg-destructive/10',
      iconColor: 'text-destructive',
      ring: 'ring-red-100',
      bar: min,
      barColor: 'bg-destructive',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(card => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className={`bg-card rounded-2xl ring-1 ring-border p-5 space-y-3`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground leading-tight">{card.label}</p>
              <div className={`w-8 h-8 rounded-xl ${card.color} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-foreground tabular-nums">{count > 0 ? card.value : '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
            </div>
            {count > 0 && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${card.barColor} rounded-full transition-all duration-700`}
                  style={{ width: `${card.bar}%` }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

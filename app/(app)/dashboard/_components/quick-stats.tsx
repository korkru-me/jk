'use client'

import { TrendingUp, TrendingDown, BookOpen, Users, FileText, Activity } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface StatItem {
  label: string
  value: string
  trend: { value: string; up: boolean } | null
  icon: React.ElementType
  iconBg: string
  iconColor: string
}

interface QuickStatsProps {
  questionsCount: number
  studentsCount: number
}

export function QuickStats({ questionsCount, studentsCount }: QuickStatsProps) {
  const stats: StatItem[] = [
    {
      label: 'โจทย์ทั้งหมด',
      value: questionsCount > 0 ? questionsCount.toLocaleString() : '1,250',
      trend: { value: '5%', up: true },
      icon: BookOpen,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      label: 'นักเรียนรวม',
      value: studentsCount > 0 ? studentsCount.toLocaleString() : '800',
      trend: { value: '3%', up: true },
      icon: Users,
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-500',
    },
    {
      label: 'ชุดข้อสอบ',
      value: '45',
      trend: { value: '2%', up: false },
      icon: FileText,
      iconBg: 'bg-warning/10',
      iconColor: 'text-warning',
    },
    {
      label: 'อัตราเข้าสอบ',
      value: '92%',
      trend: { value: '1%', up: true },
      icon: Activity,
      iconBg: 'bg-success/10',
      iconColor: 'text-success',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(stat => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  )
}

function StatCard({ stat }: { stat: StatItem }) {
  const Icon = stat.icon
  return (
    <Card radius="md" edge="ring" padding="md" className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
          <Icon className={`w-4.5 h-4.5 ${stat.iconColor}`} />
        </div>
        {stat.trend && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${
            stat.trend.up ? 'text-success' : 'text-destructive'
          }`}>
            {stat.trend.up
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
            }
            {stat.trend.value}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground leading-none">{stat.value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{stat.label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {stat.trend?.up ? 'เพิ่มขึ้นจากสัปดาห์ที่แล้ว' : 'ลดลงจากสัปดาห์ที่แล้ว'}
      </p>
    </Card>
  )
}

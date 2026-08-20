'use client'

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { chartColors, chartTooltipStyle } from '@/lib/chart-colors'
import { Card } from '@/components/ui/card'
import {
  TrendingUp,
  Users,
  BookOpen,
  FileText,
  Activity,
  DollarSign,
} from 'lucide-react'

const MRR_DATA = [
  { month: 'มิ.ย. 68', mrr: 42500, tenants: 8 },
  { month: 'ก.ค. 68', mrr: 51000, tenants: 10 },
  { month: 'ส.ค. 68', mrr: 58500, tenants: 11 },
  { month: 'ก.ย. 68', mrr: 67000, tenants: 13 },
  { month: 'ต.ค. 68', mrr: 71500, tenants: 14 },
  { month: 'พ.ย. 68', mrr: 85000, tenants: 16 },
  { month: 'ธ.ค. 68', mrr: 94500, tenants: 17 },
  { month: 'ม.ค. 69', mrr: 108000, tenants: 20 },
  { month: 'ก.พ. 69', mrr: 119500, tenants: 22 },
  { month: 'มี.ค. 69', mrr: 134000, tenants: 24 },
  { month: 'เม.ย. 69', mrr: 148500, tenants: 27 },
  { month: 'พ.ค. 69', mrr: 162000, tenants: 29 },
]

const EXAM_ACTIVITY = [
  { day: 'จ', submissions: 1240, activeExams: 34 },
  { day: 'อ', submissions: 1580, activeExams: 41 },
  { day: 'พ', submissions: 2120, activeExams: 58 },
  { day: 'พฤ', submissions: 1890, activeExams: 49 },
  { day: 'ศ', submissions: 2340, activeExams: 62 },
  { day: 'ส', submissions: 890, activeExams: 21 },
  { day: 'อา', submissions: 420, activeExams: 11 },
]

const STAT_CARDS = [
  {
    label: 'ผู้ใช้งานรวม',
    value: '14,832',
    delta: '+12.4%',
    positive: true,
    icon: Users,
    color: 'indigo',
  },
  {
    label: 'MRR ปัจจุบัน',
    value: '฿162,000',
    delta: '+9.1%',
    positive: true,
    icon: DollarSign,
    color: 'emerald',
  },
  {
    label: 'Exams กำลังสอบ',
    value: '62',
    delta: '+8 จากเมื่อวาน',
    positive: true,
    icon: FileText,
    color: 'amber',
  },
  {
    label: 'คลังโจทย์',
    value: '28,461',
    delta: '+341 วันนี้',
    positive: true,
    icon: BookOpen,
    color: 'violet',
  },
  {
    label: 'Submissions วันนี้',
    value: '2,340',
    delta: '+18.7%',
    positive: true,
    icon: Activity,
    color: 'cyan',
  },
  {
    label: 'Tenants ใช้งาน',
    value: '29',
    delta: '+2 เดือนนี้',
    positive: true,
    icon: TrendingUp,
    color: 'rose',
  },
]

const COLOR_MAP: Record<string, string> = {
  indigo: 'bg-primary/10 text-primary dark:bg-indigo-950/60',
  emerald: 'bg-success/10 text-success dark:bg-emerald-950/60',
  amber: 'bg-warning/10 text-warning dark:bg-amber-950/60',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
}

const ICON_COLOR: Record<string, string> = {
  indigo: 'text-primary',
  emerald: 'text-success',
  amber: 'text-warning',
  violet: 'text-violet-500',
  cyan: 'text-cyan-500',
  rose: 'text-rose-500',
}

function formatMRR(value: number) {
  return `฿${(value / 1000).toFixed(0)}K`
}

export function AdminDashboard() {
  const currentMRR = MRR_DATA[MRR_DATA.length - 1].mrr
  const prevMRR = MRR_DATA[MRR_DATA.length - 2].mrr
  const mrrGrowth = (((currentMRR - prevMRR) / prevMRR) * 100).toFixed(1)

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Card radius="md" padding="md" key={card.label}>
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </p>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${COLOR_MAP[card.color]}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${ICON_COLOR[card.color]}`} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {card.value}
              </p>
              <p
                className={`mt-0.5 text-xs font-medium ${
                  card.positive
                    ? 'text-success'
                    : 'text-destructive'
                }`}
              >
                {card.delta}
              </p>
            </Card>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* MRR Chart */}
        <Card radius="md" padding="lg" className="xl:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Monthly Recurring Revenue
              </h3>
              <p className="text-xs text-muted-foreground">
                ย้อนหลัง 12 เดือน
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">
                ฿{(currentMRR / 1000).toFixed(0)}K
              </p>
              <p className="text-xs font-medium text-success">
                +{mrrGrowth}% MoM
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={MRR_DATA}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatMRR}
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [`฿${Number(v).toLocaleString()}`, 'MRR']}
                contentStyle={chartTooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke={chartColors.primary}
                strokeWidth={2.5}
                fill="url(#mrrGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Tenant Growth */}
        <Card radius="md" padding="lg">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">
              Tenant Growth
            </h3>
            <p className="text-xs text-muted-foreground">
              จำนวนสถาบันที่ใช้งาน
            </p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MRR_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [Number(v), 'Tenants']}
                contentStyle={chartTooltipStyle}
              />
              <Bar dataKey="tenants" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Weekly Exam Activity */}
      <Card radius="md" padding="lg">
        <div className="mb-4">
          <h3 className="font-semibold text-foreground">
            กิจกรรมการสอบรายสัปดาห์
          </h3>
          <p className="text-xs text-muted-foreground">
            Submissions และ Active Exams แยกตามวัน
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={EXAM_ACTIVITY} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.5} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: chartColors.axis }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: chartColors.axis }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: chartColors.axis }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) =>
                value === 'submissions' ? 'Submissions' : 'Active Exams'
              }
            />
            <Bar
              yAxisId="left"
              dataKey="submissions"
              fill={chartColors.primary}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="activeExams"
              fill={chartColors.success}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

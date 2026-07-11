'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AlertTriangle, CheckCircle2, Database, HardDrive, Cpu, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_USAGE_DATA = [
  { time: '00:00', rps: 48, latency: 11 },
  { time: '02:00', rps: 22, latency: 9 },
  { time: '04:00', rps: 14, latency: 8 },
  { time: '06:00', rps: 38, latency: 10 },
  { time: '08:00', rps: 112, latency: 14 },
  { time: '10:00', rps: 284, latency: 18 },
  { time: '12:00', rps: 341, latency: 22 },
  { time: '14:00', rps: 398, latency: 19 },
  { time: '16:00', rps: 412, latency: 21 },
  { time: '18:00', rps: 287, latency: 16 },
  { time: '20:00', rps: 193, latency: 13 },
  { time: '22:00', rps: 94, latency: 11 },
]

const QUOTA_ITEMS = [
  {
    label: 'Database Rows',
    used: 4820000,
    limit: 8000000,
    unit: 'rows',
    icon: Database,
    color: 'indigo',
  },
  {
    label: 'Storage',
    used: 6.1,
    limit: 10,
    unit: 'GB',
    icon: HardDrive,
    color: 'violet',
  },
  {
    label: 'API Requests / เดือน',
    used: 4200000,
    limit: 5000000,
    unit: 'req',
    icon: Zap,
    color: 'amber',
    warn: true,
  },
  {
    label: 'Realtime Connections',
    used: 312,
    limit: 500,
    unit: 'conn',
    icon: Cpu,
    color: 'emerald',
  },
]

const COLOR_BAR: Record<string, string> = {
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
}

const COLOR_TRACK: Record<string, string> = {
  indigo: 'bg-indigo-100 dark:bg-indigo-950/60',
  violet: 'bg-violet-100 dark:bg-violet-950/60',
  amber: 'bg-amber-100 dark:bg-amber-950/60',
  emerald: 'bg-emerald-100 dark:bg-emerald-950/60',
}

function formatUnit(value: number, unit: string) {
  if (unit === 'rows' || unit === 'req') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  }
  return `${value} ${unit}`
}

function QuotaBar({
  label,
  used,
  limit,
  unit,
  icon: Icon,
  color,
  warn,
}: (typeof QUOTA_ITEMS)[0]) {
  const pct = Math.round((used / limit) * 100)
  const critical = pct >= 90
  const warning = !critical && (warn || pct >= 75)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              critical
                ? 'bg-red-100 dark:bg-red-950/60'
                : warning
                  ? 'bg-amber-100 dark:bg-amber-950/60'
                  : COLOR_TRACK[color],
            )}
          >
            <Icon
              className={cn(
                'h-3.5 w-3.5',
                critical
                  ? 'text-red-500'
                  : warning
                    ? 'text-amber-500'
                    : `text-${color}-500`,
              )}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {label}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {formatUnit(used, unit)} / {formatUnit(limit, unit)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {critical && (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          )}
          {warning && !critical && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          )}
          {!warning && !critical && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <span
            className={cn(
              'text-sm font-bold',
              critical
                ? 'text-red-600 dark:text-red-400'
                : warning
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-700 dark:text-slate-200',
            )}
          >
            {pct}%
          </span>
        </div>
      </div>

      <div className={cn('h-2 w-full rounded-full', COLOR_TRACK[color])}>
        <div
          className={cn(
            'h-2 rounded-full transition-all duration-500',
            critical ? 'bg-red-500' : warning ? 'bg-amber-500' : COLOR_BAR[color],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {(critical || warning) && (
        <p
          className={cn(
            'mt-2 text-xs font-medium',
            critical ? 'text-red-500' : 'text-amber-500',
          )}
        >
          {critical
            ? 'คอขวด: ใกล้ถึงขีดจำกัด — ควร Upgrade แพ็กเกจ Supabase'
            : 'ใกล้ถึง 80% — ติดตามอย่างใกล้ชิด'}
        </p>
      )}
    </div>
  )
}

export function SystemHealth() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          System Health Monitor
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Supabase Quota และ API Performance แบบเรียลไทม์
        </p>
      </div>

      {/* Quota Bars */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUOTA_ITEMS.map((item) => (
          <QuotaBar key={item.label} {...item} />
        ))}
      </div>

      {/* API Usage Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              API Request Rate (วันนี้)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Requests/sec และ Latency เฉลี่ย (ms)
            </p>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2 w-4 rounded-sm bg-indigo-500" />
              RPS
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2 w-4 rounded-sm bg-amber-400" />
              Latency (ms)
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={API_USAGE_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="rps"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="lat"
              orientation="right"
              domain={[0, 40]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) =>
                name === 'rps' ? [`${Number(v)} req/s`, 'RPS'] : [`${Number(v)} ms`, 'Latency']
              }
            />
            <Line
              yAxisId="rps"
              type="monotone"
              dataKey="rps"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="lat"
              type="monotone"
              dataKey="latency"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Activity, Server, Wifi, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

const SERVER_METRICS = [
  { label: 'API', value: '99.98%', ok: true },
  { label: 'DB', value: '12 ms', ok: true },
  { label: 'Storage', value: '61%', ok: true },
  { label: 'Auth', value: 'OK', ok: true },
]

function MetricPill({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        ok
          ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
          : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          ok ? 'bg-emerald-500 animate-pulse' : 'bg-red-500',
        )}
      />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function SuperTopbar() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState('')
  const [activeUsers, setActiveUsers] = useState(247)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const tick = () => {
      setTime(
        new Intl.DateTimeFormat('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Bangkok',
        }).format(new Date()),
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setActiveUsers((v) => v + Math.floor(Math.random() * 5) - 2)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-950/90">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
          Server Status
        </span>
        <div className="flex items-center gap-2 ml-3">
          {SERVER_METRICS.map((m) => (
            <MetricPill key={m.label} {...m} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {activeUsers.toLocaleString()}
          </span>
          <span>ผู้ใช้ออนไลน์</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          <span>{time}</span>
          <span className="text-slate-400">ICT+7</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        )}
        {!mounted && <div className="h-8 w-8" />}

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
          SA
        </div>
      </div>
    </header>
  )
}

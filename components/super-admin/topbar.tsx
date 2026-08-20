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
          ? 'bg-success/10 text-success dark:bg-success/20'
          : 'bg-destructive/10 text-destructive dark:bg-destructive/20',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          ok ? 'bg-success animate-pulse' : 'bg-destructive',
        )}
      />
      <span className="text-muted-foreground">{label}</span>
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/90 px-6 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-950/90">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Server Status
        </span>
        <div className="flex items-center gap-2 ml-3">
          {SERVER_METRICS.map((m) => (
            <MetricPill key={m.label} {...m} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-success" />
          <span className="font-semibold text-muted-foreground">
            {activeUsers.toLocaleString()}
          </span>
          <span>ผู้ใช้ออนไลน์</span>
        </div>

        <div className="h-4 w-px bg-muted" />

        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
          <Wifi className="h-3.5 w-3.5 text-success" />
          <span>{time}</span>
          <span className="text-muted-foreground">ICT+7</span>
        </div>

        <div className="h-4 w-px bg-muted" />

        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        )}
        {!mounted && <div className="h-8 w-8" />}

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          SA
        </div>
      </div>
    </header>
  )
}

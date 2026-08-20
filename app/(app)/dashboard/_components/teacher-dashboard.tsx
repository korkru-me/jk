'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { User } from '@/lib/types'

import { CommandPalette } from './command-palette'
import { QuickStats } from './quick-stats'
import { ClassInsights } from './class-insights'
import { StudentsAtRisk } from './students-at-risk'
import { RecentSubmissions } from './recent-submissions'
import { QuickCreate } from './quick-create'
import { RecentDrafts } from './recent-drafts'
import { UpcomingTasks } from './upcoming-tasks'
import { ForkRemix } from './fork-remix'
import { QuestionHealth } from './question-health'
import { EngagementHeatmap } from './engagement-heatmap'
import { ResourceUsage } from './resource-usage'
import { DailyTips } from './daily-tips'

const CompetencyRadar = dynamic(
  () => import('./competency-radar').then(module => module.CompetencyRadar),
  { ssr: false }
)

interface Props {
  user: Pick<User, 'id' | 'full_name' | 'role'>
  questionsCount: number
  studentsCount: number
  heatmapAnchorDate: string
}

export function TeacherDashboard({ user, questionsCount, studentsCount, heatmapAnchorDate }: Props) {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <CommandPalette />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">สวัสดี, {user.full_name} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            วันนี้มีงานค้างอยู่ 2 รายการ · นักเรียน 3 คนต้องดูแลพิเศษ
          </p>
        </div>
        <button
          className="hidden sm:flex items-center gap-2 px-3 py-2 bg-card ring-1 ring-border rounded-xl text-sm text-muted-foreground hover:ring-gray-300 transition-all shadow-sm cursor-pointer"
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
            window.dispatchEvent(event)
          }}
        >
          <Search className="w-3.5 h-3.5" />
          <span>ค้นหา...</span>
          <kbd className="ml-2 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>
      </div>

      {/* Quick Stats */}
      <QuickStats questionsCount={questionsCount} studentsCount={studentsCount} />

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── Left (main content) ── */}
        <div className="space-y-5">
          <ClassInsights />
          <StudentsAtRisk />
          <DeferredCompetencyRadar />
          <EngagementHeatmap anchorDate={heatmapAnchorDate} />
          <QuestionHealth />
          <RecentSubmissions />
        </div>

        {/* ── Right (supplementary) ── */}
        <div className="space-y-4">
          <QuickCreate />
          <UpcomingTasks />
          <RecentDrafts />
          <ForkRemix />
          <ResourceUsage />
          <DailyTips />
        </div>

      </div>
    </div>
  )
}

function DeferredCompetencyRadar() {
  const [shouldRender, setShouldRender] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element || !('IntersectionObserver' in window)) {
      setShouldRender(true)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { rootMargin: '320px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef}>
      {shouldRender ? (
        <CompetencyRadar />
      ) : (
        <div
          aria-hidden="true"
          className="h-[309px] animate-pulse rounded-xl bg-card ring-1 ring-border"
        />
      )}
    </div>
  )
}

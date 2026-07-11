'use client'

import { Search } from 'lucide-react'
import type { User } from '@/lib/types'

import { CommandPalette } from './command-palette'
import { QuickStats } from './quick-stats'
import { ClassInsights } from './class-insights'
import { StudentsAtRisk } from './students-at-risk'
import { CompetencyRadar } from './competency-radar'
import { RecentSubmissions } from './recent-submissions'
import { QuickCreate } from './quick-create'
import { RecentDrafts } from './recent-drafts'
import { UpcomingTasks } from './upcoming-tasks'
import { ForkRemix } from './fork-remix'
import { QuestionHealth } from './question-health'
import { EngagementHeatmap } from './engagement-heatmap'
import { ResourceUsage } from './resource-usage'
import { DailyTips } from './daily-tips'

interface Props {
  user: User
  questionsCount: number
  studentsCount: number
  assignmentsCount: number
}

export function TeacherDashboard({ user, questionsCount, studentsCount }: Props) {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <CommandPalette />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">สวัสดี, {user.full_name} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            วันนี้มีงานค้างอยู่ 2 รายการ · นักเรียน 3 คนต้องดูแลพิเศษ
          </p>
        </div>
        <button
          className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white ring-1 ring-black/10 rounded-xl text-sm text-gray-500 hover:ring-gray-300 transition-all shadow-sm cursor-pointer"
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
            window.dispatchEvent(event)
          }}
        >
          <Search className="w-3.5 h-3.5" />
          <span>ค้นหา...</span>
          <kbd className="ml-2 text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
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
          <CompetencyRadar />
          <EngagementHeatmap />
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

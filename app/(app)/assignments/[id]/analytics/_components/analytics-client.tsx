'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ChevronLeft, BarChart2, Search, TrendingUp, Users,
  Download, FileSpreadsheet, FileText as FilePdf,
} from 'lucide-react'
import type { Question } from '@/lib/types'
import { passingPercent } from '@/lib/grading'
import type { AnalyticsAssignment, AnalyticsSubmissionRow } from '../page'
import { StatCards } from './stat-cards'
import { CompetencyRadarChart } from './competency-radar'
import { GrowthTracker } from './growth-tracker'
import { PercentileBenchmark } from './percentile-benchmark'
import { Card } from '@/components/ui/card'

const ItemAnalysisSection = dynamic(
  () => import('./item-analysis-chart').then(mod => mod.ItemAnalysisSection),
  { loading: () => <AnalyticsTabLoading /> }
)

const StudentScoreTable = dynamic(
  () => import('./student-score-table').then(mod => mod.StudentScoreTable),
  { loading: () => <AnalyticsTabLoading /> }
)

type Tab = 'overview' | 'item-analysis' | 'individual'

const TABS: { key: Tab; label: string; icon: typeof BarChart2 }[] = [
  { key: 'overview',     label: 'ภาพรวม',              icon: BarChart2 },
  { key: 'item-analysis', label: 'วิเคราะห์รายข้อ',    icon: Search },
  { key: 'individual',   label: 'สรุปคะแนนรายบุคคล',   icon: Users },
]

interface Props {
  assignment: AnalyticsAssignment
  questions: Question[]
  submissions: AnalyticsSubmissionRow[]
  teacherName: string
}

function AnalyticsTabLoading() {
  return <div className="h-48 rounded-2xl bg-muted animate-pulse" aria-label="กำลังโหลดข้อมูลวิเคราะห์" />
}

export type ScoreOverride = {
  submissionId: string
  fromScore: number
  newScore: number
  reason: string
  by: string
  at: string
}

export function AnalyticsClient({ assignment, questions, submissions, teacherName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [overrides, setOverrides] = useState<ScoreOverride[]>([])
  const [showExport, setShowExport] = useState(false)

  function handleOverride(entry: ScoreOverride) {
    setOverrides(prev => [...prev, entry])
  }

  function exportCsv() {
    const rows = submissions.map(s => {
      const ov = [...overrides].reverse().find(o => o.submissionId === s.id)
      const score = ov ? ov.newScore : (s.total_score ?? 0)
      const pct = s.max_score > 0 ? Math.round((score / s.max_score) * 100) : 0
      return [
        s.users?.full_name ?? '—',
        score,
        s.max_score,
        pct + '%',
        pct >= 60 ? 'ผ่าน' : 'ไม่ผ่าน',
        s.submitted_at ? new Date(s.submitted_at).toLocaleString('th-TH') : '—',
      ]
    })
    const header = ['ชื่อนักเรียน', 'คะแนน', 'คะแนนเต็ม', 'เปอร์เซ็นต์', 'สถานะ', 'เวลาส่ง']
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${assignment.title}_analytics.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  function exportPrint() {
    window.print()
    setShowExport(false)
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Back + title */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/assignments/${assignment.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> กลับหน้าชุดข้อสอบ
          </Link>
          <h1 className="text-xl font-bold text-foreground mt-1">{assignment.title}</h1>
          <p className="text-sm text-muted-foreground">
            {assignment.classrooms?.name ?? 'ไม่ระบุห้อง'} · {submissions.length} คนส่งแล้ว · {questions.length} ข้อ
          </p>
        </div>

        {/* Export dropdown */}
        <div className="relative shrink-0 print:hidden">
          <button
            onClick={() => setShowExport(v => !v)}
            className="flex items-center gap-2 px-3.5 py-2 bg-foreground text-background text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            ส่งออกรายงาน
          </button>
          {showExport && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
              <Card radius="md" edge="ring" elevation="lg" className="absolute right-0 mt-1.5 w-48 z-20 py-1 overflow-hidden">
                <button
                  onClick={exportCsv}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-success" />
                  Export as Excel (CSV)
                </button>
                <button
                  onClick={exportPrint}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <FilePdf className="w-4 h-4 text-destructive" />
                  Export as PDF
                </button>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted rounded-2xl p-1 print:hidden">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-muted-foreground hover:bg-card/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewSection assignment={assignment} questions={questions} submissions={submissions} />
      )}
      {activeTab === 'item-analysis' && (
        <ItemAnalysisSection questions={questions} submissions={submissions} assignmentId={assignment.id} />
      )}
      {activeTab === 'individual' && (
        <StudentScoreTable
          submissions={submissions}
          maxScore={submissions[0]?.max_score ?? assignment.display_max_score ?? questions.length}
          overrides={overrides}
          onOverride={handleOverride}
          teacherName={teacherName}
          questions={questions}
          assignmentId={assignment.id}
          passingType={assignment.passing_type}
          passingValue={assignment.passing_value}
        />
      )}
    </div>
  )
}

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection({ assignment, questions, submissions }: {
  assignment: AnalyticsAssignment
  questions: Question[]
  submissions: AnalyticsSubmissionRow[]
}) {
  const scores = submissions
    .map(s => s.max_score > 0 ? Math.round((s.total_score ?? 0) / s.max_score * 100) : 0)
    .sort((a, b) => a - b)

  const mean = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const median = scores.length > 0
    ? scores.length % 2 === 0
      ? Math.round((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
      : scores[Math.floor(scores.length / 2)]
    : 0
  const max = scores.length > 0 ? scores[scores.length - 1] : 0
  const min = scores.length > 0 ? scores[0] : 0

  const maxScore = submissions[0]?.max_score ?? assignment.display_max_score ?? questions.length
  const passingPct = passingPercent(maxScore, assignment.passing_type, assignment.passing_value)

  return (
    <div className="space-y-5">
      <StatCards mean={mean} median={median} max={max} min={min} count={scores.length} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CompetencyRadarChart assignmentId={assignment.id} questions={questions} />
        <GrowthTracker assignmentId={assignment.id} currentMean={mean} assignmentTitle={assignment.title} />
      </div>

      <PercentileBenchmark mean={mean} assignmentId={assignment.id} passingPercent={passingPct} />
    </div>
  )
}

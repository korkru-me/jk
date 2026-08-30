'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search, Clock, CheckCircle2, FileText, Play, Timer, RotateCcw,
  LockKeyhole,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { AssignmentRow } from '../page'
import { Card } from '@/components/ui/card'

type StudentSub = { id: string; status: string; total_score: number | null; max_score: number }

interface Props {
  assignments: AssignmentRow[]
  mySubMap: Record<string, StudentSub>
  attemptsUsed: Record<string, number>
  hasInProgress: Record<string, boolean>
}

// Teachers manage assignments from within each classroom's "งานที่มอบหมาย"
// tab now, so this page (and component) is student-only.
export function ExamDashboard({ assignments, mySubMap, attemptsUsed, hasInProgress }: Props) {
  const [search, setSearch] = useState('')

  const filtered = assignments.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase())
  )

  const doneCount = Object.values(mySubMap).filter(s => s.status === 'submitted' || s.status === 'graded').length
  const pendingCount = assignments.length - doneCount

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">ชุดข้อสอบที่ได้รับ</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{assignments.length} ชุดข้อสอบ</p>
      </div>

      {assignments.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card padding="md" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{pendingCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">รอทำ</p>
            </div>
          </Card>
          <Card padding="md" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{doneCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">ส่งแล้ว</p>
            </div>
          </Card>
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="ค้นหา..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-muted-foreground font-medium">ยังไม่มีชุดข้อสอบ</p>
          <p className="text-sm text-muted-foreground/70 mt-1">ครูจะมอบหมายข้อสอบให้ผ่านห้องเรียน</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">ไม่พบชุดข้อสอบที่ตรงกัน</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const sub = mySubMap[a.id]
            const canShowResults = a.show_results !== 'never'
            const isDone = sub?.status === 'submitted' || sub?.status === 'graded'
            const used = attemptsUsed[a.id] ?? 0
            // `sub` reflects the best/official-strategy attempt for score
            // display, which may not be the latest attempt — check
            // hasInProgress separately so an unfinished retry is never
            // hidden behind an older finished attempt's score.
            const isInProgress = hasInProgress[a.id] ?? false
            const canRetry = !isInProgress && isDone && (a.max_attempts == null || used < a.max_attempts)
            return (
              <Card padding="md" className="hover:border-primary/20 dark:hover:border-primary transition-colors" key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.classrooms?.name}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {a.random_question_count ?? a.question_ids.length} ข้อ{a.random_question_count ? ` (สุ่มจาก ${a.question_ids.length})` : ''}
                      </span>
                      {a.duration_minutes && <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{a.duration_minutes} นาที</span>}
                      {a.end_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />ถึง {new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'short' })}</span>}
                    </div>
                    {a.secure_browser_mode === 'seb_required' && (
                      <Link
                        href={`/assignments/${a.id}/system-check`}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <LockKeyhole className="h-3.5 w-3.5" /> ตรวจเครื่อง SEB โดยไม่เริ่มจับเวลา
                      </Link>
                    )}
                  </div>
                  {isInProgress ? (
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      {isDone && canShowResults && sub.total_score != null && (
                        <p className="text-xs text-muted-foreground">ครั้งก่อนหน้า {sub.total_score}/{sub.max_score}</p>
                      )}
                      <Link
                        href={`/assignments/${a.id}/take`}
                        className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 bg-warning hover:bg-warning/90 text-white border-0')}
                      >
                        ▶ ทำต่อ
                      </Link>
                    </div>
                  ) : canRetry ? (
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      <p className="text-xs text-success font-medium">ส่งแล้ว ✓</p>
                      {canShowResults && sub.total_score != null && (
                        <p className="text-lg font-bold">{sub.total_score}/{sub.max_score}</p>
                      )}
                      <Link
                        href={`/assignments/${a.id}/take`}
                        className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 bg-warning hover:bg-warning/90 text-white border-0')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        ลองใหม่{a.max_attempts != null && ` (เหลือ ${a.max_attempts - used} ครั้ง)`}
                      </Link>
                    </div>
                  ) : isDone ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-success font-medium">ส่งแล้ว ✓</p>
                      {canShowResults && sub.total_score != null && (
                        <p className="text-lg font-bold">{sub.total_score}/{sub.max_score}</p>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/assignments/${a.id}/take`}
                      className={cn(buttonVariants({ size: 'sm' }), 'shrink-0 gap-1.5')}
                    >
                      <Play className="w-3.5 h-3.5" /> เริ่มทำ
                    </Link>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { cn } from '@/lib/utils'
import { formatPercent, type AssignmentAverage, type StudentAbility } from '@/lib/student-ability'
import {
  AbilityBarChart, AbilityRadarChart, ChartTypeToggle, LabelModeToggle, isUnscored,
  type AbilityChartType, type AbilityDatum, type AbilityLabelMode,
} from './ability-charts'
import type { StudentProfileRow } from './homeroom-overview'

export interface AbilityAssignmentInfo {
  id: string
  title: string
}

interface Props {
  student: { id: string; full_name: string } | null
  profile: StudentProfileRow | undefined
  ability: StudentAbility | null
  assignments: AbilityAssignmentInfo[]
  averages: Map<string, AssignmentAverage>
  /** Where this student sits in the filtered, sorted list the teacher is browsing. */
  position: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  /** Where focus lands on close: the card of the student last shown, which may not be the one that opened the dialog. */
  returnFocusTo: () => HTMLElement | null
  chartType: AbilityChartType
  onChartTypeChange: (value: AbilityChartType) => void
  labelMode: AbilityLabelMode
  onLabelModeChange: (value: AbilityLabelMode) => void
  showClassAverage: boolean
  onShowClassAverageChange: (value: boolean) => void
  radarAllowed: boolean
}

export function StudentAbilityDialog(props: Props) {
  const { student, onClose, onPrev, onNext, position, total, returnFocusTo } = props

  // ← / → step through the list without closing, unless a control that uses
  // the arrow keys itself (the chart switch) has focus.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement
    if (target.closest('[data-slot="toggle-group"], input, select, textarea')) return
    if (event.key === 'ArrowLeft' && position > 0) { event.preventDefault(); onPrev() }
    if (event.key === 'ArrowRight' && position < total - 1) { event.preventDefault(); onNext() }
  }

  return (
    <Dialog open={student !== null} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-[calc(100%-1rem)] gap-0 p-0 sm:max-w-6xl"
        onKeyDown={handleKeyDown}
        finalFocus={() => returnFocusTo() ?? true}
      >
        {/* Keyed by student so hover state never carries over to the next one. */}
        {student && <DialogBody key={student.id} {...props} student={student} />}
      </DialogContent>
    </Dialog>
  )
}

function DialogBody({
  student, profile, ability, assignments, averages,
  position, total, onPrev, onNext, chartType, onChartTypeChange,
  labelMode, onLabelModeChange, showClassAverage, onShowClassAverageChange, radarAllowed,
}: Props & { student: { id: string; full_name: string } }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const data: AbilityDatum[] = assignments.map((assignment, i) => {
    const cell = ability?.cells[i]
    const average = averages.get(assignment.id)
    return {
      key: assignment.id,
      index: i + 1,
      title: assignment.title,
      state: cell?.state ?? 'missing',
      percent: cell?.percent ?? null,
      score: cell?.score ?? null,
      maxScore: cell?.maxScore ?? null,
      classAverage: average?.average ?? null,
      classSubmitted: average?.submittedCount ?? 0,
    }
  })
  const effectiveChart = chartType === 'radar' && radarAllowed ? 'radar' : 'bar'
  const classNumber = profile?.class_number ?? null
  const details = [
    classNumber !== null ? `เลขที่ ${classNumber}` : null,
    profile?.student_code ? `รหัส ${profile.student_code}` : null,
  ].filter(Boolean).join(' · ')
  const chartLabel = `${effectiveChart === 'radar' ? 'แผนภูมิเรดาร์' : 'กราฟแท่ง'}เปอร์เซ็นต์ที่ ${student.full_name} ทำได้ในแต่ละงาน${showClassAverage ? ' เทียบกับค่าเฉลี่ยห้อง' : ''}`

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 pr-12">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-bold text-primary tabular-nums"
          title={classNumber !== null ? `เลขที่ ${classNumber}` : 'ยังไม่มีเลขที่'}
        >
          {classNumber ?? <UserRound className="size-5" />}
        </span>
        {/* The name keeps a real width; on a phone the arrows wrap below it. */}
        <div className="min-w-[11rem] flex-1">
          <DialogTitle className="line-clamp-2 text-xl leading-tight font-bold">{student.full_name}</DialogTitle>
          <DialogDescription className="mt-1">{details || 'ยังไม่มีเลขที่และรหัสนักเรียน'}</DialogDescription>
        </div>
        <div className="flex items-center gap-1 max-sm:w-full max-sm:justify-between">
          <IconButton label="นักเรียนคนก่อนหน้า (←)" variant="outline" onClick={onPrev} disabled={position <= 0}>
            <ChevronLeft />
          </IconButton>
          <span className="min-w-14 text-center text-xs text-muted-foreground tabular-nums">
            {position + 1} / {total}
          </span>
          <IconButton label="นักเรียนคนถัดไป (→)" variant="outline" onClick={onNext} disabled={position >= total - 1}>
            <ChevronRight />
          </IconButton>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card padding="md" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" /> {student.full_name.split(' ')[0]}
                </span>
                {showClassAverage && <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-muted-foreground" /> ค่าเฉลี่ยห้อง
                </span>}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-foreground">
                  <span>ค่าเฉลี่ยห้อง</span>
                  <ToggleSwitch
                    checked={showClassAverage}
                    onChange={onShowClassAverageChange}
                    aria-label="แสดงค่าเฉลี่ยห้อง"
                  />
                </label>
                <LabelModeToggle value={labelMode} onChange={onLabelModeChange} />
                <ChartTypeToggle value={effectiveChart} onChange={onChartTypeChange} radarAllowed={radarAllowed} />
              </div>
            </div>
            {effectiveChart === 'radar'
              ? <AbilityRadarChart data={data} activeKey={activeKey} onActiveChange={setActiveKey} label={chartLabel} showClassAverage={showClassAverage} labelMode={labelMode} />
              : <AbilityBarChart data={data} activeKey={activeKey} onActiveChange={setActiveKey} label={chartLabel} showClassAverage={showClassAverage} labelMode={labelMode} />}
          </Card>

          <Card className="min-w-0 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">คะแนนของ {student.full_name} ในแต่ละงานที่เลือก</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="w-8 px-3 py-2.5 text-left font-medium">#</th>
                  <th scope="col" className="px-2 py-2.5 text-left font-medium">งาน</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-medium">คะแนน</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-medium">%</th>
                  {showClassAverage && <th scope="col" className="px-3 py-2.5 text-right font-medium whitespace-nowrap">เฉลี่ยห้อง</th>}
                </tr>
              </thead>
              <tbody>
                {data.map(d => {
                  const cell = ability?.cells[d.index - 1]
                  return (
                    <tr
                      key={d.key}
                      onPointerEnter={() => setActiveKey(d.key)}
                      onPointerLeave={() => setActiveKey(null)}
                      data-active={d.key === activeKey ? '' : undefined}
                      className={cn(
                        'border-b border-border last:border-0 motion-safe:transition-[color,background-color,transform,box-shadow]',
                        d.key === activeKey && 'relative z-10 scale-[1.015] bg-primary/10 text-primary shadow-sm',
                      )}
                    >
                      <td className={cn('px-3 py-2.5 align-top text-xs font-semibold tabular-nums', d.key === activeKey ? 'text-primary' : 'text-muted-foreground')}>{d.index}</td>
                      <td className="px-2 py-2.5 align-top">
                        {cell?.submissionId ? (
                          <Link href={`/submissions/${cell.submissionId}`} className={cn('line-clamp-2 hover:text-primary hover:underline', d.key === activeKey ? 'font-semibold text-primary' : 'text-foreground')}>
                            {d.title}
                          </Link>
                        ) : (
                          <span className={cn('line-clamp-2', d.key === activeKey ? 'font-semibold text-primary' : 'text-foreground')}>{d.title}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right align-top text-muted-foreground tabular-nums whitespace-nowrap">
                        {d.state === 'done' && d.score !== null ? `${d.score}/${d.maxScore}` : ''}
                      </td>
                      <td className="px-2 py-2.5 text-right align-top font-semibold tabular-nums whitespace-nowrap">
                        {d.percent !== null
                          ? formatPercent(d.percent)
                          : (
                            <span className="text-xs font-normal text-muted-foreground">
                              {isUnscored(d) ? 'ไม่มีคะแนน' : d.state === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ส่ง'}
                            </span>
                          )}
                      </td>
                      {showClassAverage && <td className="px-3 py-2.5 text-right align-top text-muted-foreground tabular-nums">
                        {formatPercent(d.classAverage ?? null)}
                      </td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          เปอร์เซ็นต์คือคะแนนที่ได้เทียบกับคะแนนเต็มของแต่ละงาน นับครั้งที่งานนั้นใช้เป็นคะแนนจริง · งานที่ยังไม่ส่งไม่นำมาคิดค่าเฉลี่ย ·
          {showClassAverage && 'ค่าเฉลี่ยห้องคิดจากนักเรียนที่ส่งงานนั้นแล้ว · '}กด ← → เพื่อดูคนก่อนหน้าหรือคนถัดไป
        </p>
      </div>
    </>
  )
}

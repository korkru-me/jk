'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, UsersRound } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PracticeStudentProgressSummary } from '@/lib/practice-progress'
import { buildPracticeProgressHref } from '@/lib/practice-progress'

interface PracticeProgressDashboardProps {
  libraryId: string
  totalQuestionCount: number
  rows: readonly PracticeStudentProgressSummary[]
  hrefBase?: string
}

function matchesStudent(row: PracticeStudentProgressSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('th-TH')
  if (!normalized) return true
  return [row.display_name, row.class_number?.toString() ?? '']
    .some(value => value.toLocaleLowerCase('th-TH').includes(normalized))
}

export function PracticeProgressDashboard({
  libraryId,
  totalQuestionCount,
  rows,
  hrefBase,
}: PracticeProgressDashboardProps) {
  const [query, setQuery] = useState('')
  const filteredRows = useMemo(
    () => rows.filter(row => matchesStudent(row, query)),
    [query, rows],
  )
  const activeStudentCount = rows.filter(row => row.total_attempt_count > 0).length

  return (
    <Card padding="none" className="flex min-w-0 flex-col overflow-hidden" data-practice-progress-dashboard>
      <div className="flex min-w-0 flex-col gap-2 border-b p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-4" aria-hidden="true" />ข้อมูลการฝึกฝน</h2>
          <span className="text-xs text-muted-foreground">ฝึกแล้ว {activeStudentCount}/{rows.length} คน</span>
        </div>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="practice-student-search" className="sr-only">
          ค้นหานักเรียน
        </FieldLabel>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="practice-student-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อหรือเลขที่"
            className="h-11 pl-9"
          />
        </div>
      </Field>
      </div>
        {rows.length === 0 ? (
          <Empty className="border-0 py-4">
            <EmptyHeader>
              <EmptyMedia variant="icon"><UsersRound aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>ยังไม่มีนักเรียนในห้อง</EmptyTitle>
              <EmptyDescription>เมื่อมีนักเรียนเข้าห้อง รายชื่อจะปรากฏที่นี่</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filteredRows.length === 0 ? (
          <Empty className="border-0 py-4">
            <EmptyHeader>
              <EmptyTitle>ไม่พบนักเรียนที่ค้นหา</EmptyTitle>
              <EmptyDescription>ลองใช้ชื่อหรือเลขที่อื่น</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto overscroll-contain">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>นักเรียน</TableHead>
                <TableHead className="text-right">ข้อที่ฝึก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => (
                <TableRow key={row.student_id} className="h-12">
                  <TableCell className="w-full min-w-0 whitespace-normal">
                    <Link
                      href={buildPracticeProgressHref(libraryId, row.student_id, { q: '', page: 1 }, 1, hrefBase)}
                      className="flex min-h-11 flex-col justify-center break-words font-medium text-foreground outline-none hover:text-primary focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span>{row.display_name}</span>
                      {row.class_number !== null && (
                        <span className="text-xs font-normal text-muted-foreground">
                          เลขที่ {row.class_number}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.attempted_question_count}/{totalQuestionCount}
                    <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">{row.total_attempt_count} รอบ</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
    </Card>
  )
}

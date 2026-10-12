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

interface PracticeProgressDashboardProps {
  libraryId: string
  totalQuestionCount: number
  rows: readonly PracticeStudentProgressSummary[]
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
}: PracticeProgressDashboardProps) {
  const [query, setQuery] = useState('')
  const filteredRows = useMemo(
    () => rows.filter(row => matchesStudent(row, query)),
    [query, rows],
  )
  const activeStudentCount = rows.filter(row => row.total_attempt_count > 0).length

  return (
    <div className="flex flex-col gap-3">
      <Card padding="none">
        <dl className="grid min-h-16 grid-cols-3 divide-x divide-border">
          <div className="flex min-w-0 flex-col justify-center px-3 py-2">
            <dt className="truncate text-xs text-muted-foreground">นักเรียน</dt>
            <dd className="font-semibold tabular-nums">{rows.length} คน</dd>
          </div>
          <div className="flex min-w-0 flex-col justify-center px-3 py-2">
            <dt className="truncate text-xs text-muted-foreground">เคยลองตอบ</dt>
            <dd className="font-semibold tabular-nums">{activeStudentCount} คน</dd>
          </div>
          <div className="flex min-w-0 flex-col justify-center px-3 py-2">
            <dt className="truncate text-xs text-muted-foreground">โจทย์ในคลัง</dt>
            <dd className="font-semibold tabular-nums">{totalQuestionCount} ข้อ</dd>
          </div>
        </dl>
      </Card>

      <Field className="max-w-md gap-1.5">
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
            placeholder="ค้นหาชื่อหรือเลขประจำตัว"
            className="h-11 pl-9"
          />
        </div>
      </Field>

      <Card padding="none" className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty className="min-h-52 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><UsersRound aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>ยังไม่มีนักเรียนในห้อง</EmptyTitle>
              <EmptyDescription>เมื่อมีนักเรียนเข้าห้อง รายชื่อจะปรากฏที่นี่</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filteredRows.length === 0 ? (
          <Empty className="min-h-40 border-0">
            <EmptyHeader>
              <EmptyTitle>ไม่พบนักเรียนที่ค้นหา</EmptyTitle>
              <EmptyDescription>ลองใช้ชื่อหรือเลขประจำตัวที่สั้นลง</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>นักเรียน</TableHead>
                <TableHead className="text-right">ข้อที่เคยตอบ</TableHead>
                <TableHead className="text-right">ตอบทั้งหมด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => (
                <TableRow key={row.student_id} className="h-12">
                  <TableCell className="min-w-44 whitespace-normal">
                    <Link
                      href={`/practice/${libraryId}/progress/${row.student_id}`}
                      className="flex min-h-11 flex-col justify-center font-medium text-foreground outline-none hover:text-primary focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50"
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
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.total_attempt_count} ครั้ง
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

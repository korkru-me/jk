import Link from 'next/link'
import { BookOpenCheck, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import type { PracticeQuestionProgressSummary } from '@/lib/practice-progress'
import { buildPracticeProgressHref } from '@/lib/practice-progress'

interface PracticeStudentDetailProps {
  libraryId: string
  studentId: string
  rows: readonly PracticeQuestionProgressSummary[]
  query: string
  page: number
  totalPages: number
  total: number
  hrefBase?: string
}

export function PracticeStudentDetail({
  libraryId,
  studentId,
  rows,
  query,
  page,
  totalPages,
  total,
  hrefBase,
}: PracticeStudentDetailProps) {
  const state = { q: query, page }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <form method="get" className="flex w-full max-w-lg items-end gap-2">
          <input type="hidden" name="tab" value="progress" />
          <input type="hidden" name="student" value={studentId} />
          <Field className="min-w-0 flex-1 gap-1.5">
            <FieldLabel htmlFor="practice-question-progress-search" className="sr-only">
              ค้นหาโจทย์
            </FieldLabel>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="practice-question-progress-search"
                name="q"
                defaultValue={query}
                placeholder="ค้นหาชื่อโจทย์หรือแท็ก"
                className="h-11 pl-9"
              />
            </div>
          </Field>
          <Button type="submit" className="min-h-11">ค้นหา</Button>
        </form>
        <p className="text-sm text-muted-foreground">พบ {total.toLocaleString('th-TH')} ข้อ</p>
      </div>

      <Card padding="none" className="overflow-hidden">
        {rows.length === 0 && !query ? (
          <Empty className="min-h-52 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><BookOpenCheck aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>คลังนี้ยังไม่มีโจทย์</EmptyTitle>
              <EmptyDescription>เพิ่มโจทย์ในหน้าตั้งค่าคลังฝึกก่อนดูความคืบหน้า</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : rows.length === 0 ? (
          <Empty className="min-h-40 border-0">
            <EmptyHeader>
              <EmptyTitle>ไม่พบโจทย์ที่ค้นหา</EmptyTitle>
              <EmptyDescription>ลองค้นด้วยชื่อหรือแท็กอื่น</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>โจทย์</TableHead>
                <TableHead className="hidden sm:table-cell">แท็ก</TableHead>
                <TableHead className="text-right">จำนวนรอบ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.question_id} className="h-12">
                  <TableCell className="max-w-80 whitespace-normal font-medium">
                    <span className="line-clamp-2">{row.title}</span>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">{row.attempt_count > 0 ? 'ฝึกแล้ว' : 'ยังไม่ได้ฝึก'}</p>
                    <div className="mt-1 flex gap-1 sm:hidden">
                      {row.tags.slice(0, 1).map(tag => (
                        <Badge key={tag} variant="secondary" className="max-w-36 truncate">
                          {tag}
                        </Badge>
                      ))}
                      {row.tags.length > 1 && <Badge variant="outline">+{row.tags.length - 1}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex max-w-80 gap-1 overflow-hidden">
                      {row.tags.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="secondary" className="max-w-36 truncate">
                          {tag}
                        </Badge>
                      ))}
                      {row.tags.length > 2 && <Badge variant="outline">+{row.tags.length - 2}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.attempt_count} รอบ
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="หน้าความคืบหน้าโจทย์">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page <= 1}
            render={page > 1
              ? <Link href={buildPracticeProgressHref(libraryId, studentId, state, page - 1, hrefBase)} />
              : undefined}
          >
            <ChevronLeft data-icon="inline-start" aria-hidden="true" />
            ก่อนหน้า
          </Button>
          <span className="w-24 text-center text-sm text-muted-foreground">
            หน้า {page.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page >= totalPages}
            render={page < totalPages
              ? <Link href={buildPracticeProgressHref(libraryId, studentId, state, page + 1, hrefBase)} />
              : undefined}
          >
            ถัดไป
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  )
}

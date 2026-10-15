import Link from 'next/link'
import { ArrowRight, BookOpen, BookOpenCheck, Repeat } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { PracticeLibraryListActions } from '@/app/(app)/practice/_components/practice-library-list-actions'
import { PRACTICE_LIBRARY_STATUS_LABELS } from '@/app/(app)/practice/_lib/teacher-contract'
import type { ClassroomPracticeLibrariesResult } from '@/lib/classroom-practice-libraries'
import { coverOf, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { cn } from '@/lib/utils'

export function ClassroomPracticeLibraries({
  result,
  studentView = false,
  canManage = false,
  classroomDescription,
}: {
  result: ClassroomPracticeLibrariesResult
  studentView?: boolean
  canManage?: boolean
  classroomDescription?: string | null
}) {
  const cover = coverOf(parseDescription(classroomDescription ?? null))

  return (
    <section aria-labelledby="classroom-practice-heading" className="@container flex min-w-0 flex-col gap-2.5" data-classroom-practice-libraries>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="classroom-practice-heading" className="font-semibold">คลังฝึก</h2>
        {!studentView && <Badge variant="outline">ไม่มีคะแนน</Badge>}
        {!studentView && !result.error && <span className="text-xs text-muted-foreground">{result.items.length} คลัง</span>}
      </div>
      {result.error ? (
        <Alert variant="destructive">
          <AlertTitle>แสดงคลังฝึกไม่สำเร็จ</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : result.items.length === 0 ? (
        <Empty className="min-h-24 border border-dashed border-border p-4">
          <EmptyHeader>
            <EmptyTitle>ยังไม่มีคลังฝึก{studentView ? 'ที่เปิดให้ใช้' : 'ในห้องนี้'}</EmptyTitle>
            <EmptyDescription>
              {studentView ? 'เมื่อครูเผยแพร่คลังฝึก รายการจะปรากฏที่นี่' : 'เลือกคลังฝึกจากเมนูมอบหมายงานเพื่อสร้างชุดโจทย์ให้นักเรียนฝึกเอง'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : studentView ? (
        <ul className="grid grid-cols-1 gap-2 @min-[30rem]:grid-cols-2 @min-[46rem]:grid-cols-3" data-student-practice-grid>
          {result.items.map(item => (
            <li key={item.id} className="min-w-0">
              <Link
                href={`/practice/${item.id}`}
                aria-label={`เปิดคลังฝึก ${item.title} · ${item.questionCount} ข้อ · ไม่มีคะแนน · ฝึกซ้ำได้`}
                className="group block h-full min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                data-student-practice-card
              >
                <Card radius="md" interactive className="relative flex h-full min-w-0 items-start gap-2.5 overflow-hidden py-3 pl-4 pr-3 group-hover:border-primary/30">
                  <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden="true" />
                  <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-foreground')}>
                    <BookOpenCheck className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <p className="min-w-0 flex-1 line-clamp-2 break-words text-sm font-semibold leading-snug" title={item.title}>{item.title}</p>
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className={cn('font-medium', cover?.textMuted ?? 'text-foreground/75')}>คลังฝึก</span>
                      <span className="flex items-center gap-1"><BookOpen className="size-3" aria-hidden="true" />{item.questionCount} ข้อ</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">ไม่มีคะแนน</Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Repeat className="size-3" aria-hidden="true" />ฝึกซ้ำได้</span>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-border">
            {result.items.map(item => (
              <li key={item.id} className="flex min-h-16 min-w-0 items-center gap-2 px-3 py-2" data-classroom-practice-row>
                <BookOpenCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {canManage ? (
                    <Link
                      href={`/practice/${item.id}/edit`}
                      className="flex min-h-11 min-w-0 flex-col justify-center gap-1 rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`แก้ไขคลังฝึก ${item.title}`}
                    >
                      <span className="break-words text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.questionCount} ข้อ</span>
                    </Link>
                  ) : (
                    <div className="flex min-h-11 flex-col justify-center gap-1">
                      <p className="break-words text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.questionCount} ข้อ</p>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={item.status === 'published' ? 'statusSuccess' : item.status === 'draft' ? 'secondary' : 'outline'}>
                    {PRACTICE_LIBRARY_STATUS_LABELS[item.status]}
                  </Badge>
                  <PracticeLibraryListActions id={item.id} title={item.title} status={item.status} canManage={canManage} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

import Link from 'next/link'
import { ArrowRight, BookOpenCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { PracticeLibraryListActions } from '@/app/(app)/practice/_components/practice-library-list-actions'
import { PRACTICE_LIBRARY_STATUS_LABELS } from '@/app/(app)/practice/_lib/teacher-contract'
import type { ClassroomPracticeLibrariesResult } from '@/lib/classroom-practice-libraries'

export function ClassroomPracticeLibraries({
  result,
  studentView = false,
  canManage = false,
}: {
  result: ClassroomPracticeLibrariesResult
  studentView?: boolean
  canManage?: boolean
}) {
  return (
    <section aria-labelledby="classroom-practice-heading" className="flex min-w-0 flex-col gap-2.5" data-classroom-practice-libraries>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="classroom-practice-heading" className="flex items-center gap-1.5 font-semibold text-work-practice"><BookOpenCheck className="size-4" aria-hidden="true" />คลังฝึก</h2>
        <Badge variant="outline">ไม่มีคะแนน</Badge>
        {!result.error && <span className="text-xs text-muted-foreground">{result.items.length} คลัง</span>}
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
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-border">
            {result.items.map(item => (
              <li key={item.id} className="flex min-h-16 min-w-0 items-center gap-2 px-3 py-2" data-classroom-practice-row>
                <BookOpenCheck className="size-5 shrink-0 text-work-practice" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {studentView || canManage ? (
                    <Link
                      href={studentView ? `/practice/${item.id}` : `/practice/${item.id}/edit`}
                      className="flex min-h-11 min-w-0 flex-col justify-center gap-1 rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${studentView ? 'เปิด' : 'แก้ไข'}คลังฝึก ${item.title}`}
                    >
                      <span className="break-words text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.questionCount} ข้อ{studentView ? ' · ฝึกซ้ำได้' : ''}</span>
                    </Link>
                  ) : (
                    <div className="flex min-h-11 flex-col justify-center gap-1">
                      <p className="break-words text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.questionCount} ข้อ</p>
                    </div>
                  )}
                </div>
                {studentView ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : (
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={item.status === 'published' ? 'statusSuccess' : item.status === 'draft' ? 'secondary' : 'outline'}>
                      {PRACTICE_LIBRARY_STATUS_LABELS[item.status]}
                    </Badge>
                    <PracticeLibraryListActions id={item.id} title={item.title} status={item.status} canManage={canManage} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

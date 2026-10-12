import Link from 'next/link'
import { ArrowRight, BookOpenCheck, Plus } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PracticeLibraryListActions } from './_components/practice-library-list-actions'
import {
  PRACTICE_LIBRARY_STATUS_LABELS,
  type PracticeLibraryStatus,
} from './_lib/teacher-contract'
import {
  loadManageablePracticeClassrooms,
  loadTeacherPracticeLibraries,
} from './_lib/teacher-data'
import { loadStudentPracticeLibraries } from './_lib/student-landing-data'
import type { StudentPracticeLibraryListItem } from './_lib/student-landing-contract'

export const metadata = { title: 'คลังฝึก — KorKru' }

function statusVariant(status: PracticeLibraryStatus) {
  if (status === 'published') return 'statusSuccess' as const
  if (status === 'closed') return 'outline' as const
  return 'secondary' as const
}

export default async function PracticeLandingPage() {
  if (!isPracticeLibraryEnabled(process.env)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    return <PracticeLandingError message="ตรวจสิทธิ์ผู้ใช้ไม่สำเร็จ" />
  }
  if (!profile || profile.status !== 'active') redirect('/dashboard')

  if (profile.role === 'student') {
    const result = await loadStudentPracticeLibraries(supabase, user.id)
    return <StudentPracticeLanding items={result.items} error={result.error} />
  }
  if (profile.role !== 'teacher' && profile.role !== 'admin') redirect('/dashboard')

  const [{ items, error }, classroomResult] = await Promise.all([
    loadTeacherPracticeLibraries(supabase, user.id),
    loadManageablePracticeClassrooms(supabase, user.id),
  ])
  const canCreate = classroomResult.classrooms.length > 0

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex min-h-16 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">คลังฝึก</h1>
            <Badge variant="outline">ไม่มีคะแนน</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            เปิดโจทย์ให้นักเรียนเลือกฝึกเอง โดยไม่เข้าสมุดคะแนน
          </p>
        </div>
        {canCreate ? (
          <Button className="min-h-11" render={<Link href="/practice/new" />}>
            <Plus data-icon="inline-start" />
            สร้างคลังฝึก
          </Button>
        ) : (
          <Button className="min-h-11" disabled title="ต้องมีห้องเรียนรายวิชาที่จัดการได้ก่อน">
            <Plus data-icon="inline-start" />
            สร้างคลังฝึก
          </Button>
        )}
      </header>

      {error || classroomResult.error ? (
        <Card padding="md">
          <p role="alert" className="text-sm font-medium text-destructive">
            {error ?? classroomResult.error}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            ยังไม่มีการเปลี่ยนแปลงข้อมูล ลองโหลดหน้านี้ใหม่
          </p>
        </Card>
      ) : items.length === 0 ? (
        <Empty className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenCheck aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>ยังไม่มีคลังฝึก</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? 'เริ่มจากตั้งชื่อ เลือกห้องเรียน และเลือกโจทย์จากคลัง'
                : 'สร้างห้องเรียนรายวิชา หรือขอสิทธิ์จัดการห้องก่อน'}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && (
            <EmptyContent>
              <Button className="min-h-11" render={<Link href="/practice/new" />}>สร้างคลังฝึก</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden min-h-10 grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_6rem_7rem_2.5rem] items-center gap-3 border-b border-border px-3 text-xs font-medium text-muted-foreground sm:grid">
            <span>คลังฝึก</span>
            <span>ห้องเรียน</span>
            <span className="text-right">โจทย์</span>
            <span>สถานะ</span>
            <span className="sr-only">การจัดการ</span>
          </div>
          <div role="list">
            {items.map(({ library, classroomName, canManage, questionCount }) => (
              <div
                key={library.id}
                role="listitem"
                className="grid min-h-16 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_6rem_7rem_2.5rem]"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {canManage ? (
                      <Link href={`/practice/${library.id}/edit`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                        {library.title}
                      </Link>
                    ) : (
                      <p className="min-w-0 flex-1 truncate text-sm font-medium" title={library.title}>{library.title}</p>
                    )}
                    <Badge className="sm:hidden" variant={statusVariant(library.status)}>
                      {PRACTICE_LIBRARY_STATUS_LABELS[library.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                    {classroomName} · {questionCount} ข้อ
                  </p>
                </div>
                <p className="hidden truncate text-sm text-muted-foreground sm:block" title={classroomName}>{classroomName}</p>
                <p className="hidden text-right text-sm tabular-nums sm:block">{questionCount}</p>
                <div className="hidden sm:block">
                  <Badge variant={statusVariant(library.status)}>
                    {PRACTICE_LIBRARY_STATUS_LABELS[library.status]}
                  </Badge>
                </div>
                <PracticeLibraryListActions
                  id={library.id}
                  title={library.title}
                  status={library.status}
                  canManage={canManage}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function PracticeLandingError({ message }: { message: string }) {
  return (
    <Card padding="md" className="mx-auto w-full max-w-3xl">
      <p role="alert" className="text-sm font-medium text-destructive">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        ยังไม่มีการเปลี่ยนแปลงข้อมูล ลองโหลดหน้านี้ใหม่
      </p>
    </Card>
  )
}

function StudentPracticeLanding({
  items,
  error,
}: {
  items: StudentPracticeLibraryListItem[]
  error: string | null
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex min-h-16 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">คลังฝึก</h1>
            <Badge variant="outline">ไม่มีคะแนน</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกคลังโจทย์จากห้องเรียน แล้วฝึกซ้ำได้ตามต้องการ
          </p>
        </div>
      </header>

      {error ? (
        <PracticeLandingError message={error} />
      ) : items.length === 0 ? (
        <Empty className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenCheck aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>ยังไม่มีคลังฝึกที่เปิดให้ใช้</EmptyTitle>
            <EmptyDescription>
              เมื่อครูเผยแพร่คลังฝึกในห้องเรียนรายวิชา รายการจะปรากฏที่นี่
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden min-h-10 grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_6rem_2.5rem] items-center gap-3 border-b border-border px-3 text-xs font-medium text-muted-foreground sm:grid">
            <span>คลังฝึก</span>
            <span>ห้องเรียน</span>
            <span className="text-right">โจทย์</span>
            <span className="sr-only">เปิดคลังฝึก</span>
          </div>
          <ul>
            {items.map(item => (
              <li key={item.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/practice/${item.id}`}
                  className="grid min-h-16 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 px-3 py-2 transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_6rem_2.5rem]"
                  aria-label={`เปิดคลังฝึก ${item.title} ห้อง ${item.classroomName}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                      {item.classroomName} · {item.questionCount} ข้อ
                    </p>
                  </div>
                  <p className="hidden truncate text-sm text-muted-foreground sm:block" title={item.classroomName}>
                    {item.classroomName}
                  </p>
                  <p className="hidden text-right text-sm tabular-nums sm:block">{item.questionCount}</p>
                  <span className="flex size-11 items-center justify-center justify-self-end rounded-lg text-muted-foreground sm:size-8">
                    <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

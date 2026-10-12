import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BookOpenCheck } from 'lucide-react'
import { PracticeStudentDetail } from '@/components/practice/practice-student-detail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAuthUser } from '@/lib/auth/server'
import { parsePracticeProgressSearchParams } from '@/lib/practice-progress'
import { readPracticeStudentProgress } from '@/lib/practice-progress.server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'

export default async function PracticeStudentProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; studentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [{ id, studentId }, rawSearch] = await Promise.all([params, searchParams])
  const state = parsePracticeProgressSearchParams(rawSearch)
  const progress = await readPracticeStudentProgress(id, studentId, user.id, state)
  if (!progress) notFound()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex min-h-16 flex-wrap items-center gap-3">
        <Button className="size-11" variant="ghost" size="icon" render={<Link href={`/practice/${id}/progress`} />} aria-label="กลับไปภาพรวมความคืบหน้า">
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-foreground">{progress.student.display_name}</h1>
            <Badge variant="secondary"><BookOpenCheck data-icon="inline-start" /> ไม่มีคะแนน</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {progress.student.class_number !== null ? `เลขที่ ${progress.student.class_number} · ` : ''}
            {progress.library.title}
          </p>
        </div>
      </header>

      <PracticeStudentDetail
        libraryId={id}
        studentId={studentId}
        rows={progress.questions}
        query={progress.query}
        page={progress.canonical_page}
        totalPages={progress.total_pages}
        total={progress.total_question_count}
      />
    </div>
  )
}

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BookOpenCheck } from 'lucide-react'
import { PracticeProgressDashboard } from '@/components/practice/practice-progress-dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAuthUser } from '@/lib/auth/server'
import { readPracticeProgressOverview } from '@/lib/practice-progress.server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'

export default async function PracticeProgressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { id } = await params
  const progress = await readPracticeProgressOverview(id, user.id)
  if (!progress) notFound()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button className="size-11" variant="ghost" size="icon" render={<Link href={`/practice/${id}/edit`} />} aria-label="กลับไปหน้าตั้งค่าคลังฝึก">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-foreground">ความคืบหน้าการฝึก</h1>
              <Badge variant="workPractice"><BookOpenCheck data-icon="inline-start" /> ไม่มีคะแนน</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">{progress.library.title}</p>
          </div>
        </div>
      </header>

      <PracticeProgressDashboard
        libraryId={id}
        totalQuestionCount={progress.total_question_count}
        rows={progress.students}
      />
    </div>
  )
}

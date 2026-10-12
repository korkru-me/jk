import Link from 'next/link'
import { BookOpenCheck } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
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
import { PracticeLibraryForm } from '../_components/practice-library-form'
import {
  authenticatePracticeTeacher,
  loadManageablePracticeClassrooms,
  loadSupportedPracticeBankQuestions,
} from '../_lib/teacher-data'

export const metadata = { title: 'สร้างคลังฝึก — KorKru' }

interface NewPracticeLibraryPageProps {
  searchParams: Promise<{ classroom?: string | string[] }>
}

export default async function NewPracticeLibraryPage({
  searchParams,
}: NewPracticeLibraryPageProps) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()

  const supabase = await createClient()
  const actor = await authenticatePracticeTeacher(supabase)
  if (!actor.ok) {
    if (actor.unauthenticated) redirect('/login')
    redirect('/dashboard')
  }

  const [{ classrooms, error: classroomError }, bank] = await Promise.all([
    loadManageablePracticeClassrooms(supabase, actor.userId),
    loadSupportedPracticeBankQuestions(supabase, actor.userId),
  ])
  const query = await searchParams
  const requestedClassroom = Array.isArray(query.classroom)
    ? query.classroom[0]
    : query.classroom

  if (classroomError || bank.error) {
    return (
      <Card padding="md" className="mx-auto w-full max-w-3xl">
        <p role="alert" className="text-sm font-medium text-destructive">
          {classroomError ?? bank.error}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          ยังไม่มีการเปลี่ยนแปลงข้อมูล ลองโหลดหน้านี้ใหม่
        </p>
        <Button className="mt-3 min-h-11" variant="outline" render={<Link href="/practice" />}>
          กลับคลังฝึก
        </Button>
      </Card>
    )
  }

  if (classrooms.length === 0) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BookOpenCheck aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>ยังไม่มีห้องเรียนที่สร้างคลังฝึกได้</EmptyTitle>
          <EmptyDescription>
            ใช้ห้องเรียนรายวิชาที่เปิดอยู่ และต้องเป็นเจ้าของหรือผู้ช่วยสอนที่มีสิทธิ์จัดการ
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button className="min-h-11" variant="outline" render={<Link href="/practice" />}>กลับคลังฝึก</Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <PracticeLibraryForm
      classrooms={classrooms}
      questions={bank.questions}
      initialClassroomId={requestedClassroom}
    />
  )
}

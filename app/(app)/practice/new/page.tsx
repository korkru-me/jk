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
import { firstSearchParam } from '@/lib/assignment-creation'
import { isUuid } from '@/lib/practice-library-contracts'
import { PracticeLibraryForm, type PracticeLibraryCopyPreset } from '../_components/practice-library-form'
import type { AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'
import {
  authenticatePracticeTeacher,
  loadManageablePracticeClassrooms,
  loadSupportedPracticeBankQuestions,
  loadPracticeLibraryForTeacher,
  loadPracticeLibraryQuestionIds,
  loadPracticeCopyQuestions,
} from '../_lib/teacher-data'

export const metadata = { title: 'สร้างคลังฝึก — KorKru' }

interface NewPracticeLibraryPageProps {
  searchParams: Promise<{ classroom?: string | string[]; copy?: string | string[] }>
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

  const [{ classrooms, error: classroomError }, initialBank, { data: questionSets }] = await Promise.all([
    loadManageablePracticeClassrooms(supabase, actor.userId),
    loadSupportedPracticeBankQuestions(supabase, actor.userId),
    supabase
      .from('question_sets')
      .select('id, title, description, question_ids, sections')
      .eq('created_by', actor.userId)
      .order('created_at', { ascending: false }),
  ])
  const query = await searchParams
  const requestedClassroom = Array.isArray(query.classroom)
    ? query.classroom[0]
    : query.classroom

  const copyId = firstSearchParam(query.copy)
  let bank = { ...initialBank, missingIds: [] as string[], unsupportedIds: [] as string[] }
  let copyPreset: PracticeLibraryCopyPreset | undefined
  if (copyId) {
    if (!isUuid(copyId) || !requestedClassroom) notFound()
    const target = classrooms.find(room => room.id === requestedClassroom)
    if (!target) notFound()
    const source = await loadPracticeLibraryForTeacher(supabase, actor.userId, copyId)
    if (!source?.canManage || source.library.org_id !== target.orgId) notFound()
    const membership = await loadPracticeLibraryQuestionIds(supabase, copyId)
    if (membership.error) bank = { ...bank, error: membership.error }
    else {
      bank = await loadPracticeCopyQuestions(supabase, actor.userId, membership.ids, initialBank)
      const suffix = ' (สำเนา)'
      copyPreset = {
        sourceTitle: source.library.title,
        title: source.library.title.slice(0, 160 - suffix.length) + suffix,
        description: source.library.description,
        questionIds: membership.ids,
        revealAnswerKey: source.library.reveal_answer_key,
        accessCode: source.library.access_code,
        calculatorEnabled: source.library.calculator_enabled,
        scratchpadEnabled: source.library.scratchpad_enabled,
        shuffleQuestions: source.library.shuffle_questions,
        shuffleOptions: source.library.shuffle_options,
      }
    }
  }

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
      questionSets={(questionSets ?? []) as AssignmentQuestionSetOption[]}
      initialClassroomId={requestedClassroom}
      copyPreset={copyPreset}
      missingQuestionIds={bank.missingIds}
      unsupportedQuestionIds={bank.unsupportedIds}
    />
  )
}

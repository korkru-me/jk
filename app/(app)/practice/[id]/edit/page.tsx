import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PracticeLibraryForm } from '../../_components/practice-library-form'
import type { AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'
import {
  authenticatePracticeTeacher,
  loadPracticeEditorQuestions,
  loadPracticeLibraryForTeacher,
  loadPracticeLibraryQuestionIds,
} from '../../_lib/teacher-data'

export const metadata = { title: 'ตั้งค่าคลังฝึก — KorKru' }

interface EditPracticeLibraryPageProps {
  params: Promise<{ id: string }>
}

export default async function EditPracticeLibraryPage({
  params,
}: EditPracticeLibraryPageProps) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()

  const { id } = await params
  const supabase = await createClient()
  const actor = await authenticatePracticeTeacher(supabase)
  if (!actor.ok) {
    if (actor.unauthenticated) redirect('/login')
    redirect('/dashboard')
  }

  const loaded = await loadPracticeLibraryForTeacher(supabase, actor.userId, id)
  if (!loaded?.canManage) notFound()

  const membership = await loadPracticeLibraryQuestionIds(supabase, loaded.library.id)
  if (membership.error) {
    return (
      <Card padding="md" className="mx-auto w-full max-w-3xl">
        <p role="alert" className="text-sm font-medium text-destructive">{membership.error}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          ยังไม่มีการเปลี่ยนแปลงข้อมูล ลองโหลดหน้านี้ใหม่
        </p>
        <Button className="mt-3 min-h-11" variant="outline" render={<Link href="/practice" />}>
          กลับคลังฝึก
        </Button>
      </Card>
    )
  }

  const [bank, { data: questionSets }] = await Promise.all([
    loadPracticeEditorQuestions(
      supabase,
      actor.userId,
      loaded.library.id,
      membership.ids,
    ),
    supabase
      .from('question_sets')
      .select('id, title, description, question_ids, sections')
      .eq('created_by', actor.userId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <PracticeLibraryForm
      classrooms={[{
        id: loaded.classroom.id,
        orgId: loaded.classroom.org_id,
        name: loaded.classroom.name,
        description: loaded.classroom.description,
      }]}
      questions={bank.questions}
      questionSets={(questionSets ?? []) as AssignmentQuestionSetOption[]}
      missingQuestionIds={bank.missingIds}
      unsupportedQuestionIds={bank.unsupportedIds}
      loadingWarning={bank.error}
      editableQuestionIds={bank.editableQuestionIds}
      initialLibrary={{
        id: loaded.library.id,
        title: loaded.library.title,
        description: loaded.library.description,
        classroomId: loaded.library.classroom_id,
        questionIds: membership.ids,
        status: loaded.library.status,
        revealAnswerKey: loaded.library.reveal_answer_key,
        accessCode: loaded.library.access_code,
        calculatorEnabled: loaded.library.calculator_enabled,
        scratchpadEnabled: loaded.library.scratchpad_enabled,
        shuffleQuestions: loaded.library.shuffle_questions,
        shuffleOptions: loaded.library.shuffle_options,
      }}
    />
  )
}

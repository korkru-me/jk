import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { parsePracticeProgressSearchParams } from '@/lib/practice-progress'
import { readPracticeProgressOverview, readPracticeStudentProgress } from '@/lib/practice-progress.server'
import { practiceManagementHref, type PracticeManagementSection } from '@/lib/practice-management'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PracticeManagementShell } from '@/components/practice/practice-management-shell'
import { PracticeManagementQuestions } from '@/components/practice/practice-management-questions'
import { PracticeProgressDashboard } from '@/components/practice/practice-progress-dashboard'
import { PracticeStudentDetail } from '@/components/practice/practice-student-detail'
import { PracticeLibraryForm } from '../../_components/practice-library-form'
import type { AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'
import {
  authenticatePracticeTeacher,
  loadManagedPracticeQuestionRows,
  loadPracticeEditorQuestions,
  loadPracticeLibraryForTeacher,
  loadPracticeLibraryQuestionIds,
} from '../../_lib/teacher-data'

export const metadata = { title: 'จัดการคลังฝึก — KorKru' }

export default async function EditPracticeLibraryPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const [{ id }, search] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const actor = await authenticatePracticeTeacher(supabase)
  if (!actor.ok) redirect(actor.unauthenticated ? '/login' : '/dashboard')
  const loaded = await loadPracticeLibraryForTeacher(supabase, actor.userId, id)
  if (!loaded?.canManage) notFound()
  const section: PracticeManagementSection = search.tab === 'settings' ? 'settings' : search.tab === 'progress' ? 'progress' : 'overview'
  const [membership, overview] = await Promise.all([
    loadPracticeLibraryQuestionIds(supabase, id), readPracticeProgressOverview(id, actor.userId),
  ])
  if (!overview) notFound()
  if (membership.error) return <Card padding="md"><p role="alert" className="text-sm text-destructive">{membership.error} กรุณาโหลดหน้าใหม่</p></Card>
  const summary = {
    id, title: loaded.library.title, status: loaded.library.status,
    classroom: { id: loaded.classroom.id, name: loaded.classroom.name, description: loaded.classroom.description },
    questionCount: membership.ids.length, studentCount: overview.students.length,
  }
  let content
  if (section === 'settings') {
    const [bank, questionSets] = await Promise.all([
      loadPracticeEditorQuestions(supabase, actor.userId, id, membership.ids),
      supabase.from('question_sets').select('id, title, description, question_ids, sections').eq('created_by', actor.userId).order('created_at', { ascending: false }),
    ])
    content = <PracticeLibraryForm embedded classrooms={[{ ...summary.classroom, orgId: loaded.classroom.org_id }]}
      questions={bank.questions} questionSets={(questionSets.data ?? []) as AssignmentQuestionSetOption[]}
      missingQuestionIds={bank.missingIds} unsupportedQuestionIds={bank.unsupportedIds} loadingWarning={bank.error}
      editableQuestionIds={bank.editableQuestionIds} initialLibrary={{
        id, title: loaded.library.title, description: loaded.library.description, classroomId: loaded.library.classroom_id,
        questionIds: membership.ids, status: loaded.library.status, revealAnswerKey: loaded.library.reveal_answer_key,
        accessCode: loaded.library.access_code, calculatorEnabled: loaded.library.calculator_enabled,
        scratchpadEnabled: loaded.library.scratchpad_enabled, shuffleQuestions: loaded.library.shuffle_questions, shuffleOptions: loaded.library.shuffle_options,
      }} />
  } else if (section === 'progress' && typeof search.student === 'string') {
    const progress = await readPracticeStudentProgress(id, search.student, actor.userId, parsePracticeProgressSearchParams(search))
    if (!progress) notFound()
    content = <section className="flex min-w-0 flex-col gap-3" aria-labelledby="practice-student-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="practice-student-heading" className="font-semibold">{progress.student.display_name}<span className="ml-2 text-xs font-normal text-muted-foreground">{progress.student.class_number !== null ? `เลขที่ ${progress.student.class_number}` : ''}</span></h2>
        <Button variant="ghost" size="sm" render={<Link href={practiceManagementHref(id, 'progress')} />}>รายชื่อนักเรียน</Button>
      </div>
      <p className="text-xs text-muted-foreground">เรียงข้อที่ฝึกแล้วก่อนข้อที่ยังไม่ได้ฝึก · 1 รอบนับเมื่อส่งคำตอบเพื่อตรวจสำเร็จ</p>
      <PracticeStudentDetail libraryId={id} studentId={search.student} rows={progress.questions} query={progress.query}
        page={progress.canonical_page} totalPages={progress.total_pages} total={progress.total_question_count} />
    </section>
  } else if (section === 'progress') {
    content = <PracticeProgressDashboard libraryId={id} totalQuestionCount={overview.total_question_count} rows={overview.students} />
  } else {
    const managed = await loadManagedPracticeQuestionRows(actor.userId, id)
    // Safe card projection; previews use the existing exact-library manager action.
    const questions = managed.rows.map(row => ({ id: row.id, title: row.title, question_text: row.question_text,
      question_type: row.question_type, difficulty: row.difficulty, tags: row.tags, subject: row.subject,
      group_id: null, order_in_group: null, question_categories: null }))
    content = <div className="grid min-w-0 items-start gap-3 @min-[60rem]/practice-management:grid-cols-[minmax(0,1fr)_20rem]" data-practice-overview-grid>
      <PracticeManagementQuestions libraryId={id} questions={questions} error={managed.error} />
      <PracticeProgressDashboard libraryId={id} totalQuestionCount={overview.total_question_count} rows={overview.students} />
    </div>
  }
  return <PracticeManagementShell summary={summary} section={section}>{content}</PracticeManagementShell>
}

import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { getExamReviewData } from '@/lib/exam-review'
import { parseSections } from '@/lib/question-set-sections'
import { ExamClient, type ExamConfig } from '@/components/exam/exam-client'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'ดูข้อสอบที่ทำแล้ว — KorKru' }

/**
 * "ดูข้อสอบที่ทำเสร็จแล้ว" — the student's handed-in ข้อสอบ in the exam layout
 * it was taken in, read-only, with the ถูก/ผิด panel and เฉลย under every ข้อ.
 * Offered from the result page only when the teacher ticked
 * allow_exam_review; getExamReviewData decides that again on every request.
 */
export default async function ExamReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getExamReviewData(id)

  if (result.state === 'not_found') {
    if (!(await getAuthUser())) redirect('/login')
    notFound()
  }
  // Not this student's to review (yet) — the result page says why.
  if (result.state === 'closed') redirect(`/submissions/${id}`)
  if (result.state === 'watermark_failed') {
    return <Card padding="md" role="alert">โหลดข้อมูลสำหรับลายน้ำไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อดูเฉลย</Card>
  }

  const { data } = result
  // Everything that guards a live attempt is off: the paper is handed in, and
  // ExamClient's review mode neither saves, times nor submits anything.
  const config: ExamConfig = {
    assignmentType: 'exam',
    proctoringEnabled: false,
    isFullscreenEnforced: false,
    blockClipboard: false,
    watermarkText: null,
    solutionWatermark: data.solutionWatermark,
    isWorkImageEnforced: false,
    calculatorEnabled: false,
    scratchpadEnabled: false,
  }

  return (
    <div className="h-full flex flex-col">
      <ExamClient
        submissionId={data.submissionId}
        storageOwnerId={data.studentId}
        answers={data.answers}
        durationMinutes={null}
        startedAt={new Date().toISOString()}
        config={config}
        sections={data.assignment.show_sections === false ? [] : parseSections(data.assignment.sections)}
        questionsPerPage={data.assignment.questions_per_page}
        review={{ feedback: data.feedback, returnHref: `/submissions/${id}` }}
      />
    </div>
  )
}

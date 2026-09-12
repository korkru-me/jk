'use client'

import { ExamClient } from '@/components/exam/exam-client'
import { useAppViewport } from '@/hooks/use-app-viewport'
import type { ExamScreenQaFixture } from '../_lib/fixture'

export function ExamScreenLabClient({
  fixture,
  submissionId,
  questionsPerPage,
}: {
  fixture: ExamScreenQaFixture
  submissionId: string
  questionsPerPage: number
}) {
  useAppViewport()

  return (
    <div className="h-[var(--app-height,100dvh)] overflow-y-auto overscroll-contain bg-muted/30 p-3 sm:p-6">
      <ExamClient
        submissionId={submissionId}
        storageOwnerId="qa-synthetic-student"
        answers={fixture.answers}
        initialWorkArtifacts={[]}
        durationMinutes={null}
        startedAt="2026-01-01T00:00:00.000Z"
        config={{
          proctoringEnabled: false,
          isFullscreenEnforced: false,
          blockClipboard: false,
          watermarkText: 'ข้อมูลจำลอง • DEVICE QA',
          isWorkImageEnforced: true,
          instantCheck: true,
          instantCheckAnswerKey: true,
          calculatorEnabled: true,
          scratchpadEnabled: true,
        }}
        sections={fixture.sections}
        questionsPerPage={questionsPerPage}
        previewMode
        previewReturnHref={`/exam-screen-lab?perPage=${questionsPerPage}`}
        previewEditWarning="ห้องทดลองเฉพาะเครื่องนักพัฒนา • ไม่บันทึกคำตอบ รูป หรือไฟล์ขึ้นระบบ"
      />
    </div>
  )
}

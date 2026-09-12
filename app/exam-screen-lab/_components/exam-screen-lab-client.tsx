'use client'

import { ExamClient } from '@/components/exam/exam-client'
import { useAppViewport } from '@/hooks/use-app-viewport'
import type { ExamScreenQaFixture } from '../_lib/fixture'

export function ExamScreenLabClient({
  fixture,
  submissionId,
  questionsPerPage,
  timerEnabled,
  startedAt,
  workImageRequired,
}: {
  fixture: ExamScreenQaFixture
  submissionId: string
  questionsPerPage: number
  timerEnabled: boolean
  startedAt: string
  workImageRequired: boolean
}) {
  useAppViewport()

  return (
    <div className="h-[var(--app-height,100dvh)] overflow-y-auto overscroll-contain bg-muted/30 p-3 sm:p-6">
      <ExamClient
        submissionId={submissionId}
        storageOwnerId="qa-synthetic-student"
        answers={fixture.answers}
        initialWorkArtifacts={[]}
        durationMinutes={timerEnabled ? 60 : null}
        startedAt={startedAt}
        config={{
          proctoringEnabled: false,
          isFullscreenEnforced: false,
          blockClipboard: false,
          watermarkText: 'ข้อมูลจำลอง • DEVICE QA',
          isWorkImageEnforced: workImageRequired,
          instantCheck: true,
          instantCheckAnswerKey: true,
          calculatorEnabled: true,
          scratchpadEnabled: true,
        }}
        sections={fixture.sections}
        questionsPerPage={questionsPerPage}
        previewMode
        previewReturnHref={`/exam-screen-lab?perPage=${questionsPerPage}${timerEnabled ? '&timer=1' : ''}${workImageRequired ? '' : '&work=0'}`}
        previewEditWarning="ห้องทดลองเฉพาะเครื่องนักพัฒนา • ไม่บันทึกคำตอบ รูป หรือไฟล์ขึ้นระบบ"
      />
    </div>
  )
}

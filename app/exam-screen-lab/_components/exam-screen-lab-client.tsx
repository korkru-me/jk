'use client'

import { ExamClient } from '@/components/exam/exam-client'
import { ShellClient } from '@/components/layout/shell-client'
import { useAppViewport } from '@/hooks/use-app-viewport'
import type { ExamScreenQaFixture } from '../_lib/fixture'

export function ExamScreenLabClient({
  fixture,
  submissionId,
  questionsPerPage,
  streak,
  durationMinutes = null,
  startedAt = '2026-01-01T00:00:00.000Z',
  assignmentType = 'exam',
  shell = false,
}: {
  fixture: ExamScreenQaFixture
  submissionId: string
  questionsPerPage: number
  durationMinutes?: number | null
  startedAt?: string
  assignmentType?: 'exam' | 'exercise'
  shell?: boolean
  /** Opt-in via ?streak=1, so the default lab screen is unchanged. Lets the
   *  "ถูกติดต่อกัน" chrome be looked at on a real device without a teacher
   *  login or a live attempt behind it. */
  streak?: {
    target: number
    current: number
    best: number
    reached: boolean
    askedCount: number
    questionCap: number | null
  }
}) {
  useAppViewport()

  const exam = (
    <ExamClient
      submissionId={submissionId}
      storageOwnerId="qa-synthetic-student"
      answers={fixture.answers}
      initialWorkArtifacts={[]}
      durationMinutes={durationMinutes}
      startedAt={startedAt}
      config={{
        assignmentType,
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
      streak={streak}
      previewMode
      previewReturnHref={`/exam-screen-lab?perPage=${questionsPerPage}`}
      previewEditWarning="ห้องทดลองเฉพาะเครื่องนักพัฒนา • ไม่บันทึกคำตอบ รูป หรือไฟล์ขึ้นระบบ"
    />
  )

  return shell ? (
    <ShellClient user={{ id: 'qa-synthetic-student', email: 'exam-preview@example.invalid', full_name: 'นักเรียนตัวอย่าง', role: 'student' }} initialUnreadCount={0} notificationsEnabled={false}>
      <div className="flex h-full flex-col">{exam}</div>
    </ShellClient>
  ) : (
    <main className="h-[var(--app-height,100dvh)] overflow-y-auto overscroll-contain bg-muted/30 p-3 sm:p-6">{exam}</main>
  )
}

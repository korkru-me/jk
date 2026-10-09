'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { ExamClient } from '@/components/exam/exam-client'
import { configureWaitingExamTransport } from '@/lib/seb-exam-client'

// No exam assets or question DOM are emitted by SSR before the canonical
// transport is configured. Ordinary pages retain their existing ExamClient.
const ClientExam = dynamic(() => import('./exam-client').then(module => module.ExamClient), {
  ssr: false,
  loading: () => <p role="status" className="text-sm text-muted-foreground">กำลังเปิดรอบสอบที่เซิร์ฟเวอร์ยืนยันแล้ว</p>,
})

export function WaitingExamRunner({ basePath, csrf, ...props }: ComponentProps<typeof ExamClient> & { basePath: string; csrf: string }) {
  configureWaitingExamTransport({ basePath, csrf })
  return <ClientExam {...props} />
}

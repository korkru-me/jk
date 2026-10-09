'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { WaitingExamRunner } from '@/components/exam/seb-exam-runner'
import type { SafeExamAnswer } from '@/lib/exam-safe'

/** Synthetic identifiers only. None is a registered resource or credential. */
export const SEB_WAITING_CLIENT_LAB = {
  path: '/exam-screen-lab/seb-waiting-client',
  assignmentId: '30000000-0000-4000-8000-000000000013',
  basePath: '/exam/30000000-0000-4000-8000-000000000013/r/1',
  submissionId: '40000000-0000-4000-8000-000000000014',
  ownerId: '20000000-0000-4000-8000-000000000012',
  answerIds: {
    written: '50000000-0000-4000-8000-000000000015',
    mcq: '50000000-0000-4000-8000-000000000016',
    file: '50000000-0000-4000-8000-000000000017',
  },
  durationMinutes: 30,
  startedAtKey: 'korkru:seb-waiting-client-lab:started-at',
} as const

const LAB = SEB_WAITING_CLIENT_LAB
const SYNTHETIC_CSRF = 'ui-lab-not-server-authority'

function answer(id: string, questionId: string, question: SafeExamAnswer['questions']): SafeExamAnswer {
  return { id, question_id: questionId, random_values: {}, student_answer: null,
    work_images: [], math_input_modes: {}, questions: question }
}

const commonQuestion = {
  answer_unit: null, mcq_options: null, variables: [], answer_parts: null, extra_data: null, image_urls: [],
}

/** Student-safe DTOs: no formulas, correct-answer flags, solution or key. */
const ANSWERS: SafeExamAnswer[] = [
  answer(LAB.answerIds.written, '60000000-0000-4000-8000-000000000018', {
    ...commonQuestion, title: 'โจทย์ตัวเลขสังเคราะห์', question_type: 'written',
    question_text: '<p>ข้อมูลสังเคราะห์: 2 + 2 เท่ากับเท่าไร? ลองพิมพ์คำตอบและแนบวิธีทำได้</p>',
    answer_parts: [{ id: 'lab-numeric-part', sub_text: '', unit: '' }],
  }),
  answer(LAB.answerIds.mcq, '60000000-0000-4000-8000-000000000019', {
    ...commonQuestion, title: 'โจทย์ปรนัยสังเคราะห์', question_type: 'mcq',
    question_text: '<p>ข้อมูลสังเคราะห์: เลือกคำตอบของ 1 + 1</p>',
    mcq_options: [{ text: '2', index: 0 }, { text: '3', index: 1 }],
  }),
  answer(LAB.answerIds.file, '60000000-0000-4000-8000-000000000020', {
    ...commonQuestion, title: 'แนบไฟล์สังเคราะห์', question_type: 'file_upload',
    question_text: '<p>ลองแนบภาพหรือ PDF สังเคราะห์ที่ไม่มีข้อมูลบุคคล</p>',
    extra_data: { attachment_urls: [] },
  }),
]

function localHost() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function storedStart(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString() === value ? value : null
}

/** Browser-only exercise, not an Auth/native/DB simulator. The external QA
 * harness must intercept the exact closed API/resource URLs before Start.
 * Without interception the unchanged server must refuse this synthetic scope.
 */
export function SebWaitingClientLab() {
  const [running, setRunning] = useState(false)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [mountVersion, setMountVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirm, confirmation] = useConfirm()

  function start() {
    if (!localHost()) {
      setError('เริ่มได้เฉพาะ localhost หรือ 127.0.0.1 เท่านั้น ไม่เปิดหน้าสอบจำลองบนเว็บที่ deploy')
      return
    }
    try {
      const existing = sessionStorage.getItem(LAB.startedAtKey)
      if (existing && !storedStart(existing)) {
        setError('เวลาจำลองในแท็บนี้ไม่ถูกต้อง กรุณารีเซ็ตข้อมูลจำลองก่อนเริ่ม')
        return
      }
      const clock = startedAt ?? storedStart(existing) ?? new Date().toISOString()
      sessionStorage.setItem(LAB.startedAtKey, clock)
      // This is a same-origin browser history change, not a server route
      // bypass. It MUST happen before Runner and its child effects mount:
      // the real bridge deliberately uses ordinary actions outside /exam.
      window.history.replaceState(null, '', `${LAB.basePath}/take`)
      if (window.location.pathname !== `${LAB.basePath}/take`) {
        setError('ตั้งเส้นทางจำลองไม่สำเร็จ ยังไม่เปิดหน้าสอบ')
        return
      }
      setStartedAt(clock)
      setError(null)
      setRunning(true)
    } catch {
      setError('เก็บเวลาหรือเปิดเส้นทางจำลองไม่สำเร็จ กรุณาใช้โปรไฟล์เบราว์เซอร์ทดสอบใหม่')
    }
  }

  function remount() {
    if (!localHost() || window.location.pathname !== `${LAB.basePath}/take`) {
      setError('เส้นทางจำลองเปลี่ยนแล้ว กรุณาเปิดห้องทดลองใน localhost ใหม่')
      return
    }
    // Preserve the exact synthetic attempt and clock; pending answer backups
    // restore through the real autosave hook. No server resume is fabricated.
    setMountVersion(version => version + 1)
  }

  async function reset() {
    if (!localHost()) {
      setError('รีเซ็ตได้เฉพาะข้อมูลจำลองบน localhost หรือ 127.0.0.1')
      return
    }
    if (!await confirm({
      title: 'รีเซ็ตข้อมูลจำลองในแท็บนี้?',
      description: 'เวลาจำลองและคำตอบค้างของรอบจำลองนี้จะถูกล้าง กระดาษทดในเครื่องและข้อมูลบนเซิร์ฟเวอร์ไม่ถูกแก้ไข',
      confirmLabel: 'ล้างข้อมูลจำลอง', variant: 'destructive',
    })) return
    try {
      sessionStorage.removeItem(LAB.startedAtKey)
      localStorage.removeItem(`korkru_exam_${LAB.submissionId}`)
      setRunning(false)
      setStartedAt(null)
      setMountVersion(version => version + 1)
      setError(null)
      // Keep canonical history while outstanding child requests finish so
      // they cannot fall back to ordinary Server Actions on the lab pathname.
    } catch {
      setError('ล้างข้อมูลจำลองไม่สำเร็จ กรุณาใช้โปรไฟล์เบราว์เซอร์ทดสอบใหม่')
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-background p-3 sm:p-6"
      data-seb-client-lab="synthetic-only" data-submission-id={LAB.submissionId}
      data-base-path={LAB.basePath} data-started-at={startedAt ?? ''}>
      <Card padding="md" className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">UI QA · หน้าสอบ SEB จำลองในเครื่อง</h1>
        <p className="text-sm text-muted-foreground">
          ใช้หน้าสอบและ client bridge จริงกับข้อมูลสังเคราะห์เท่านั้น ต้องติดตั้งการดักคำขอในเบราว์เซอร์ก่อนเริ่ม
          ไม่มีการยืนยัน Auth/SEB ไม่มีรอบสอบจริง ไม่มี native key หรือทางออก native และไม่ใช่ผลผ่าน W7
        </p>
        <p className="text-sm text-muted-foreground">
          ถ้าไม่ดักคำขอ เซิร์ฟเวอร์จริงต้องปฏิเสธ การโหลดหน้า canonical ใหม่ต้องถูกดักด้วย หรือกลับมาเปิดห้องทดลองนี้
          แล้วกดเริ่มอีกครั้งเพื่อใช้เวลาเดิม คำตอบที่ซิงก์แล้วไม่ได้ถูกจำลองว่าโหลดกลับจากเซิร์ฟเวอร์
        </p>
        <dl className="grid min-w-0 gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt>Submission สังเคราะห์</dt><dd className="break-all font-mono">{LAB.submissionId}</dd>
          <dt>เวลาเริ่มเดิม</dt><dd className="break-all font-mono">{startedAt ?? 'ยังไม่เริ่ม · ไม่จับเวลา'}</dd>
          <dt>เวลาจำลอง</dt><dd>{LAB.durationMinutes} นาที · รหัสและเวลาไม่เปลี่ยนเมื่อเมานต์ใหม่</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          {!running && <Button type="button" onClick={start}>เริ่มจำลองในเครื่อง</Button>}
          {running && <Button type="button" variant="outline" onClick={remount}>เมานต์หน้าสอบเดิมใหม่</Button>}
          <Button type="button" variant="outline" onClick={() => { void reset() }}>รีเซ็ตข้อมูลจำลอง</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </Card>
      {running && startedAt && (
        <WaitingExamRunner key={mountVersion} basePath={LAB.basePath} csrf={SYNTHETIC_CSRF}
          submissionId={LAB.submissionId} storageOwnerId={LAB.ownerId} answers={ANSWERS}
          initialWorkArtifacts={[]} durationMinutes={LAB.durationMinutes} startedAt={startedAt}
          sections={[]} questionsPerPage={1} previewMode={false}
          config={{ proctoringEnabled: false, isFullscreenEnforced: false, blockClipboard: false,
            watermarkText: 'UI QA · ข้อมูลสังเคราะห์ · ไม่ใช่รอบสอบจริง', isWorkImageEnforced: false,
            instantCheck: false, instantCheckAnswerKey: false, calculatorEnabled: false, scratchpadEnabled: true }} />
      )}
      {confirmation}
    </main>
  )
}

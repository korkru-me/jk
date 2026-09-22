import { notFound } from 'next/navigation'
import { SebLaunchGate } from '@/components/exam/seb-launch-gate'
import { SebSystemCheck } from '@/components/exam/seb-system-check'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const metadata = { title: 'ห้องทดลองทางเข้า SEB — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Synthetic local/Staging-only workbench for the normal-browser and
 * incomplete-configuration states. It has no assignment, attempt, timer or
 * database fixture behind it. Native CK/BEK verification still belongs to
 * the isolated Staging flow and physical-device evidence.
 */
export default async function SebEntranceLabPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; configured?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()

  const params = await searchParams
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) === 'launch'
    ? 'launch'
    : 'check'
  const configured = (Array.isArray(params.configured) ? params.configured[0] : params.configured) !== '0'

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto mb-5 flex w-full max-w-2xl flex-wrap gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">SEB QA · ข้อมูลสมมติ</span>
        <span>ไม่สร้าง attempt และไม่เริ่มจับเวลา</span>
      </div>
      {view === 'launch' ? (
        <SebLaunchGate
          assignmentId="qa-seb-assignment"
          challenge="qa-seb-challenge"
          configUrl={null}
          configured={configured}
        />
      ) : (
        <SebSystemCheck
          assignmentId="qa-seb-assignment"
          assignmentTitle="ชุดทดลองทางเข้า Safe Exam Browser"
          challenge="qa-seb-challenge"
          configUrl={null}
          configured={configured}
        />
      )}
    </main>
  )
}

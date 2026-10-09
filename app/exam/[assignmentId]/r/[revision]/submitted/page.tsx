import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { readWaitingCompletion } from '@/lib/seb-exam-completion.server'
import { sebExamBasePath } from '@/lib/seb-exam-transport-policy'
import { buttonVariants } from '@/components/ui/button'
import type { SebWaitingRouteParams } from '@/lib/seb-waiting.server'

export const dynamic = 'force-dynamic'
export default async function SubmittedPage({ params }: { params: Promise<SebWaitingRouteParams> }) {
  const scope = await params
  const completed = await readWaitingCompletion(scope)
  if (!completed) {
    if (!Number.isInteger(Number(scope.revision))) notFound()
    redirect(`${sebExamBasePath({ assignmentId: scope.assignmentId, revision: Number(scope.revision) })}/waiting`)
  }
  const base = sebExamBasePath(completed.context)
  const terminalHint = (await cookies()).get('korkru-seb-completion-ready')?.value === completed.context.contextId
  return <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border bg-card p-6">
    <h1 className="text-2xl font-semibold text-success">ส่งข้อสอบสำเร็จแล้ว</h1>
    <p>เซิร์ฟเวอร์บันทึกการส่งข้อสอบเรียบร้อยแล้ว ไม่มีการเปิดเฉลยในห้องสอบนี้</p>
    <a href={`${base}/${terminalHint ? 'quit' : 'completion'}`} className={buttonVariants()}>{terminalHint ? 'ยืนยันออกจาก SEB' : 'ออกจาก SEB หลังส่งข้อสอบ'}</a>
    <p className="text-sm text-muted-foreground">หากออกไม่ได้ ให้ติดต่อครูเพื่อใช้รหัสออกฉุกเฉิน</p>
  </section>
}

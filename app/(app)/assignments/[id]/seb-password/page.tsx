import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { getSebPasswordSettings } from '@/lib/seb-password-repository'
import { SebPasswordError } from '@/lib/seb-password-policy'
import { Card } from '@/components/ui/card'
import { SebPasswordForm } from '@/components/exam/seb-password-form'

export const metadata = { title: 'ร่างรหัสออก SEB — KorKru' }
export const dynamic = 'force-dynamic'

export default async function SebPasswordPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getAuthUser()) redirect('/login')
  const { id } = await params
  let settings: Awaited<ReturnType<typeof getSebPasswordSettings>>
  try {
    settings = await getSebPasswordSettings(id)
  } catch (error) {
    if (error instanceof SebPasswordError && error.code === 'SEB_PASSWORD_AUTH_REQUIRED') redirect('/login')
    const denied = error instanceof SebPasswordError && ['SEB_PASSWORD_ACCESS_DENIED', 'SEB_PASSWORD_CONTEXT_INVALID'].includes(error.code)
    return <Card padding="xl" className="space-y-3">
      <h1 className="text-xl font-semibold">{denied ? 'ไม่สามารถจัดการรหัสข้อสอบนี้ได้' : 'โหลดการตั้งค่าไม่สำเร็จ'}</h1>
      <p>{denied ? 'เฉพาะครูเจ้าของข้อสอบออนไลน์ที่บังคับ SEB เท่านั้น กรุณากลับไปเลือกข้อสอบของคุณ' : 'กรุณาลองโหลดหน้านี้ใหม่ หากยังไม่สำเร็จให้ติดต่อผู้ดูแลระบบ'}</p>
      <Link href="/assignments" className="text-primary underline">กลับไปงานและข้อสอบ</Link>
    </Card>
  }
  return <div className="max-w-2xl space-y-5">
    <Link href={`/assignments/${id}`} className="text-sm text-primary underline">กลับไปข้อสอบ</Link>
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">ร่างรหัสออก SEB</h1>
      <p className="text-muted-foreground">{settings.title}</p>
    </div>
    <Card padding="xl" className="space-y-2 border-warning/50">
      <h2 className="font-semibold">ยังไม่ใช้กับการสอบจริง</h2>
      <p className="text-sm">หน้านี้เตรียมรหัสแยกให้ข้อสอบของครูเจ้าของ ยังไม่ได้เชื่อม SEB Server เพื่อสร้างไฟล์สอบที่ใช้รหัสนี้
        และยังไม่มีการออกจาก SEB อัตโนมัติหลังส่งงาน</p>
      <p className="text-sm">การบันทึกหรือลบร่างไม่เปลี่ยนไฟล์ที่แจกไปแล้ว และไม่เปลี่ยนรหัสของนักเรียนที่กำลังสอบ</p>
    </Card>
    {settings.view.kind === 'available'
      ? <SebPasswordForm key={JSON.stringify(settings.view.summary)} assignmentId={id} initialSummary={settings.view.summary} />
      : <Card padding="xl" className="space-y-2">
          <h2 className="font-semibold">ยังบันทึกร่างรหัสไม่ได้</h2>
          <p className="text-sm" role="status">{settings.view.reason}</p>
        </Card>}
  </div>
}

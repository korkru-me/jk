import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { LearningStandard } from '@/lib/types'
import { IocStandardsClient, type StandardRow } from '../_components/ioc-standards-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'คลังตัวชี้วัด — KorKru' }

export default async function IocStandardsPage() {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('users').select('role').eq('id', authUser.id).maybeSingle()
  if (!profile) redirect('/dashboard')
  if (profile.role !== 'teacher' && profile.role !== 'admin') redirect('/dashboard')

  const [{ data: standardRows }, { data: linkRows }] = await Promise.all([
    supabase
      .from('learning_standards')
      .select('id, org_id, created_by, code, description, subject, grade_level, created_at, updated_at')
      .order('code'),
    supabase.from('question_standards').select('standard_id'),
  ])

  const standards = (standardRows ?? []) as LearningStandard[]
  const usage = new Map<string, number>()
  for (const link of linkRows ?? []) {
    const id = link.standard_id as string
    usage.set(id, (usage.get(id) ?? 0) + 1)
  }

  const rows: StandardRow[] = standards.map(standard => ({
    id: standard.id,
    code: standard.code,
    description: standard.description,
    questionCount: usage.get(standard.id) ?? 0,
    mine: standard.created_by === authUser.id,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">วิจัยการศึกษา › ฟอร์ม IOC</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">คลังตัวชี้วัดของโรงเรียน</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            ตัวชี้วัดที่เคยผูกไว้กับโจทย์ในคลัง ใช้เติมให้ฟอร์ม IOC ครั้งถัดไปโดยอัตโนมัติ
            ทุกคนในโรงเรียนเห็นรายการนี้ แต่แก้ได้เฉพาะแถวที่ตัวเองเพิ่ม
          </p>
        </div>
        <Button variant="outline" render={<Link href="/research/ioc" />}>กลับรายการฟอร์ม</Button>
      </div>

      {rows.length === 0 ? (
        <Card padding="2xl" edge="dashed" className="text-center">
          <h2 className="text-lg font-semibold text-foreground">ยังไม่มีตัวชี้วัดในคลัง</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            คลังนี้เติมขึ้นเองเมื่อคุณจับคู่ตัวชี้วัดกับข้อสอบในฟอร์ม IOC แล้วบันทึกโดยเปิดสวิตช์
            “จำตัวชี้วัดไว้กับโจทย์ในคลัง”
          </p>
          <Button className="mt-4" render={<Link href="/research/ioc" />}>ไปที่ฟอร์ม IOC</Button>
        </Card>
      ) : (
        <IocStandardsClient rows={rows} />
      )}
    </div>
  )
}

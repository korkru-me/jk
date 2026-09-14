import { ClipboardCheck, FileText, LockKeyhole, PenLine } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { formatIocIndex } from '@/lib/ioc'
import type { IocForm, IocFormStatus } from '@/lib/types'
import { IocFormDeleteButton } from './_components/ioc-form-delete-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ฟอร์ม IOC — KorKru' }

type IocFormRow = Pick<
  IocForm,
  'id' | 'exam_title' | 'subject_name' | 'subject_code' | 'grade_level' | 'status' | 'threshold' | 'items_frozen_at' | 'created_at'
> & { ioc_form_experts: { status: string }[] | null }

const STATUS_LABEL: Record<IocFormStatus, string> = {
  draft: 'ฉบับร่าง',
  collecting: 'กำลังเก็บผลประเมิน',
  closed: 'ปิดแล้ว',
}

const STATUS_STYLE: Record<IocFormStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  collecting: 'bg-warning/10 text-warning',
  closed: 'bg-success/10 text-success',
}

export default async function IocFormsPage() {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const supabase = await createClient()
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()

  if (profileError || !profile) return <IocLoadError />
  if (profile.role !== 'teacher' && profile.role !== 'admin') redirect('/dashboard')

  const { data, error } = await supabase
    .from('ioc_forms')
    .select('id, exam_title, subject_name, subject_code, grade_level, status, threshold, items_frozen_at, created_at, ioc_form_experts(status)')
    .order('created_at', { ascending: false })

  if (error) return <IocLoadError />

  const forms = (data ?? []) as IocFormRow[]
  const draftCount = forms.filter(form => form.status === 'draft').length
  const collectingCount = forms.filter(form => form.status === 'collecting').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">ฟอร์ม IOC</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            หาค่าความสอดคล้องระหว่างมาตรฐานตัวชี้วัดกับแบบทดสอบ เว็บดึงข้อสอบมาทำฟอร์มให้
            ส่งลิงก์ให้ผู้ทรงคุณวุฒิกรอก แล้วคำนวณดัชนีความสอดคล้องกับตารางสรุปให้อัตโนมัติ
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" render={<Link href="/research/ioc/standards" />}>คลังตัวชี้วัด</Button>
          <Button render={<Link href="/research/ioc/new" />}>สร้างฟอร์ม IOC</Button>
        </div>
      </div>

      <Card padding="md" className="border-primary/20 bg-primary/5">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">ลิงก์ผู้ทรงคุณวุฒิมีข้อสอบฉบับเต็ม</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ส่งให้เฉพาะผู้ที่ประเมิน ลิงก์มีวันหมดอายุและเพิกถอนได้ทุกเมื่อ
              เฉลยไม่ถูกส่งไปกับฟอร์ม เว้นแต่คุณเปิดสวิตช์ไว้เอง
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard icon={FileText} label="ฟอร์มทั้งหมด" value={forms.length} />
        <SummaryCard icon={PenLine} label="ฉบับร่าง" value={draftCount} />
        <SummaryCard icon={ClipboardCheck} label="กำลังเก็บผลประเมิน" value={collectingCount} />
      </div>

      {forms.length === 0 ? (
        <Card padding="2xl" edge="dashed" className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardCheck className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">ยังไม่มีฟอร์ม IOC</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            เริ่มจากกรอกหัวเอกสาร แล้วเลือกข้อสอบที่จะให้ผู้ทรงคุณวุฒิประเมิน
            จะเป็นข้อสอบของโครงการวิจัยหรือข้อสอบประจำภาคก็ได้
          </p>
          <Button className="mt-4" render={<Link href="/research/ioc/new" />}>สร้างฟอร์มแรก</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {forms.map(form => (
            <Card key={form.id} padding="lg" className="transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 flex-1 font-semibold text-foreground">{form.exam_title}</h2>
                <span className={cn('shrink-0 rounded-full px-2 py-1 text-xs font-medium', STATUS_STYLE[form.status])}>
                  {STATUS_LABEL[form.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {form.subject_name ? <span>{form.subject_name}</span> : null}
                {form.subject_code ? <span>รหัสวิชา {form.subject_code}</span> : null}
                {form.grade_level ? <span>ชั้น{form.grade_level}</span> : null}
                <span>เกณฑ์ {formatIocIndex(form.threshold)}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" render={<Link href={`/research/ioc/${form.id}`} />}>
                  {form.status === 'draft' ? 'ทำต่อ' : 'เปิดฟอร์ม'}
                </Button>
                {(form.ioc_form_experts ?? []).every(expert => expert.status !== 'submitted') ? (
                  <IocFormDeleteButton formId={form.id} examTitle={form.exam_title} />
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: number
}) {
  return (
    <Card padding="lg">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function IocLoadError() {
  return (
    <Card padding="2xl" className="text-center">
      <h1 className="text-lg font-semibold text-foreground">โหลดฟอร์ม IOC ไม่สำเร็จ</h1>
      <p className="mt-1 text-sm text-muted-foreground">กรุณาลองใหม่อีกครั้ง หรือกลับไปหน้าวิจัยการศึกษา</p>
      <Button className="mt-4" variant="outline" render={<Link href="/research" />}>กลับหน้าวิจัยการศึกษา</Button>
    </Card>
  )
}

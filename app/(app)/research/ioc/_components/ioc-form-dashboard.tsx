'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  extendIocExpertLink,
  reissueIocExpertLink,
  reopenIocExpertSubmission,
  revokeIocExpertLink,
  type IssuedIocLink,
} from '@/lib/actions/ioc-links'
import { IOC_DEFAULT_LINK_DAYS, iocLinkDaysLeft, iocLinkPath } from '@/lib/ioc-token'
import type { IocExpertStatus } from '@/lib/types'

export interface DashboardExpert {
  id: string
  expert_order: number
  display_name: string
  position_title: string
  status: IocExpertStatus
  first_opened_at: string | null
  last_opened_at: string | null
  submitted_at: string | null
  token_expires_at: string | null
  revoked_at: string | null
  rated_count: number
}

const STATUS_TEXT: Record<IocExpertStatus, string> = {
  invited: 'ยังไม่เปิดลิงก์',
  opened: 'เปิดอ่านแล้ว ยังไม่ส่ง',
  submitted: 'ส่งผลแล้ว',
}

function formatMoment(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export function IocFormDashboard({
  formId,
  examTitle,
  authorName,
  itemCount,
  experts,
  freshLinks,
}: {
  formId: string
  examTitle: string
  authorName: string
  itemCount: number
  experts: DashboardExpert[]
  /** Links issued in this browser session, which exist nowhere else. */
  freshLinks: IssuedIocLink[]
}) {
  const [links, setLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries(freshLinks.map(link => [link.expert_id, link.token])),
  )

  const submitted = experts.filter(expert => expert.status === 'submitted').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="ส่งผลแล้ว" value={`${submitted} จาก ${experts.length} ท่าน`} />
        <StatCard label="ข้อที่ให้ประเมิน" value={`${itemCount} ข้อ`} />
        <StatCard
          label="ผลสรุป"
          value={submitted === experts.length && submitted > 0 ? 'ครบทุกท่านแล้ว' : 'ยังไม่ครบ'}
          hint={submitted === experts.length && submitted > 0 ? undefined : 'ตัวเลขที่ได้ตอนนี้เป็นผลชั่วคราว'}
        />
      </div>

      {experts.map(expert => (
        <ExpertCard
          key={expert.id}
          formId={formId}
          examTitle={examTitle}
          authorName={authorName}
          itemCount={itemCount}
          expert={expert}
          token={links[expert.id] ?? null}
          onNewToken={(expertId, token) => setLinks(current => ({ ...current, [expertId]: token }))}
        />
      ))}

      <Card padding="md" className="border-primary/20 bg-primary/5">
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold">เว็บไม่ได้ส่งอีเมลหรือข้อความให้เอง</span>{' '}
          คุณเป็นผู้ส่งลิงก์ด้วยช่องทางของคุณ · ลิงก์จะปรากฏเพียงครั้งเดียวตอนออกลิงก์
          เพราะระบบเก็บไว้เฉพาะค่าที่เข้ารหัสแล้ว ถ้าปิดหน้าไปก่อนคัดลอก ให้กด “ออกลิงก์ใหม่” ซึ่งจะยกเลิกลิงก์เดิมด้วย
        </p>
      </Card>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="lg">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

function ExpertCard({
  formId,
  examTitle,
  authorName,
  itemCount,
  expert,
  token,
  onNewToken,
}: {
  formId: string
  examTitle: string
  authorName: string
  itemCount: number
  expert: DashboardExpert
  token: string | null
  onNewToken: (expertId: string, token: string) => void
}) {
  const [confirm, confirmDialog] = useConfirm()
  const [pending, startTransition] = useTransition()
  const daysLeft = iocLinkDaysLeft(expert.token_expires_at)
  const linkDead = Boolean(expert.revoked_at) || daysLeft === 0 || !expert.token_expires_at
  const url = token ? `${typeof window === 'undefined' ? '' : window.location.origin}${iocLinkPath(token)}` : null

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(done)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง')
    }
  }

  function reissue() {
    startTransition(async () => {
      const result = await reissueIocExpertLink({ form_id: formId, expert_id: expert.id })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if ('link' in result && result.link) {
        onNewToken(expert.id, result.link.token)
        toast.success('ออกลิงก์ใหม่แล้ว · ลิงก์เดิมใช้ไม่ได้อีก')
      }
    })
  }

  async function revoke() {
    const ok = await confirm({
      title: `เพิกถอนลิงก์ของ ${expert.display_name}?`,
      description: 'ท่านนี้จะเปิดลิงก์เดิมไม่ได้อีก คำตอบที่ประเมินไว้แล้วยังอยู่ครบ ออกลิงก์ใหม่ให้ภายหลังได้',
      confirmLabel: 'เพิกถอนลิงก์',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await revokeIocExpertLink({ form_id: formId, expert_id: expert.id })
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success('เพิกถอนลิงก์แล้ว')
    })
  }

  function extend() {
    startTransition(async () => {
      const result = await extendIocExpertLink({
        form_id: formId,
        expert_id: expert.id,
        expires_in_days: IOC_DEFAULT_LINK_DAYS,
      })
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success(`ต่ออายุลิงก์อีก ${IOC_DEFAULT_LINK_DAYS} วันแล้ว`)
    })
  }

  async function reopen() {
    const ok = await confirm({
      title: `เปิดให้ ${expert.display_name} แก้ใหม่?`,
      description: 'ท่านนี้จะกลับมาแก้คำตอบและส่งใหม่ได้ ผลสรุปจะเปลี่ยนตามคำตอบล่าสุด และการเปิดครั้งนี้ถูกบันทึกไว้ในประวัติของฟอร์ม',
      confirmLabel: 'เปิดให้แก้ใหม่',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await reopenIocExpertSubmission({ form_id: formId, expert_id: expert.id })
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success('เปิดให้แก้ใหม่แล้ว')
    })
  }

  const message = url
    ? `เรียน ${expert.display_name}\n\n`
      + `ขอความอนุเคราะห์ท่านประเมินความสอดคล้องของ${examTitle} จำนวน ${itemCount} ข้อ ผ่านลิงก์นี้ `
      + 'ไม่ต้องสมัครบัญชี และบันทึกค้างไว้ทำต่อได้\n\n'
      + `${url}\n\n`
      + (expert.token_expires_at
        ? `ลิงก์ใช้ได้ถึง ${new Date(expert.token_expires_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}\n`
        : '')
      + `ขอบพระคุณอย่างสูง\n${authorName}`
    : null

  return (
    <Card
      padding="lg"
      className={cn('space-y-3', expert.status === 'submitted' ? '' : 'border-warning/30 bg-warning/5')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{expert.display_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ผู้ประเมินคนที่ {expert.expert_order}
            {expert.position_title ? ` · ${expert.position_title}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-1 text-xs font-medium',
            expert.status === 'submitted' ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning',
          )}
        >
          {expert.revoked_at ? 'ลิงก์ถูกเพิกถอน' : STATUS_TEXT[expert.status]}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>เปิดอ่านครั้งแรก {formatMoment(expert.first_opened_at)}</span>
        <span>ส่งผล {formatMoment(expert.submitted_at)}</span>
        <span>ประเมินแล้ว {expert.rated_count} จาก {itemCount} ข้อ</span>
        {expert.token_expires_at && !expert.revoked_at ? (
          <span>ลิงก์เหลือ {daysLeft} วัน</span>
        ) : null}
      </div>

      {url ? (
        <div className="space-y-2 rounded-xl border bg-muted p-3">
          <p className="text-xs font-bold text-foreground">ลิงก์นี้แสดงครั้งเดียว คัดลอกไว้ก่อนปิดหน้า</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copy(url, 'คัดลอกลิงก์แล้ว')}>คัดลอกลิงก์</Button>
            {message ? (
              <Button size="sm" variant="outline" onClick={() => copy(message, 'คัดลอกข้อความแล้ว')}>
                คัดลอกข้อความพร้อมส่ง
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={reissue}>
          {token ? 'ออกลิงก์ใหม่อีกครั้ง' : 'ออกลิงก์ใหม่'}
        </Button>
        {!linkDead ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={extend}>ต่ออายุลิงก์</Button>
        ) : null}
        {!linkDead ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={revoke}>เพิกถอนลิงก์</Button>
        ) : null}
        {expert.status === 'submitted' ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={reopen}>เปิดให้แก้ใหม่</Button>
        ) : null}
      </div>
      {confirmDialog}
    </Card>
  )
}

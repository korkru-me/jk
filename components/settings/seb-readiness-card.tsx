import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  ServerCog,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SebReadiness } from '@/lib/seb'

type CheckStatus = 'ready' | 'warning' | 'blocked'

function ReadinessRow({ status, title, description }: {
  status: CheckStatus
  title: string
  description: string
}) {
  const Icon = status === 'ready'
    ? CheckCircle2
    : status === 'warning'
      ? AlertTriangle
      : CircleX
  const color = status === 'ready'
    ? 'text-success'
    : status === 'warning'
      ? 'text-warning'
      : 'text-destructive'

  return (
    <div className="flex gap-3 border-b py-3 last:border-0">
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', color)} />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function SebReadinessCard({
  readiness,
  schemaReady,
}: {
  readiness: SebReadiness
  schemaReady: boolean
}) {
  const ready = readiness.publishReady && schemaReady
  const configFileDescription = readiness.configFileStatus === 'ready'
    ? 'มีลิงก์ HTTPS ไปยังไฟล์ .seb ที่เข้ารหัสแล้ว'
    : readiness.configFileStatus === 'manual'
      ? 'ไม่ได้ตั้งลิงก์ไฟล์ .seb — ใช้งานได้ถ้าครูแจกไฟล์ให้นักเรียนเอง'
      : 'ลิงก์ไฟล์ตั้งค่าไม่ถูกต้อง ควรเป็น HTTPS และลงท้ายด้วย .seb'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b bg-muted/20 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className={cn(
            'rounded-xl p-2.5',
            ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
          )}>
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">ความพร้อม Safe Exam Browser</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              แสดงเฉพาะสถานะ ไม่แสดง secret, Config Key หรือ Browser Exam Key
            </p>
          </div>
        </div>
        <span className={cn(
          'w-fit rounded-full px-3 py-1 text-xs font-semibold',
          ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
        )}>
          {ready ? 'พร้อมเผยแพร่ข้อสอบ SEB' : 'ยังไม่พร้อมเผยแพร่'}
        </span>
      </div>

      <div className="px-5 sm:px-6">
        <ReadinessRow
          status={schemaReady ? 'ready' : 'blocked'}
          title="โครงสร้างฐานข้อมูล"
          description={schemaReady
            ? 'พบฟิลด์ secure_browser_mode และ schema เฟส SEB แล้ว'
            : 'ยังไม่พบ schema ที่ต้องใช้ — apply migration 20260830062722_add_seb_secure_exam_mode.sql ก่อน deploy'}
        />
        <ReadinessRow
          status={readiness.siteUrlReady ? 'ready' : 'blocked'}
          title="Production URL"
          description={readiness.siteUrlReady
            ? 'NEXT_PUBLIC_SITE_URL เป็น origin ที่ถูกต้องและใช้ HTTPS ใน production'
            : 'ตั้ง NEXT_PUBLIC_SITE_URL เป็น origin ของเว็บจริง เช่น https://exam.school.ac.th โดยไม่มี path'}
        />
        <ReadinessRow
          status={readiness.sessionSecretReady ? 'ready' : 'blocked'}
          title="Session signing secret"
          description={readiness.sessionSecretReady
            ? 'SEB_SESSION_SECRET มีความยาวเพียงพอ'
            : 'ตั้ง SEB_SESSION_SECRET ใน secret manager อย่างน้อย 32 ตัวอักษร'}
        />
        <ReadinessRow
          status={readiness.configKeyReady ? 'ready' : 'blocked'}
          title="Config Key (CK)"
          description={readiness.configKeyReady
            ? 'พบ CK รูปแบบ SHA-256 ที่ฝั่งเซิร์ฟเวอร์'
            : 'SEB_CONFIG_KEY ต้องเป็นเลขฐานสิบหก 64 ตัวจากไฟล์ .seb ที่บันทึกล่าสุด'}
        />
        <ReadinessRow
          status={readiness.browserExamKeyCount > 0 ? 'ready' : 'blocked'}
          title="Browser Exam Keys (BEK)"
          description={readiness.browserExamKeyCount > 0
            ? `พบ BEK ที่ไม่ซ้ำกัน ${readiness.browserExamKeyCount} ค่า — ตรวจว่าครบทุก OS/รุ่นที่โรงเรียนอนุญาต`
            : 'ยังไม่พบ BEK ที่ถูกต้อง ต้องเพิ่มอย่างน้อยหนึ่งค่าใน SEB_BROWSER_EXAM_KEYS'}
        />
        <ReadinessRow
          status={readiness.configFileStatus === 'ready' ? 'ready' : 'warning'}
          title="การแจกไฟล์ตั้งค่า .seb"
          description={configFileDescription}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t bg-muted/10 px-5 py-4 sm:px-6">
        <a
          href="https://safeexambrowser.org/download_en.html"
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          ดาวน์โหลด SEB <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Link
          href="/assignments"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          <ServerCog className="h-3.5 w-3.5" /> ไปยังชุดข้อสอบ
        </Link>
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
          <KeyRound className="h-3.5 w-3.5" /> เปลี่ยนไฟล์ .seb ต้องอัปเดต CK/BEK ทุกครั้ง
        </span>
      </div>
    </Card>
  )
}

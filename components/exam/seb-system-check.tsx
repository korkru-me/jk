'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Laptop,
  Loader2,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react'
import { verifySafeExamBrowser } from '@/lib/actions/seb'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SebPlatform } from '@/lib/seb'

interface Props {
  assignmentId: string
  assignmentTitle: string
  challenge: string
  configured: boolean
  configUrl: string | null
}

type CheckState = 'outside' | 'verifying' | 'passed' | 'error'

function platformLabel(platform: SebPlatform | null) {
  if (platform === 'windows') return 'Windows'
  if (platform === 'macos') return 'macOS'
  if (platform === 'ios') return 'iPhone / iPad'
  return 'ยังไม่ทราบ'
}

function CheckRow({ state, title, description }: {
  state: 'pending' | 'checking' | 'passed' | 'failed'
  title: string
  description: string
}) {
  const icon = state === 'checking'
    ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
    : state === 'passed'
      ? <CheckCircle2 className="h-5 w-5 text-success" />
      : state === 'failed'
        ? <AlertTriangle className="h-5 w-5 text-destructive" />
        : <Circle className="h-5 w-5 text-muted-foreground/40" />

  return (
    <div className="flex gap-3 border-b py-3 last:border-0">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function SebSystemCheck({
  assignmentId,
  assignmentTitle,
  challenge,
  configured,
  configUrl,
}: Props) {
  const attempted = useRef(false)
  const [state, setState] = useState<CheckState>('outside')
  const [error, setError] = useState<string | null>(null)
  const [platform, setPlatform] = useState<SebPlatform | null>(null)
  const [validUntil, setValidUntil] = useState<string | null>(null)

  useEffect(() => {
    if (attempted.current || !configured || !challenge) return
    attempted.current = true
    const seb = window.SafeExamBrowser
    if (!seb?.security) return

    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    setState('verifying')

    const verify = async () => {
      if (cancelled) return
      const security = seb.security
      const configKeyHash = security?.configKey
      const browserExamKeyHash = security?.browserExamKey
      if (!configKeyHash || !browserExamKeyHash || !seb.version) {
        setState('error')
        setError('Safe Exam Browser ส่งข้อมูลกุญแจหรือเวอร์ชันมาไม่ครบ กรุณาเปิดไฟล์ .seb ของโรงเรียนใหม่')
        return
      }

      try {
        const result = await verifySafeExamBrowser({
          assignmentId,
          challenge,
          requestUrl: window.location.href,
          configKeyHash,
          browserExamKeyHash,
          version: seb.version,
          purpose: 'system_check',
        })
        if (cancelled) return
        if ('error' in result) {
          setState('error')
          setError(result.error ?? 'ตรวจสอบ Safe Exam Browser ไม่สำเร็จ')
          return
        }
        setPlatform(result.platform)
        setValidUntil(result.validUntil)
        setState('passed')
      } catch {
        if (cancelled) return
        setState('error')
        setError('ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
      }
    }

    if (seb.security.configKey && seb.security.browserExamKey) {
      void verify()
    } else if (typeof seb.security.updateKeys === 'function') {
      timeout = setTimeout(() => void verify(), 4_000)
      try {
        seb.security.updateKeys(() => {
          if (timeout) clearTimeout(timeout)
          void verify()
        })
      } catch {
        if (timeout) clearTimeout(timeout)
        void verify()
      }
    } else {
      void verify()
    }

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [assignmentId, challenge, configured])

  const isSeb = state !== 'outside'
  const verificationState = state === 'verifying'
    ? 'checking'
    : state === 'passed'
      ? 'passed'
      : state === 'error'
        ? 'failed'
        : 'pending'

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4 sm:py-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <LockKeyhole className="h-4 w-4" /> ตรวจความพร้อมก่อนสอบ
        </div>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Safe Exam Browser system check</h1>
        <p className="mt-1 text-sm text-muted-foreground">{assignmentTitle}</p>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Laptop className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-semibold">การตรวจนี้ไม่เริ่มทำข้อสอบและไม่จับเวลา</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              ระบบตรวจเครื่อง โปรแกรม รุ่นของ SEB และกุญแจไฟล์ตั้งค่ากับเซิร์ฟเวอร์จริง
            </p>
          </div>
        </div>

        <div className="mt-5">
          <CheckRow
            state={isSeb ? 'passed' : configured ? 'failed' : 'pending'}
            title="เปิดหน้านี้ใน Safe Exam Browser"
            description="รองรับ Windows, macOS, iPhone และ iPad — ยังไม่รวม Android"
          />
          <CheckRow
            state={verificationState}
            title="JavaScript API และรุ่นของ SEB"
            description="ยืนยันว่าโปรแกรมส่งข้อมูลความปลอดภัยในรูปแบบที่ KorKru รองรับ"
          />
          <CheckRow
            state={verificationState}
            title="Config Key และ Browser Exam Key"
            description="ตรวจว่ากำลังใช้ไฟล์ .seb และรุ่นโปรแกรมที่โรงเรียนอนุญาต"
          />
          <CheckRow
            state={verificationState}
            title="การเชื่อมต่อและ secure session"
            description="ยืนยันตัวตนกับเซิร์ฟเวอร์และสร้าง session สำหรับข้อสอบนี้"
          />
        </div>
      </Card>

      {!configured ? (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p>ฝั่งโรงเรียนยังตั้งค่า SEB ไม่ครบ กรุณาแจ้งครูหรือผู้ดูแลระบบ</p>
        </div>
      ) : state === 'outside' ? (
        <Card className="space-y-4 p-5 text-sm leading-6">
          <p className="font-medium text-foreground">ขณะนี้หน้านี้เปิดอยู่ในเบราว์เซอร์ปกติ</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>ติดตั้ง Safe Exam Browser บนอุปกรณ์ที่จะใช้สอบ</li>
            <li>เปิดไฟล์ .seb ของโรงเรียนและเข้าสู่ระบบ KorKru</li>
            <li>กลับมาที่ชุดข้อสอบนี้ แล้วกด “ตรวจเครื่อง SEB” อีกครั้ง</li>
          </ol>
          {configUrl ? (
            <Button nativeButton={false} render={<a href={configUrl} />}>
              เปิดไฟล์ตั้งค่า .seb <ExternalLink className="h-4 w-4" />
            </Button>
          ) : (
            <p className="rounded-xl border bg-muted/40 p-3 text-muted-foreground">
              โรงเรียนแจกไฟล์ .seb แยกต่างหาก กรุณาขอไฟล์จากครูผู้คุมสอบ
            </p>
          )}
        </Card>
      ) : state === 'verifying' ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> กำลังตรวจสอบกับเซิร์ฟเวอร์…
        </div>
      ) : state === 'passed' ? (
        <div className="space-y-3 rounded-xl border border-success/30 bg-success/10 p-5">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
            <div>
              <p className="font-semibold text-foreground">เครื่องนี้ผ่านการตรวจสอบ</p>
              <p className="mt-1 text-sm text-muted-foreground">ระบบที่ตรวจพบ: {platformLabel(platform)}</p>
              {validUntil && (
                <p className="mt-1 text-sm text-muted-foreground">
                  ระบบบันทึกผลให้ครูตรวจในห้องคุมสอบแล้ว · ใช้ได้ถึง{' '}
                  <time dateTime={validUntil}>
                    {new Intl.DateTimeFormat('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Bangkok',
                    }).format(new Date(validUntil))}
                  </time>
                </p>
              )}
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            ให้ตรวจซ้ำในวันสอบ หากอัปเดต SEB เปลี่ยนอุปกรณ์ หรือโรงเรียนออกไฟล์ตั้งค่าใหม่
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p>{error}</p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4" /> ลองตรวจใหม่
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/assignments" className={cn(buttonVariants({ variant: 'outline' }))}>
          กลับรายการข้อสอบ
        </Link>
        <a
          href="https://safeexambrowser.org/download_en.html"
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'ghost' }))}
        >
          ดาวน์โหลด SEB <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, LockKeyhole } from 'lucide-react'
import { verifySafeExamBrowser } from '@/lib/actions/seb'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

declare global {
  interface Window {
    SafeExamBrowser?: {
      version?: string
      security?: {
        configKey?: string
        browserExamKey?: string
        updateKeys?: (callback: () => void) => void
      }
    }
  }
}

interface Props {
  assignmentId: string
  challenge: string
  configUrl: string | null
  configured: boolean
}

type GateState = 'outside' | 'verifying' | 'verified' | 'error'

export function SebLaunchGate({ assignmentId, challenge, configUrl, configured }: Props) {
  const router = useRouter()
  const attempted = useRef(false)
  const [state, setState] = useState<GateState>('outside')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (attempted.current) return
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
        setError('Safe Exam Browser ยังส่งกุญแจตรวจสอบมาไม่ครบ กรุณาปิดแล้วเปิดไฟล์ตั้งค่าใหม่')
        return
      }

      const result = await verifySafeExamBrowser({
        assignmentId,
        challenge,
        requestUrl: window.location.href,
        configKeyHash,
        browserExamKeyHash,
        version: seb.version,
      })
      if (cancelled) return
      if ('error' in result) {
        setState('error')
        setError(result.error ?? 'ตรวจสอบ Safe Exam Browser ไม่สำเร็จ')
        return
      }

      setState('verified')
      router.replace(`/assignments/${assignmentId}/take`)
      router.refresh()
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
  }, [assignmentId, challenge, router])

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-4 py-10">
      <Card className="w-full space-y-5 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">ข้อสอบนี้ใช้ Safe Exam Browser</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              รองรับ Windows, macOS, iPhone และ iPad ส่วน Android จะเปิดให้ภายหลัง
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p>โรงเรียนยังตั้งค่ากุญแจ SEB ไม่ครบ จึงยังเริ่มสอบไม่ได้ กรุณาแจ้งครูผู้สอน</p>
          </div>
        ) : state === 'verifying' ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            กำลังตรวจสอบการตั้งค่าและเวอร์ชัน Safe Exam Browser…
          </div>
        ) : state === 'verified' ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-success" />
            ยืนยันสำเร็จ กำลังเปิดข้อสอบ…
          </div>
        ) : state === 'error' ? (
          <div className="space-y-3">
            <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <p>{error}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.assign(`/assignments/${assignmentId}/take`)}>
              ขอรหัสตรวจสอบใหม่
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>ติดตั้ง Safe Exam Browser เวอร์ชันล่าสุด</li>
              <li>เปิดไฟล์ตั้งค่าของโรงเรียนด้านล่าง</li>
              <li>เข้าสู่ระบบ KorKru แล้วกลับมาหน้านี้ ระบบจะตรวจสอบให้อัตโนมัติ</li>
            </ol>
            {configUrl ? (
              <Button
                nativeButton={false}
                render={<a href={configUrl} />}
                className="w-full sm:w-auto"
              >
                เปิดด้วย Safe Exam Browser <ExternalLink className="h-4 w-4" />
              </Button>
            ) : (
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-foreground">
                ยังไม่ได้เผยแพร่ไฟล์ตั้งค่า SEB กรุณาขอไฟล์ <span className="font-medium">.seb</span> จากครูผู้คุมสอบ
              </div>
            )}
          </div>
        )}

        <a
          href="https://safeexambrowser.org/download_en.html"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          ดาวน์โหลด Safe Exam Browser <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Card>
    </div>
  )
}

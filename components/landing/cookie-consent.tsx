'use client'

import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'

const STORAGE_KEY = 'korkru_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted')
    } catch {
      // ignore
    }
    setVisible(false)
  }

  function decline() {
    try {
      localStorage.setItem(STORAGE_KEY, 'declined')
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="การยินยอมการใช้คุกกี้"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card px-4 py-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3 flex-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10">
            <Cookie className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              เว็บไซต์นี้ใช้คุกกี้
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              เราใช้คุกกี้เพื่อปรับปรุงประสบการณ์การใช้งาน วิเคราะห์ผู้เข้าชม และแสดงเนื้อหาที่เกี่ยวข้อง
              การใช้งานเว็บไซต์ต่อไปถือว่าคุณยอมรับนโยบายคุกกี้ของเรา{' '}
              <a href="#" className="text-primary hover:underline">
                อ่านเพิ่มเติม
              </a>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={decline} variant="outline" size="lg">
            ปฏิเสธ
          </Button>
          <Button onClick={accept} size="lg" className="font-semibold">
            ยอมรับทั้งหมด
          </Button>
          <IconButton onClick={decline} label="ปิด">
            <X />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

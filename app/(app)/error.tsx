'use client'

import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * The app shell had no error boundary at all, so any client-side exception —
 * a browser API missing on a phone, a failed chunk load on a weak connection —
 * unmounted the whole tree and left the student staring at a blank screen with
 * no way back. This turns that into something a student can read and act on
 * while the attempt is still recoverable.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[korkru] app error boundary', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card padding="2xl" elevation="lg" className="w-full max-w-md text-center">
        <p className="mb-4 text-4xl">⚠️</p>
        <h1 className="mb-2 text-xl font-black text-foreground">หน้านี้โหลดไม่สำเร็จ</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          เกิดข้อผิดพลาดระหว่างแสดงผล คำตอบที่บันทึกไว้แล้วยังอยู่ครบ
          <br />
          ลองโหลดใหม่อีกครั้งได้เลย
        </p>
        <div className="flex flex-col items-center gap-2">
          <Button onClick={reset} size="lg">
            ลองใหม่อีกครั้ง
          </Button>
          <a href="/dashboard" className="text-sm text-primary hover:underline">
            ← กลับหน้าหลัก
          </a>
        </div>
        {error.digest && (
          <p className="mt-5 font-mono text-[10px] text-muted-foreground">
            รหัสข้อผิดพลาด {error.digest}
          </p>
        )}
      </Card>
    </div>
  )
}

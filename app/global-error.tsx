'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import './globals.css'

/**
 * Last-resort boundary for an error thrown above the app shell — it replaces
 * the root layout, so it brings its own <html>/<body>. Without it Next.js
 * renders its bare fallback, which on a phone is indistinguishable from the
 * browser having given up on the page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[korkru] global error boundary', error)
  }, [error])

  return (
    <html lang="th">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md text-center">
          <p className="mb-4 text-4xl">⚠️</p>
          <h1 className="mb-2 text-xl font-black">เปิดหน้านี้ไม่สำเร็จ</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            ระบบขัดข้องชั่วคราว ลองโหลดหน้านี้ใหม่อีกครั้ง
          </p>
          <Button onClick={reset} size="lg" className="mx-auto">
            ลองใหม่อีกครั้ง
          </Button>
          {error.digest && (
            <p className="mt-5 font-mono text-[10px] text-muted-foreground">
              รหัสข้อผิดพลาด {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}

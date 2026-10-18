'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function GradingLoadError({ reset }: { reset: () => void }) {
  return <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3" role="alert">
    <p className="text-sm">โหลดข้อมูลตรวจคะแนนไม่สำเร็จ กรุณาลองอีกครั้ง</p>
    <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={reset}>ลองใหม่</Button>
  </Card>
}

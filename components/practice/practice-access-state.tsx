import Link from 'next/link'
import { LockKeyhole, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

interface PracticeAccessStateProps {
  kind: 'unavailable' | 'unsupported'
  returnHref: string
}

export function PracticeAccessState({ kind, returnHref }: PracticeAccessStateProps) {
  const unsupported = kind === 'unsupported'
  return (
    <Card className="mx-auto w-full max-w-xl">
      <Empty className="min-h-64 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {unsupported ? <LockKeyhole aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
          </EmptyMedia>
          <EmptyTitle>
            {unsupported ? 'โจทย์ข้อนี้ยังใช้ฝึกด้วยตนเองไม่ได้' : 'คลังฝึกยังไม่พร้อมใช้งาน'}
          </EmptyTitle>
          <EmptyDescription>
            {unsupported
              ? 'โจทย์ที่ต้องให้ครูตรวจหรือยังตั้งค่าเฉลยไม่ครบ จะไม่เปิดให้นักเรียนตรวจคำตอบเอง'
              : 'ระบบปิดการเข้าถึงไว้อย่างปลอดภัยชั่วคราว กรุณาลองใหม่ภายหลังหรือติดต่อครูผู้สอน'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" className="min-h-[44px]" render={<Link href={returnHref} />}>
            ย้อนกลับ
          </Button>
        </EmptyContent>
      </Empty>
    </Card>
  )
}

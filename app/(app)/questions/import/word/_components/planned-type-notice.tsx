import Link from 'next/link'
import { Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ImportProfile } from '@/lib/docx-import/profiles'

/**
 * The upload box, for a type that cannot be read yet.
 *
 * It says so plainly and sends the teacher to the form that does work, rather
 * than accepting a file and producing โจทย์ with pieces missing. The format
 * still shown beside it is the point of letting anyone reach this screen at
 * all: a teacher who knows the shape that is coming can write next term's
 * worksheets in it once, instead of reformatting them later.
 */
export function PlannedTypeNotice({
  profile,
  chooserHref,
}: {
  profile: ImportProfile
  chooserHref: string
}) {
  return (
    <Card padding="xl" edge="dashed" className="flex flex-col items-center gap-3 text-center">
      <Construction className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">
          ยังนำเข้าโจทย์{profile.label}จากไฟล์ Word ไม่ได้
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          กำลังทำอยู่ — รูปแบบไฟล์ข้าง ๆ นี้คือสิ่งที่กำลังจะรองรับ จัดไฟล์รอไว้ได้
          <br />
          ระหว่างนี้สร้างโจทย์แบบนี้ในเว็บได้ตามปกติ
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href={profile.createHref}>
          <Button type="button" size="sm">สร้างโจทย์{profile.label}ในเว็บ</Button>
        </Link>
        <Link href={chooserHref}>
          <Button type="button" variant="outline" size="sm">ดูประเภทที่นำเข้าได้แล้ว</Button>
        </Link>
      </div>
    </Card>
  )
}

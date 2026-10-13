import Image from 'next/image'
import Link from 'next/link'
import { BookOpenCheck, ListChecks, LogIn, Search, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RichText } from '@/components/ui/rich-text'
import { Separator } from '@/components/ui/separator'
import type { StudentPracticeLibrary } from '@/lib/practice-question-access.server'

interface PracticeWaitingRoomProps {
  library: StudentPracticeLibrary
  questionCount: number
  enterHref: string
  returnHref?: string
}

export function PracticeWaitingRoom({
  library,
  questionCount,
  enterHref,
  returnHref = '/practice',
}: PracticeWaitingRoomProps) {
  return (
    <Card padding="lg" className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-hidden">
      <Image
        src="/brand/deer-mark.svg"
        alt=""
        aria-hidden="true"
        width={585}
        height={1045}
        loading="eager"
        className="pointer-events-none absolute right-8 top-5 -z-10 hidden h-72 w-auto opacity-5 md:block dark:brightness-0 dark:invert"
      />

      <header className="flex max-w-3xl flex-col gap-1.5 md:pr-52">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-primary">หน้ารอเข้าคลังฝึก</p>
          <Badge variant="secondary">ฝึกเอง · ไม่มีคะแนน</Badge>
        </div>
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          {library.title}
        </h1>
      </header>

      <Separator />

      <section aria-label="ข้อมูลก่อนเข้าคลังฝึก" className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>มีโจทย์ {questionCount.toLocaleString('th-TH')} ข้อ เลือกฝึกข้อใดก่อนก็ได้</span>
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Search className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>ค้นหาด้วยชื่อโจทย์หรือเลือกหลายแท็กพร้อมกันได้</span>
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>ไม่เก็บคำตอบ ผลถูกผิด หรือคะแนน</span>
        </p>
      </section>

      <Card role="status" radius="sm" edge="none" padding="sm" className="bg-muted/60 text-sm font-medium">
        ยังไม่เปิดโจทย์และยังไม่บันทึกความคืบหน้า เมื่อพร้อมแล้วจึงกดเข้าคลังฝึก
      </Card>

      {library.description && (
        <>
          <Separator />
          <section aria-labelledby="practice-waiting-description">
            <Card radius="md" edge="none" padding="md" className="flex flex-col gap-1.5 bg-primary/10">
              <h2 id="practice-waiting-description" className="text-lg font-semibold text-foreground">คำชี้แจง</h2>
              <RichText
                text={library.description}
                blocks
                className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
              />
            </Card>
          </section>
        </>
      )}

      <Separator />

      <section aria-labelledby="practice-waiting-rules" className="flex flex-col gap-2.5">
        <h2 id="practice-waiting-rules" className="text-lg font-semibold">ก่อนเริ่มฝึก</h2>
        <ul className="grid list-disc gap-x-8 gap-y-2 pl-5 text-sm text-muted-foreground md:grid-cols-2">
          <li>เลือกโจทย์จากคลังและกลับมาฝึกซ้ำได้ตามต้องการ</li>
          <li>ระบบนับเฉพาะจำนวนครั้งที่กดตรวจในแต่ละข้อ เพื่อให้ครูเห็นความก้าวหน้า</li>
          <li>การเข้าคลังฝึกไม่สร้างรอบทำงาน ไม่จำกัดเวลา และไม่มีการส่งงาน</li>
          <li>ผลตรวจมีไว้ช่วยฝึกตนเอง ไม่ถูกนำไปคิดคะแนนหรือจัดอันดับ</li>
        </ul>
      </section>

      <footer className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button className="h-auto min-h-11 whitespace-normal py-2" render={<Link href={enterHref} />}>
          <LogIn data-icon="inline-start" aria-hidden="true" />
          เข้าคลังฝึก
        </Button>
        <Link
          href={returnHref}
          className={buttonVariants({ variant: 'outline', className: 'h-auto min-h-11 whitespace-normal py-2' })}
        >
          <BookOpenCheck data-icon="inline-start" aria-hidden="true" />
          กลับไปรายการคลังฝึก
        </Link>
      </footer>
    </Card>
  )
}

import Link from 'next/link'
import { BookOpen, Layers, School } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BRAND_MARK_ASPECT_RATIO, BRAND_MARK_URL } from '@/components/brand-mark-data'
import { thaiHour, THAI_TIME_ZONE } from '@/lib/thai-time'

const GREETINGS = {
  morning: ['สวัสดีตอนเช้า', 'อรุณสวัสดิ์', 'เช้านี้ ยินดีต้อนรับ'],
  afternoon: ['สวัสดีตอนบ่าย', 'บ่ายนี้ ยินดีต้อนรับ', 'ยินดีต้อนรับในบ่ายวันนี้'],
  evening: ['สวัสดีตอนเย็น', 'เย็นนี้ ยินดีต้อนรับ', 'ยินดีต้อนรับในเย็นวันนี้'],
  night: ['สวัสดียามค่ำคืน', 'คืนนี้ ยินดีต้อนรับ', 'ยินดีต้อนรับในค่ำคืนนี้'],
}

interface Props {
  fullName: string
  classroomsCount: number
  studentsCount: number
  questionsCount: number
  setsCount: number
  now?: Date
}

/** Match a classroom card: h-16 cover + min-h-14 body; allow long names to grow. */
export function DashboardWelcome({
  fullName, classroomsCount, studentsCount, questionsCount, setsCount, now = new Date(),
}: Props) {
  const hour = thaiHour(now)
  const period = hour >= 5 && hour < 12 ? 'morning'
    : hour >= 12 && hour < 17 ? 'afternoon'
      : hour >= 17 && hour < 20 ? 'evening' : 'night'
  // Vary the wording by the Thai calendar day, keeping each render stable.
  const day = Number(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: THAI_TIME_ZONE }).format(now))
  const greeting = GREETINGS[period][day % GREETINGS[period].length]
  const count = (value: number) => value.toLocaleString('th-TH')
  const linkClass = 'inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-md whitespace-nowrap text-xs text-foreground/80 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring @min-[30rem]/welcome:text-sm'

  return (
    <Card
      edge="ring"
      className="@container/welcome relative isolate flex min-h-30 flex-col justify-center overflow-hidden bg-linear-to-r from-primary/8 via-card to-primary/5 px-3 py-2 sm:px-4"
      data-dashboard-welcome
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-3 right-3 -z-10 bg-brand-accent/12 sm:right-6"
        style={{
          WebkitMask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
          mask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
          aspectRatio: BRAND_MARK_ASPECT_RATIO,
        }}
        data-dashboard-welcome-mark
      />
      <h1 className="flex flex-wrap items-baseline gap-x-2 text-base leading-snug font-semibold">
        <span>{greeting}</span>
        <span className="min-w-0 break-words text-primary [overflow-wrap:anywhere]">{fullName.trim() || 'คุณครู'}</span>
      </h1>
      <nav aria-label="สรุปข้อมูลของฉัน" className="flex flex-wrap items-center gap-x-2 @min-[30rem]/welcome:gap-x-5">
        <Link href="/classrooms" className={linkClass} aria-label={`${count(classroomsCount)} ห้องเรียน นักเรียนรวม ${count(studentsCount)} คน`}>
          <School aria-hidden="true" className="hidden size-3.5 shrink-0 @min-[16rem]/welcome:block text-tint-1" />
          <span><strong className="font-semibold">{count(classroomsCount)}</strong> ห้องเรียน</span>
          <span className="hidden text-xs text-muted-foreground @min-[30rem]/welcome:inline">· {count(studentsCount)} คน</span>
        </Link>
        <Link href="/questions" className={linkClass} aria-label={`${count(questionsCount)} โจทย์ในคลัง`}>
          <BookOpen aria-hidden="true" className="hidden size-3.5 shrink-0 @min-[16rem]/welcome:block text-tint-3" />
          <span><strong className="font-semibold">{count(questionsCount)}</strong> โจทย์<span className="hidden @min-[30rem]/welcome:inline">ในคลัง</span></span>
        </Link>
        <Link href="/questions/sets" className={linkClass} aria-label={`${count(setsCount)} แฟ้มโจทย์`}>
          <Layers aria-hidden="true" className="hidden size-3.5 shrink-0 @min-[16rem]/welcome:block text-primary" />
          <span><strong className="font-semibold">{count(setsCount)}</strong> แฟ้ม<span className="hidden @min-[30rem]/welcome:inline">โจทย์</span></span>
        </Link>
      </nav>
    </Card>
  )
}

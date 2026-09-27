import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SolutionLock } from '@/lib/solution-release'
import { FinishUnfinishedAttempt } from './attempt-solutions'

const deadlineFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
})

/** What still has to happen, in the order a student can do something about it. */
function openingConditions(lock: SolutionLock): string[] {
  const conditions: string[] = []
  if (lock.attemptLimit != null) {
    conditions.push(`ทำครบ ${lock.attemptLimit} ครั้ง (ตอนนี้ทำไป ${lock.attemptsUsed} ครั้ง)`)
  }
  if (lock.deadline) conditions.push(`พ้นกำหนดส่ง ${deadlineFormat.format(new Date(lock.deadline))}`)
  conditions.push('ครูปิดงาน')
  return conditions
}

/**
 * Why the เฉลยวิธีทำ is not open yet, and when it will be — so a student who
 * finished early is told what to wait for instead of finding no button and
 * wondering whether there is a เฉลย at all.
 *
 * Only shown when the teacher ticked the setting and at least one ข้อ of this
 * attempt has a เฉลย; it says nothing about what the เฉลย contains.
 */
export function SolutionLockNotice({ lock, assignmentId, canResume }: {
  lock: SolutionLock
  assignmentId: string
  /** Whether the unfinished attempt can still be reopened on the take page —
   *  only while the งาน is published. A closed งาน turns students away there,
   *  so they hand the attempt in from here instead. */
  canResume: boolean
}) {
  const unfinished = lock.unfinished

  if (unfinished && !canResume) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <p className="flex max-w-md items-start gap-1.5 text-left">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          ครูปิดงานนี้แล้ว แต่รอบที่ {unfinished.attemptNumber} ของคุณยังไม่ได้ส่ง — ส่งรอบนั้นก่อน จึงจะดูเฉลยวิธีทำได้
        </p>
        <FinishUnfinishedAttempt submissionId={unfinished.id} attemptNumber={unfinished.attemptNumber} />
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <p className="flex max-w-md items-start gap-1.5 text-left">
        <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          เฉลยวิธีทำจะเปิดให้ดูเมื่อ{openingConditions(lock).join(' หรือ')}
          {unfinished && ` · รอบที่ ${unfinished.attemptNumber} ที่ทำค้างอยู่ต้องส่งก่อน`}
        </span>
      </p>
      {unfinished && (
        <Button size="sm" variant="outline" render={<Link href={`/assignments/${assignmentId}/take`} />}>
          กลับไปทำรอบที่ {unfinished.attemptNumber}
        </Button>
      )}
    </div>
  )
}

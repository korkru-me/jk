'use client'

import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, ChevronRight, ClipboardList, Plus, Printer, Sparkles, UserPlus,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClassroomStream } from './classroom-stream'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TYPE_CFG } from '@/lib/assignment-display'
import { SEVERITY_BADGE } from '@/lib/calendar-display'
import { summarizeClassroomProgress, isDueBy, type AssignmentProgress, type ProgressSubmission } from '@/lib/classroom-progress'
import type { ClassroomPost } from '@/lib/types'
import type { HomeroomAssignmentRow } from '@/lib/homeroom-data'
import type { ClassroomAssignmentRow } from './classroom-assignments-tab'

/** The tabs this overview can hand the teacher off to. */
export type OverviewTarget = 'students' | 'assignments' | 'scores' | 'homeroom' | 'invite'

interface OverviewStudent { id: string; full_name: string }

interface Props {
  classroomId: string
  isHomeroom: boolean
  students: OverviewStudent[]
  /** Subject rooms only — every งาน linked here, drafts included. */
  assignments: ClassroomAssignmentRow[]
  /** Homeroom rooms only — งาน the roster has in their subject rooms. */
  homeroomAssignments: HomeroomAssignmentRow[]
  submissions: ProgressSubmission[]
  /** Hand-ins holding at least one answer nobody has scored yet. */
  pendingReviewCount: number
  /** True when the pending-review lookup hit its row cap, so the count is a floor. */
  pendingReviewCapped: boolean
  posts: ClassroomPost[]
  /** Student ids that have seen each announcement, keyed by post id. */
  seenByPost: Record<string, string[]>
  /** Other classrooms the same announcement can be posted to at once. */
  crossPostTargets: { id: string; name: string }[]
  /** A view-only co-teacher gets the announcement board and nothing else. */
  canManage: boolean
  onNavigate: (target: OverviewTarget) => void
}

/** One งาน, flattened so subject and homeroom rooms render through the same rows. */
interface OverviewItem {
  id: string
  title: string
  subtitle: string
  endAt: string | null
  createdAt: string | null
  closed: boolean
  progress: AssignmentProgress
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

/**
 * How the deadline reads to a teacher watching the whole room. "No deadline"
 * is plain information, not a state on the urgency scale, so it stays neutral
 * instead of borrowing a colour that means something else.
 */
function describeDue(endAt: string | null, missing: number, now: number): { label: string; badge: string } {
  if (!endAt) return { label: 'ไม่มีกำหนดส่ง', badge: 'bg-muted text-muted-foreground' }
  const diff = new Date(endAt).getTime() - now
  if (missing === 0) return { label: `ส่งครบแล้ว · ${formatDay(endAt)}`, badge: SEVERITY_BADGE.done }
  if (diff < 0) return { label: `เลยกำหนด ${formatDay(endAt)}`, badge: SEVERITY_BADGE.overdue }
  if (diff < 2 * 86_400_000) return { label: `ครบกำหนด ${formatDay(endAt)}`, badge: SEVERITY_BADGE.soon }
  return { label: `ครบกำหนด ${formatDay(endAt)}`, badge: SEVERITY_BADGE.later }
}

function rateTone(rate: number): string {
  return rate >= 80 ? 'bg-success' : rate >= 50 ? 'bg-warning' : 'bg-destructive'
}

export function ClassroomOverview({
  classroomId, isHomeroom, students, assignments, homeroomAssignments, submissions,
  pendingReviewCount, pendingReviewCapped, posts, seenByPost, crossPostTargets,
  canManage, onNavigate,
}: Props) {
  const now = Date.now()
  const studentIds = students.map(s => s.id)
  const nameById = new Map(students.map(s => [s.id, s.full_name]))

  // Only งาน that reached the students counts towards anyone's rate — a draft
  // nobody was given yet must not read as "ทุกคนค้างส่ง". A closed งาน does
  // count: it was given, its window is over, and how it went is part of how
  // this room is doing.
  const given = isHomeroom
    ? homeroomAssignments
    : assignments.filter(a => a.status === 'published' || a.status === 'closed')
  const draftCount = isHomeroom ? 0 : assignments.filter(a => a.status === 'draft').length
  const summary = summarizeClassroomProgress(studentIds, given, submissions, now)

  const items: OverviewItem[] = given.map(a => ({
    id: a.id,
    title: a.title,
    subtitle: isHomeroom
      ? (a as HomeroomAssignmentRow).classroomName
      : (TYPE_CFG[(a as ClassroomAssignmentRow).type]?.label ?? 'งาน'),
    endAt: a.end_at,
    createdAt: isHomeroom ? null : (a as ClassroomAssignmentRow).created_at,
    // Nothing can land in a closed งาน any more, so it never shows up as
    // upcoming and no one gets chased over it.
    closed: !isHomeroom && (a as ClassroomAssignmentRow).status === 'closed',
    progress: summary.byAssignment.get(a.id) ?? {
      attempted: 0, submitted: 0, completed: 0, passed: 0, inProgress: 0, missing: students.length,
    },
  }))

  // One list, ordered by what needs attention rather than by age: work that is
  // late and short of hand-ins first, then what is due next, then everything
  // else newest-first. The teacher scrolls this instead of reading four
  // summary numbers that only ever pointed back at it.
  function urgency(item: OverviewItem): number {
    if (item.closed) return 4
    if (!item.endAt) return 3
    const overdueNow = isDueBy(item.endAt, now)
    if (overdueNow && item.progress.missing > 0) return 0
    if (!overdueNow) return 1
    return 2
  }
  const ordered = [...items].sort((a, b) => {
    const byUrgency = urgency(a) - urgency(b)
    if (byUrgency !== 0) return byUrgency
    // Inside a band: soonest deadline first, and undated work newest first.
    if (a.endAt && b.endAt) return a.endAt.localeCompare(b.endAt)
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })

  const overdue = items
    .filter(i => !i.closed && i.endAt && isDueBy(i.endAt, now) && i.progress.missing > 0)
    .sort((a, b) => (b.endAt ?? '').localeCompare(a.endAt ?? ''))

  // Everyone with work outstanding, worst first. The panel shows the first
  // few; the action list needs the real total behind them.
  const behindAll = students
    .map(s => summary.byStudent.get(s.id)!)
    .filter(p => p && p.total > 0 && p.rate < 100)
    .sort((a, b) => a.rate - b.rate)
  const behind = behindAll.slice(0, 5)

  // What the room needs from this teacher right now, most urgent first. Every
  // entry is something they can act on — an empty list means nothing is late.
  function buildActions() {
    const list: { key: string; text: string; tone: 'destructive' | 'warning' | 'primary'; label: string; run: () => void }[] = []

    if (students.length === 0) {
      list.push({
        key: 'no-students', tone: 'warning', text: 'ยังไม่มีนักเรียนในห้องเรียนนี้',
        label: 'เชิญนักเรียน', run: () => onNavigate('invite'),
      })
    }

    for (const item of overdue.slice(0, 2)) {
      list.push({
        key: `overdue-${item.id}`, tone: 'destructive',
        text: `“${item.title}” เลยกำหนดแล้ว ยังไม่ส่ง ${item.progress.missing} คน`,
        label: 'ดูว่าใครยังไม่ส่ง', run: () => onNavigate(isHomeroom ? 'homeroom' : 'scores'),
      })
    }

    // Work with no deadline never goes "overdue", so without this a room where
    // half the งาน is still outstanding would report that nothing is pending.
    if (behindAll.length > 0) {
      const worst = behindAll[0].rate
      list.push({
        key: 'behind', tone: worst < 50 ? 'warning' : 'primary',
        text: `มีนักเรียน ${behindAll.length} คนส่งงานยังไม่ครบ (ต่ำสุด ${worst}%)`,
        label: 'ดูรายชื่อ', run: () => onNavigate(isHomeroom ? 'homeroom' : 'scores'),
      })
    }

    if (pendingReviewCount > 0) {
      list.push({
        key: 'pending-review', tone: 'warning',
        text: `มีงานที่ส่งแล้ว ${pendingReviewCount}${pendingReviewCapped ? '+' : ''} ชิ้น รอครูตรวจให้คะแนนเอง`,
        label: 'ไปตรวจงาน', run: () => onNavigate('scores'),
      })
    }

    if (draftCount > 0) {
      list.push({
        key: 'drafts', tone: 'primary',
        text: `มีงานฉบับร่าง ${draftCount} ชิ้นที่ยังไม่ได้เผยแพร่ให้นักเรียน`,
        label: 'เปิดรายการงาน', run: () => onNavigate('assignments'),
      })
    }

    if (!isHomeroom && given.length === 0 && students.length > 0) {
      list.push({
        key: 'no-assignments', tone: 'primary', text: 'ยังไม่ได้มอบหมายงานให้ห้องนี้',
        label: 'ไปที่แท็บงาน', run: () => onNavigate('assignments'),
      })
    }

    return list
  }

  const actions = buildActions()

  // Announcements lead the page: it is the one part of a classroom that is
  // read every day, and the one thing a teacher comes here to write. The board
  // scrolls inside its own frame so a term's worth of posts cannot bury the
  // numbers underneath it.
  const announcements = (
    <ClassroomStream
      classroomId={classroomId}
      canPost={canManage}
      initialPosts={posts}
      variant="panel"
      maxHeightClass="max-h-[360px]"
      students={students}
      seenByPost={seenByPost}
      crossPostTargets={crossPostTargets}
    />
  )

  // A view-only co-teacher has no scores, no roster progress and nothing to
  // assign — showing them those panels empty would read as "this room has no
  // work", which is an authorization boundary dressed up as an empty state.
  if (!canManage) {
    return <div className="space-y-5">{announcements}</div>
  }

  return (
    <div className="space-y-5">
      {announcements}

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {isHomeroom ? (
          <>
            <Button size="lg" className="gap-1.5" onClick={() => onNavigate('homeroom')}>
              <ClipboardList className="w-4 h-4" /> ดูการบ้านนักเรียน
            </Button>
            <Link
              href={`/classrooms/${classroomId}/report`}
              target="_blank"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-1.5')}
            >
              <Printer className="w-4 h-4" /> พิมพ์รายงานผู้ปกครอง
            </Link>
          </>
        ) : (
          <>
            <Link
              href={`/assignments/new?classroom=${classroomId}`}
              className={cn(buttonVariants({ size: 'lg' }), 'gap-1.5')}
            >
              <Plus className="w-4 h-4" /> มอบหมายงานใหม่
            </Link>
            <Button variant="outline" size="lg" className="gap-1.5" onClick={() => onNavigate('scores')}>
              <ClipboardList className="w-4 h-4" /> ดูคะแนนและการส่งงาน
            </Button>
          </>
        )}
        <Button variant="outline" size="lg" className="gap-1.5" onClick={() => onNavigate('invite')}>
          <UserPlus className="w-4 h-4" /> เชิญนักเรียน
        </Button>
      </div>

      {/* ── What needs the teacher now ────────────────────────────────── */}
      <Card padding="md">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          <AlertTriangle className="w-3.5 h-3.5" /> ต้องดำเนินการ
        </div>
        {actions.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 text-success" />
            ตอนนี้ไม่มีอะไรค้าง — งานส่งครบและไม่มีอะไรรอครูอยู่
          </div>
        ) : (
          <ul className="space-y-1.5">
            {actions.map(action => (
              <li key={action.key} className="flex items-center gap-3 flex-wrap">
                <span
                  className={cn('w-1.5 h-1.5 rounded-full shrink-0', {
                    'bg-destructive': action.tone === 'destructive',
                    'bg-warning': action.tone === 'warning',
                    'bg-primary': action.tone === 'primary',
                  })}
                />
                <span className="text-sm text-foreground flex-1 min-w-0">{action.text}</span>
                <Button variant="link" size="sm" className="gap-0.5 px-0" onClick={action.run}>
                  {action.label} <ArrowRight className="w-3 h-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Assignment progress ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Section
            title={isHomeroom ? 'การบ้านที่กำลังติดตาม' : 'งานที่มอบหมาย'}
            note={ordered.length > 0
              ? `${ordered.length} ชิ้น${summary.overallRate == null ? '' : ` · ส่งแล้ว ${summary.overallRate}%`}`
              : undefined}
            actionLabel={isHomeroom ? 'ดูตารางทั้งหมด' : 'จัดการงานทั้งหมด'}
            onAction={() => onNavigate(isHomeroom ? 'homeroom' : 'assignments')}
          >
            {ordered.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {isHomeroom
                    ? 'ยังไม่มีการบ้านจากห้องเรียนวิชาของนักเรียนกลุ่มนี้'
                    : 'ยังไม่มีงานที่เผยแพร่ให้ห้องนี้'}
                </p>
                {!isHomeroom && (
                  <Link
                    href={`/assignments/new?classroom=${classroomId}`}
                    className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
                  >
                    <Plus className="w-3.5 h-3.5" /> มอบหมายงานแรก
                  </Link>
                )}
              </div>
            ) : (
              /* Bounded like the announcement board: a room with thirty งาน
                 scrolls inside its own frame instead of burying the page. */
              <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
                {ordered.map(item => (
                  <AssignmentRow key={item.id} item={item} studentCount={students.length} now={now} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ── Side column ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Section
            title="นักเรียนที่ควรติดตาม"
            actionLabel={behind.length > 0 ? 'ดูทั้งห้อง' : undefined}
            onAction={() => onNavigate(isHomeroom ? 'homeroom' : 'scores')}
          >
            {behind.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {summary.dueAssignmentCount === 0 ? 'ยังไม่มีงานที่ครบกำหนด' : 'ทุกคนส่งงานที่ครบกำหนดแล้ว'}
              </p>
            ) : (
              <div className="px-4 py-3 space-y-2">
                {behind.map(p => (
                  <div key={p.studentId} className="flex items-center gap-2">
                    <p className="w-28 shrink-0 truncate text-sm text-foreground">{nameById.get(p.studentId)}</p>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn('h-full rounded-full', rateTone(p.rate))} style={{ width: `${p.rate}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{p.submitted}/{p.total}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title, note, actionLabel, onAction, children,
}: {
  title: string
  /** Small count beside the title — what is left of the stat tiles. */
  note?: string
  actionLabel?: string
  onAction?: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
          {note && <span className="ml-2 font-normal normal-case">{note}</span>}
        </h2>
        {actionLabel && onAction && (
          <Button variant="link" size="sm" className="gap-0.5 px-0" onClick={onAction}>
            {actionLabel} <ChevronRight className="w-3 h-3" />
          </Button>
        )}
      </div>
      {children}
    </Card>
  )
}

function AssignmentRow({ item, studentCount, now }: { item: OverviewItem; studentCount: number; now: number }) {
  const due = describeDue(item.endAt, item.progress.missing, now)
  const rate = studentCount > 0 ? Math.round((item.progress.submitted / studentCount) * 100) : 0

  return (
    <Link href={`/assignments/${item.id}`} className="block px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{item.title}</p>
        <span className="text-xs text-muted-foreground shrink-0">
          ส่งแล้ว {item.progress.submitted}/{studentCount}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden my-2">
        <div className={cn('h-full rounded-full', rateTone(rate))} style={{ width: `${rate}%` }} />
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span className="truncate">{item.subtitle}</span>
        {/* A closed งาน sits at the bottom of the list and takes no more
            hand-ins — say so, or its position looks arbitrary. */}
        {item.closed && <span className="font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">ปิดแล้ว</span>}
        <span className={cn('font-medium px-2 py-0.5 rounded-full', due.badge)}>{due.label}</span>
        {item.progress.inProgress > 0 && <span>กำลังทำอยู่ {item.progress.inProgress} คน</span>}
      </div>
    </Link>
  )
}

'use client'

import Link from 'next/link'
import { ChevronRight, Plus, Printer } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClassroomStream } from './classroom-stream'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { assignmentCreationHubHref } from '@/lib/assignment-creation'
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
  posts: ClassroomPost[]
  /** Student ids that have seen each announcement, keyed by post id. */
  seenByPost: Record<string, string[]>
  /** Other classrooms the same announcement can be posted to at once. */
  crossPostTargets: { id: string; name: string }[]
  /** A view-only co-teacher gets the announcement board and nothing else. */
  canManage: boolean
  /** The students each กลุ่มย่อย-only งาน was handed to, keyed by assignment id. */
  audienceByAssignment?: Map<string, Set<string>>
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
  posts, seenByPost, crossPostTargets, canManage, audienceByAssignment, onNavigate,
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
  const summary = summarizeClassroomProgress(
    studentIds, given, submissions, now,
    a => (isHomeroom ? null : audienceByAssignment?.get(a.id) ?? null),
  )

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
      attempted: 0, submitted: 0, completed: 0, passed: 0, inProgress: 0,
      missing: (isHomeroom ? null : audienceByAssignment?.get(a.id)?.size) ?? students.length,
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

  // Everyone with work outstanding, worst first. The side panel is the single
  // place for following up, so the overview never repeats the same warning in
  // a second "ต้องดำเนินการ" card above it.
  const behindAll = students
    .map(s => summary.byStudent.get(s.id)!)
    .filter(p => p && p.total > 0 && p.rate < 100)
    .sort((a, b) => a.rate - b.rate)
  const behind = behindAll.slice(0, 5)

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
      maxHeightClass="max-h-[680px]"
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

      {/* The contextual sidebar already owns navigation actions. Homeroom's
          printable parent report stays here because it is a page-specific
          export, not another destination in that navigation. */}
      {isHomeroom && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/classrooms/${classroomId}/report`}
            target="_blank"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-1.5')}
          >
            <Printer className="w-4 h-4" /> พิมพ์รายงานผู้ปกครอง
          </Link>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── Assignment progress ─────────────────────────────────────── */}
        <div className="min-w-0">
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
                    href={assignmentCreationHubHref(classroomId)}
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
                  <AssignmentRow
                    key={item.id}
                    item={item}
                    studentCount={(isHomeroom ? null : audienceByAssignment?.get(item.id)?.size) ?? students.length}
                    now={now}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ── Side column ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <Section
            title="นักเรียนที่ควรติดตาม"
            note={behindAll.length > 0 ? `${behindAll.length} คน` : undefined}
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
    <Card className="h-full overflow-hidden">
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

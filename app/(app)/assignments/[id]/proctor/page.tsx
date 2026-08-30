import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { getAuthUser } from '@/lib/auth/server'
import type { AndroidApprovalView } from '@/lib/actions/android-exam'
import {
  PROCTOR_RECENT_EVENT_LIMIT,
  PROCTOR_REVIEW_EVENT_TYPES,
  PROCTOR_REVIEW_QUEUE_LIMIT,
  selectProctorDashboardEvents,
} from '@/lib/exam-proctor-alerts'
import type { ProctorEventRow, ProctorSessionRow } from '@/lib/exam-proctor-realtime'
import type { SebPreflightCheckinRow } from '@/lib/seb-preflight'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ProctorDashboard,
  type ProctorParticipant,
} from './_components/proctor-dashboard'

export const metadata = { title: 'ห้องคุมสอบสด — KorKru' }

interface SubmissionRow {
  id: string
  student_id: string
  status: string
  started_at: string
  submitted_at: string | null
  attempt_number: number
}

function fallbackStudentName(studentId: string): string {
  return `นักเรียน (รหัส ${studentId.slice(0, 8)})`
}

export default async function ProctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, mode, type, proctoring_enabled, fullscreen_required, block_clipboard, secure_browser_mode, android_exam_mode, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  // The assignment RLS policy is the authorization boundary for owners and
  // co-teachers with manage/admin permission. Do not reveal whether another
  // teacher's assignment exists.
  if (!assignment) notFound()

  const { data: links, error: linksError } = await supabase
    .from('assignment_classrooms')
    .select('classroom_id')
    .eq('assignment_id', id)
  const classroomIds = (links ?? []).map(link => link.classroom_id)

  const [
    submissionsResult,
    sessionsResult,
    eventsResult,
    unacknowledgedEventsResult,
    unacknowledgedCountResult,
    rosterResult,
    approvalsResult,
    sebCheckinsResult,
  ] = await Promise.all([
    supabase
      .from('submissions')
      .select('id, student_id, status, started_at, submitted_at, attempt_number')
      .eq('assignment_id', id)
      .order('attempt_number', { ascending: false }),
    supabase
      .from('exam_proctor_sessions')
      .select('*')
      .eq('assignment_id', id)
      .order('last_seen_at', { ascending: false }),
    supabase
      .from('exam_proctor_events')
      .select('*')
      .eq('assignment_id', id)
      .order('created_at', { ascending: false })
      .limit(PROCTOR_RECENT_EVENT_LIMIT),
    supabase
      .from('exam_proctor_events')
      .select('*')
      .eq('assignment_id', id)
      .is('acknowledged_at', null)
      .in('event_type', [...PROCTOR_REVIEW_EVENT_TYPES])
      .order('created_at', { ascending: false })
      .limit(PROCTOR_REVIEW_QUEUE_LIMIT),
    supabase
      .from('exam_proctor_events')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_id', id)
      .is('acknowledged_at', null)
      .in('event_type', [...PROCTOR_REVIEW_EVENT_TYPES]),
    classroomIds.length > 0
      ? supabase
          .from('classroom_students')
          .select('student_id')
          .in('classroom_id', classroomIds)
      : Promise.resolve({ data: [], error: null }),
    assignment.android_exam_mode === 'monitored'
      ? supabase
          .from('exam_android_approvals')
          .select('id, assignment_id, student_id, status, requested_at, reviewed_at, reviewed_by, expires_at, updated_at')
          .eq('assignment_id', id)
          .order('requested_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    assignment.secure_browser_mode === 'seb_required'
      ? supabase
          .from('exam_seb_checkins')
          .select('assignment_id, student_id, verified_at, valid_until, platform, version')
          .eq('assignment_id', id)
          .order('verified_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  const initialProctorEvents = selectProctorDashboardEvents([
    ...((eventsResult.data ?? []) as ProctorEventRow[]),
    ...((unacknowledgedEventsResult.data ?? []) as ProctorEventRow[]),
  ])

  const studentIds = new Set<string>()
  for (const row of submissionsResult.data ?? []) studentIds.add(row.student_id)
  for (const row of sessionsResult.data ?? []) studentIds.add(row.student_id)
  for (const row of initialProctorEvents) studentIds.add(row.student_id)
  for (const row of rosterResult.data ?? []) studentIds.add(row.student_id)
  for (const row of approvalsResult.data ?? []) studentIds.add(row.student_id)

  // The session-bound assignment query above is the authorization boundary.
  // Only after it succeeds do we bypass the restrictive users RLS, and then
  // only for the exact student IDs already visible within this assignment.
  const admin = createAdminClient()
  const namesResult = studentIds.size > 0
    ? await admin
        .from('users')
        .select('id, full_name')
        .in('id', [...studentIds])
    : { data: [], error: null }

  const loadError = linksError
    ?? submissionsResult.error
    ?? sessionsResult.error
    ?? eventsResult.error
    ?? unacknowledgedEventsResult.error
    ?? unacknowledgedCountResult.error
    ?? rosterResult.error
    ?? approvalsResult.error
    ?? namesResult.error

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <Button nativeButton={false} variant="ghost" render={<Link href={`/assignments/${id}`} />}>
          <ArrowLeft aria-hidden="true" /> กลับหน้าชุดข้อสอบ
        </Button>
        <Card padding="xl" className="border-destructive/30">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <h1 className="font-semibold text-foreground">เปิดห้องคุมสอบไม่ได้</h1>
              <p className="mt-1 text-sm text-muted-foreground">โหลดข้อมูลไม่สำเร็จ กรุณาลองเปิดหน้านี้อีกครั้ง</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const submissions = (submissionsResult.data ?? []) as unknown as SubmissionRow[]
  const studentNameById = new Map(
    (namesResult.data ?? []).map(row => [
      row.id,
      row.full_name?.trim() || fallbackStudentName(row.id),
    ]),
  )
  const studentName = (studentId: string) => (
    studentNameById.get(studentId) ?? fallbackStudentName(studentId)
  )
  const latestSubmissionByStudent = new Map<string, SubmissionRow>()
  for (const submission of submissions) {
    if (!latestSubmissionByStudent.has(submission.student_id)) {
      latestSubmissionByStudent.set(submission.student_id, submission)
    }
  }

  const participantByStudent = new Map<string, ProctorParticipant>()
  for (const row of rosterResult.data ?? []) {
    participantByStudent.set(row.student_id, {
      studentId: row.student_id,
      name: studentName(row.student_id),
      submissionId: null,
      submissionStatus: 'not_started',
      startedAt: null,
      submittedAt: null,
    })
  }
  for (const submission of latestSubmissionByStudent.values()) {
    participantByStudent.set(submission.student_id, {
      studentId: submission.student_id,
      name: studentName(submission.student_id),
      submissionId: submission.id,
      submissionStatus: submission.status,
      startedAt: submission.started_at,
      submittedAt: submission.submitted_at,
    })
  }
  const initialRosterStudentIds = [
    ...new Set((rosterResult.data ?? []).map(row => row.student_id)),
  ]
  const rosterStudentIdSet = new Set(initialRosterStudentIds)

  const classroom = Array.isArray(assignment.classrooms)
    ? assignment.classrooms[0]
    : assignment.classrooms

  return (
    <ProctorDashboard
      assignment={{
        id: assignment.id,
        title: assignment.title,
        classroomName: classroom?.name ?? 'ห้องเรียน',
        enabled: assignment.proctoring_enabled === true,
        fullscreenRequired: assignment.fullscreen_required === true,
        blockClipboard: assignment.block_clipboard === true,
        secureBrowserRequired: assignment.secure_browser_mode === 'seb_required',
        androidMonitoredAllowed: assignment.android_exam_mode === 'monitored',
      }}
      initialParticipants={[...participantByStudent.values()]}
      initialRosterStudentIds={initialRosterStudentIds}
      initialSessions={(sessionsResult.data ?? []) as ProctorSessionRow[]}
      initialEvents={initialProctorEvents}
      initialUnacknowledgedCount={unacknowledgedCountResult.count ?? 0}
      initialAndroidApprovals={(approvalsResult.data ?? []) as AndroidApprovalView[]}
      initialSebCheckins={((sebCheckinsResult.data ?? []) as SebPreflightCheckinRow[])
        .filter(checkin => rosterStudentIdSet.has(checkin.student_id))}
      initialSebCheckinsError={Boolean(sebCheckinsResult.error)}
    />
  )
}

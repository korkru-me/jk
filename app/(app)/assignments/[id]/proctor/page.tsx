import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { getAuthUser } from '@/lib/auth/server'
import type { ProctorEventRow, ProctorSessionRow } from '@/lib/exam-proctor-realtime'
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
  users: { full_name: string | null } | { full_name: string | null }[] | null
}
function relatedName(value: SubmissionRow['users']): string {
  const user = Array.isArray(value) ? value[0] : value
  return user?.full_name?.trim() || 'นักเรียน'
}

export default async function ProctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, mode, type, proctoring_enabled, fullscreen_required, block_clipboard, classrooms(name)')
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

  const [submissionsResult, sessionsResult, eventsResult, rosterResult] = await Promise.all([
    supabase
      .from('submissions')
      .select('id, student_id, status, started_at, submitted_at, attempt_number, users(full_name)')
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
      .limit(100),
    classroomIds.length > 0
      ? supabase
          .from('classroom_students')
          .select('student_id, users(full_name)')
          .in('classroom_id', classroomIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const loadError = linksError
    ?? submissionsResult.error
    ?? sessionsResult.error
    ?? eventsResult.error
    ?? rosterResult.error

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <Button variant="ghost" render={<Link href={`/assignments/${id}`} />}>
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
  const latestSubmissionByStudent = new Map<string, SubmissionRow>()
  for (const submission of submissions) {
    if (!latestSubmissionByStudent.has(submission.student_id)) {
      latestSubmissionByStudent.set(submission.student_id, submission)
    }
  }

  const participantByStudent = new Map<string, ProctorParticipant>()
  for (const row of (rosterResult.data ?? []) as Array<{
    student_id: string
    users: { full_name: string | null } | { full_name: string | null }[] | null
  }>) {
    const related = Array.isArray(row.users) ? row.users[0] : row.users
    participantByStudent.set(row.student_id, {
      studentId: row.student_id,
      name: related?.full_name?.trim() || 'นักเรียน',
      submissionId: null,
      submissionStatus: 'not_started',
      startedAt: null,
      submittedAt: null,
    })
  }
  for (const submission of latestSubmissionByStudent.values()) {
    participantByStudent.set(submission.student_id, {
      studentId: submission.student_id,
      name: relatedName(submission.users),
      submissionId: submission.id,
      submissionStatus: submission.status,
      startedAt: submission.started_at,
      submittedAt: submission.submitted_at,
    })
  }

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
      }}
      initialParticipants={[...participantByStudent.values()]}
      initialSessions={(sessionsResult.data ?? []) as ProctorSessionRow[]}
      initialEvents={(eventsResult.data ?? []) as ProctorEventRow[]}
    />
  )
}

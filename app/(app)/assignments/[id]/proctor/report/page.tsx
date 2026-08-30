import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileClock,
  Radio,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { getAuthUser } from '@/lib/auth/server'
import {
  ATTEMPT_LIMIT,
  EXPORT_LIMIT,
  EXPORT_MAX_BYTES,
  KNOWN_EVENT_TYPES,
  MAX_PAGE,
  PAGE_SIZE,
  buildProctorReportHref,
  hasInvalidProctorReportSearchParams,
  mapProctorReportEventRow,
  parseProctorReportFilters,
  proctorReportAccessModeLabel,
  proctorReportStudentName,
  type ProctorReportFilters,
} from '@/lib/exam-proctor-report'
import { PROCTOR_EVENT_LABELS, PROCTOR_REVIEW_EVENT_TYPES } from '@/lib/exam-proctor-alerts'
import { getManagedProctorReportAssignment } from '@/lib/exam-proctor-report-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { ProctorReportExportButton } from './_components/proctor-report-export-button'

export const metadata = { title: 'รายงานสัญญาณคุมสอบ — KorKru' }
export const dynamic = 'force-dynamic'

const SESSION_BATCH_SIZE = 1_000
const ADMIN_BATCH_SIZE = 200
const ATTEMPT_SUMMARY_LIMIT = 25

interface SessionRow {
  submission_id: string
  student_id: string
  started_monitoring_at: string
  last_seen_at: string
  completed_at: string | null
  tab_switch_count: number
  fullscreen_exit_count: number
  window_blur_count: number
  clipboard_attempt_count: number
  screenshot_key_count: number
  concurrent_connection_count: number
  secure_browser_verified_at: string | null
  secure_browser_platform: 'windows' | 'macos' | 'ios' | null
  secure_browser_version: string | null
  exam_access_mode: 'browser' | 'seb' | 'android_monitored'
  android_approved_at: string | null
}

interface SubmissionRow {
  id: string
  attempt_number: number
  status: string
  started_at: string
  submitted_at: string | null
  exam_access_mode: 'browser' | 'seb' | 'android_monitored'
}

interface StudentNameRow {
  id: string
  full_name: string | null
}

interface EventRow {
  id: number
  submission_id: string
  student_id: string
  event_type: string
  occurred_at_client: string | null
  created_at: string
  acknowledged_at: string | null
}

type SessionClient = Awaited<ReturnType<typeof createClient>>
type AdminClient = ReturnType<typeof createAdminClient>

type LoadResult<T> =
  | { data: T; error: null }
  | { data: null; error: 'query_failed' | 'too_many' }

async function loadRetainedSessions(
  supabase: SessionClient,
  assignmentId: string,
): Promise<LoadResult<SessionRow[]>> {
  const boundaryResult = await supabase
    .from('exam_proctor_sessions')
    .select('submission_id', { count: 'exact' })
    .eq('assignment_id', assignmentId)
    .order('submission_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (boundaryResult.error || boundaryResult.count === null) {
    return { data: null, error: 'query_failed' }
  }
  if (boundaryResult.count > ATTEMPT_LIMIT) {
    return { data: null, error: 'too_many' }
  }
  if (boundaryResult.count === 0) return { data: [], error: null }
  const maxSubmissionId = boundaryResult.data?.submission_id
  if (typeof maxSubmissionId !== 'string') {
    return { data: null, error: 'query_failed' }
  }

  const rows: SessionRow[] = []
  let lastSubmissionId: string | null = null

  while (rows.length < boundaryResult.count) {
    const requested = Math.min(SESSION_BATCH_SIZE, boundaryResult.count - rows.length)
    let query = supabase
      .from('exam_proctor_sessions')
      .select('submission_id, student_id, started_monitoring_at, last_seen_at, completed_at, tab_switch_count, fullscreen_exit_count, window_blur_count, clipboard_attempt_count, screenshot_key_count, concurrent_connection_count, secure_browser_verified_at, secure_browser_platform, secure_browser_version, exam_access_mode, android_approved_at')
      .eq('assignment_id', assignmentId)
      .lte('submission_id', maxSubmissionId)
      .order('submission_id', { ascending: true })
      .limit(requested)
    if (lastSubmissionId) query = query.gt('submission_id', lastSubmissionId)

    const { data, error } = await query

    if (error) return { data: null, error: 'query_failed' }
    const batch = (data ?? []) as unknown as SessionRow[]
    if (batch.length === 0) return { data: null, error: 'query_failed' }
    rows.push(...batch)
    const nextLastSubmissionId = batch.at(-1)?.submission_id
    if (!nextLastSubmissionId || nextLastSubmissionId === lastSubmissionId) {
      return { data: null, error: 'query_failed' }
    }
    lastSubmissionId = nextLastSubmissionId
  }

  const uniqueSubmissionIds = new Set(rows.map(row => row.submission_id))
  if (rows.length !== boundaryResult.count || uniqueSubmissionIds.size !== rows.length) {
    return { data: null, error: 'query_failed' }
  }
  const finalCountResult = await supabase
    .from('exam_proctor_sessions')
    .select('submission_id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
    .lte('submission_id', maxSubmissionId)
  if (finalCountResult.error || finalCountResult.count !== boundaryResult.count) {
    return { data: null, error: 'query_failed' }
  }
  return { data: rows, error: null }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

async function loadExactSubmissions(
  admin: AdminClient,
  assignmentId: string,
  submissionIds: string[],
): Promise<LoadResult<SubmissionRow[]>> {
  const expectedIds = new Set(submissionIds)
  const rows: SubmissionRow[] = []
  for (const ids of chunks(submissionIds, ADMIN_BATCH_SIZE)) {
    const { data, error } = await admin
      .from('submissions')
      .select('id, attempt_number, status, started_at, submitted_at, exam_access_mode')
      .eq('assignment_id', assignmentId)
      .in('id', ids)
    if (error) return { data: null, error: 'query_failed' }
    rows.push(...((data ?? []) as unknown as SubmissionRow[]))
  }
  const returnedIds = new Set(rows.map(row => row.id))
  if (
    returnedIds.size !== expectedIds.size
    || rows.length !== returnedIds.size
    || [...returnedIds].some(id => !expectedIds.has(id))
  ) return { data: null, error: 'query_failed' }
  return { data: rows, error: null }
}

async function loadExactStudentNames(
  admin: AdminClient,
  studentIds: string[],
): Promise<LoadResult<StudentNameRow[]>> {
  const expectedIds = new Set(studentIds)
  const rows: StudentNameRow[] = []
  for (const ids of chunks(studentIds, ADMIN_BATCH_SIZE)) {
    const { data, error } = await admin
      .from('users')
      .select('id, full_name')
      .in('id', ids)
    if (error) return { data: null, error: 'query_failed' }
    rows.push(...((data ?? []) as unknown as StudentNameRow[]))
  }
  const returnedIds = new Set(rows.map(row => row.id))
  if (
    returnedIds.size !== expectedIds.size
    || rows.length !== returnedIds.size
    || [...returnedIds].some(id => !expectedIds.has(id))
  ) return { data: null, error: 'query_failed' }
  return { data: rows, error: null }
}

function validatedFilters(
  parsed: ProctorReportFilters,
  sessions: SessionRow[],
): ProctorReportFilters | null {
  const studentIds = new Set(sessions.map(session => session.student_id))
  const sessionBySubmission = new Map(
    sessions.map(session => [session.submission_id, session]),
  )
  if (parsed.studentId && !studentIds.has(parsed.studentId)) return null
  const studentId = parsed.studentId
  const selectedAttempt = parsed.submissionId
    ? sessionBySubmission.get(parsed.submissionId)
    : null
  if (
    parsed.submissionId
    && (!selectedAttempt || (studentId && selectedAttempt.student_id !== studentId))
  ) return null
  const submissionId = selectedAttempt?.submission_id ?? null

  return { ...parsed, studentId, submissionId }
}

function ReportFilterError({ assignmentId }: { assignmentId: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-8">
      <Button variant="ghost" render={<Link href={`/assignments/${assignmentId}/proctor/report`} />}>
        <ArrowLeft aria-hidden="true" /> กลับรายงานทั้งหมด
      </Button>
      <Card padding="xl" className="border-warning/30 bg-warning/5">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <h1 className="font-semibold text-foreground">เปิดตัวกรองนี้ไม่ได้</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              นักเรียน, attempt หรือค่าตัวกรองในลิงก์ไม่อยู่ในข้อมูลคุมสอบที่ยังเก็บไว้ ระบบจึงไม่ขยายขอบเขตไปแสดงข้อมูลของทุกคนอัตโนมัติ
            </p>
            <Button
              className="mt-4"
              variant="outline"
              render={<Link href={`/assignments/${assignmentId}/proctor/report`} />}
            >
              ล้างตัวกรองและเปิดรายงาน
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function applyKindAndReviewFilters<T extends {
  in(column: string, values: string[]): T
  eq(column: string, value: string): T
  is(column: string, value: null): T
  not(column: string, operator: string, value: null): T
}>(query: T, filters: ProctorReportFilters): T {
  let filtered = query
  if (filters.kind === 'reviewable') {
    filtered = filtered.in('event_type', [...PROCTOR_REVIEW_EVENT_TYPES])
  } else if (filters.kind !== 'all') {
    filtered = filtered.eq('event_type', filters.kind)
  }

  if (filters.review === 'pending') {
    filtered = filtered
      .in('event_type', [...PROCTOR_REVIEW_EVENT_TYPES])
      .is('acknowledged_at', null)
  } else if (filters.review === 'acknowledged') {
    filtered = filtered
      .in('event_type', [...PROCTOR_REVIEW_EVENT_TYPES])
      .not('acknowledged_at', 'is', null)
  }
  return filtered
}

async function loadFilteredEventCount(
  supabase: SessionClient,
  assignmentId: string,
  filters: ProctorReportFilters,
): Promise<LoadResult<number>> {
  let query = supabase
    .from('exam_proctor_events')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
  if (filters.studentId) query = query.eq('student_id', filters.studentId)
  if (filters.submissionId) query = query.eq('submission_id', filters.submissionId)
  query = applyKindAndReviewFilters(query, filters)

  const { count, error } = await query
  if (error || count === null) return { data: null, error: 'query_failed' }
  return { data: count, error: null }
}

async function loadPendingEventCount(
  supabase: SessionClient,
  assignmentId: string,
  filters: ProctorReportFilters,
): Promise<LoadResult<number>> {
  let query = supabase
    .from('exam_proctor_events')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
    .in('event_type', [...PROCTOR_REVIEW_EVENT_TYPES])
    .is('acknowledged_at', null)
  if (filters.studentId) query = query.eq('student_id', filters.studentId)
  if (filters.submissionId) query = query.eq('submission_id', filters.submissionId)

  const { count, error } = await query
  if (error || count === null) return { data: null, error: 'query_failed' }
  return { data: count, error: null }
}

async function loadEventPage(
  supabase: SessionClient,
  assignmentId: string,
  filters: ProctorReportFilters,
  page: number,
): Promise<LoadResult<EventRow[]>> {
  const from = (page - 1) * PAGE_SIZE
  let query = supabase
    .from('exam_proctor_events')
    .select('id, submission_id, student_id, event_type, occurred_at_client, created_at, acknowledged_at')
    .eq('assignment_id', assignmentId)
  if (filters.studentId) query = query.eq('student_id', filters.studentId)
  if (filters.submissionId) query = query.eq('submission_id', filters.submissionId)
  query = applyKindAndReviewFilters(query, filters)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (error) return { data: null, error: 'query_failed' }
  return { data: (data ?? []) as unknown as EventRow[], error: null }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'เวลาไม่ถูกต้อง'
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(date)
}

function submissionStatusLabel(status: string | undefined): string {
  if (status === 'in_progress') return 'กำลังทำ'
  if (status === 'submitted') return 'ส่งแล้ว'
  if (status === 'graded') return 'ตรวจแล้ว'
  return 'ไม่ทราบสถานะ'
}

function classroomName(
  classrooms: { name: string } | { name: string }[] | null,
): string {
  if (Array.isArray(classrooms)) return classrooms[0]?.name ?? 'ห้องเรียน'
  return classrooms?.name ?? 'ห้องเรียน'
}

function ReportLoadError({
  assignmentId,
  tooManySessions = false,
}: {
  assignmentId: string
  tooManySessions?: boolean
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-8">
      <Button
        variant="ghost"
        render={<Link href={`/assignments/${assignmentId}/proctor`} />}
      >
        <ArrowLeft aria-hidden="true" /> กลับห้องคุมสอบสด
      </Button>
      <Card padding="xl" className="border-destructive/30">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <h1 className="font-semibold text-foreground">
              {tooManySessions ? 'เปิดรายงานนี้ไม่ได้อย่างปลอดภัย' : 'โหลดรายงานสัญญาณคุมสอบไม่ได้'}
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {tooManySessions
                ? 'รายงานนี้มี attempt ที่เก็บข้อมูลคุมสอบมากกว่า 2,000 รายการ ระบบจึงหยุดก่อนโหลดข้อมูลไม่ครบ กรุณาแยกชุดข้อสอบหรือติดต่อผู้ดูแลระบบ'
                : 'ข้อมูลที่จำเป็นโหลดไม่ครบ จึงยังไม่แสดงรายงานบางส่วนเป็นข้อมูลจริง กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card padding="md">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value.toLocaleString('th-TH')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  )
}

export default async function ProctorReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams])
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const assignment = await getManagedProctorReportAssignment(supabase, user.id, id)
  if (!assignment || assignment.mode !== 'online' || assignment.type !== 'exam') notFound()

  const sessionsResult = await loadRetainedSessions(supabase, assignment.id)
  if (sessionsResult.error) {
    return (
      <ReportLoadError
        assignmentId={assignment.id}
        tooManySessions={sessionsResult.error === 'too_many'}
      />
    )
  }
  const sessions = sessionsResult.data
  if (hasInvalidProctorReportSearchParams(rawSearchParams)) {
    return <ReportFilterError assignmentId={assignment.id} />
  }
  const filters = validatedFilters(parseProctorReportFilters(rawSearchParams), sessions)
  if (!filters) return <ReportFilterError assignmentId={assignment.id} />
  const submissionIds = sessions.map(session => session.submission_id)
  const studentIds = [...new Set(sessions.map(session => session.student_id))]

  // The exact assignment authorization above must succeed before this admin
  // client exists. Both admin queries are constrained to identifiers already
  // returned by RLS-protected proctor sessions for this assignment.
  const admin = createAdminClient()
  const [submissionsResult, namesResult, eventCountResult, pendingCountResult] = await Promise.all([
    loadExactSubmissions(admin, assignment.id, submissionIds),
    loadExactStudentNames(admin, studentIds),
    loadFilteredEventCount(supabase, assignment.id, filters),
    loadPendingEventCount(supabase, assignment.id, filters),
  ])
  if (
    submissionsResult.error
    || namesResult.error
    || eventCountResult.error
    || pendingCountResult.error
  ) {
    return <ReportLoadError assignmentId={assignment.id} />
  }

  const totalEvents = eventCountResult.data
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE))
  const navigableTotalPages = Math.min(totalPages, MAX_PAGE)
  const currentPage = Math.min(filters.page, navigableTotalPages)
  const pageCapExceeded = totalPages > MAX_PAGE
  const viewFilters: ProctorReportFilters = { ...filters, page: currentPage }
  const eventPageResult = await loadEventPage(supabase, assignment.id, filters, currentPage)
  if (eventPageResult.error) return <ReportLoadError assignmentId={assignment.id} />

  const submissions = submissionsResult.data
  const names = namesResult.data
  const events = eventPageResult.data
  const submissionById = new Map(submissions.map(row => [row.id, row]))
  const sessionBySubmission = new Map(sessions.map(row => [row.submission_id, row]))
  const studentNameById = new Map(names.map(row => [
    row.id,
    proctorReportStudentName(row.full_name),
  ]))

  const studentOptions = studentIds
    .map(studentId => ({
      id: studentId,
      name: studentNameById.get(studentId) ?? proctorReportStudentName(null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
  const attemptOptions = sessions
    .filter(session => !filters.studentId || session.student_id === filters.studentId)
    .map(session => {
      const submission = submissionById.get(session.submission_id)
      return {
        id: session.submission_id,
        name: studentNameById.get(session.student_id) ?? proctorReportStudentName(null),
        attemptNumber: submission?.attempt_number ?? null,
        startedAt: submission?.started_at ?? session.started_monitoring_at,
      }
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

  const scopedSessions = sessions.filter(session => (
    (!filters.studentId || session.student_id === filters.studentId)
    && (!filters.submissionId || session.submission_id === filters.submissionId)
  ))
  const scopedStudentCount = new Set(scopedSessions.map(session => session.student_id)).size
  const attemptSummaries = scopedSessions
    .map(session => ({
      session,
      submission: submissionById.get(session.submission_id),
      studentName: studentNameById.get(session.student_id) ?? proctorReportStudentName(null),
    }))
    .sort((a, b) => {
      const aTime = new Date(a.submission?.started_at ?? a.session.started_monitoring_at).getTime()
      const bTime = new Date(b.submission?.started_at ?? b.session.started_monitoring_at).getTime()
      return bTime - aTime
    })
  const visibleAttemptSummaries = attemptSummaries.slice(0, ATTEMPT_SUMMARY_LIMIT)
  const reportPath = `/assignments/${assignment.id}/proctor/report`
  const classroom = classroomName(assignment.classrooms)
  const platformLabels = { windows: 'Windows', macos: 'macOS', ios: 'iOS/iPadOS' } as const

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          render={<Link href={`/assignments/${assignment.id}`} />}
        >
          <ArrowLeft aria-hidden="true" /> กลับหน้าชุดข้อสอบ
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/assignments/${assignment.id}/proctor`} />}
        >
          <Radio aria-hidden="true" /> เปิดห้องคุมสอบสด
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">รายงานสัญญาณคุมสอบ</h1>
          {!assignment.proctoring_enabled && (
            <Badge variant="outline">ปิดการคุมสอบในค่าปัจจุบัน</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {assignment.title} · {classroom}
        </p>
        {!assignment.proctoring_enabled && (
          <p className="mt-1 text-xs text-muted-foreground">
            ข้อมูลที่เคยบันทึกไว้ยังแสดงได้ แม้ตอนนี้จะปิดการคุมสอบสำหรับชุดนี้แล้ว
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          หากยังมี attempt ทำงานอยู่ ข้อมูลอาจเพิ่มขึ้นเมื่อเปิดหรือเปลี่ยนหน้า รายงานนี้ไม่ใช่ snapshot ที่ถูกตรึงไว้
        </p>
      </div>

      <Card padding="md" className="border-warning/30 bg-warning/5">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-foreground">ใช้เป็นข้อมูลประกอบการพิจารณาเท่านั้น</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              เหตุการณ์จากเบราว์เซอร์ไม่ใช่คำตัดสินว่านักเรียนทุจริต การตรวจ Print Screen หมายถึงระบบพบการกดปุ่มเท่านั้น
              ไม่ยืนยันว่าเกิดภาพหน้าจอ และไม่สามารถตรวจการจับภาพระดับระบบได้ครบทุกอุปกรณ์
            </p>
          </div>
        </div>
      </Card>

      <form method="get" action={reportPath}>
        <Card padding="md">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="report-student" className="text-sm font-medium text-foreground">
                นักเรียน
              </label>
              <NativeSelect id="report-student" name="student" defaultValue={filters.studentId ?? ''}>
                <option value="">ทุกคน</option>
                {studentOptions.map(student => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="report-attempt" className="text-sm font-medium text-foreground">
                Attempt
              </label>
              <NativeSelect id="report-attempt" name="submission" defaultValue={filters.submissionId ?? ''}>
                <option value="">ทุก attempt</option>
                {attemptOptions.map(attempt => (
                  <option key={attempt.id} value={attempt.id}>
                    {attempt.name} · {attempt.attemptNumber ? `ครั้งที่ ${attempt.attemptNumber}` : 'ไม่ทราบครั้ง'}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="report-kind" className="text-sm font-medium text-foreground">
                ชนิดเหตุการณ์
              </label>
              <NativeSelect id="report-kind" name="kind" defaultValue={filters.kind}>
                <option value="reviewable">เฉพาะเหตุการณ์ที่ต้องพิจารณา</option>
                <option value="all">ทุกเหตุการณ์ รวมการกลับเข้าหน้าสอบ</option>
                {KNOWN_EVENT_TYPES.map(eventType => (
                  <option key={eventType} value={eventType}>
                    {PROCTOR_EVENT_LABELS[eventType] ?? eventType}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="report-review" className="text-sm font-medium text-foreground">
                การรับทราบ
              </label>
              <NativeSelect id="report-review" name="review" defaultValue={filters.review}>
                <option value="all">ทั้งหมด</option>
                <option value="pending">รอรับทราบ</option>
                <option value="acknowledged">รับทราบแล้ว</option>
              </NativeSelect>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit">ใช้ตัวกรอง</Button>
            <Button variant="outline" render={<Link href={reportPath} />}>ล้างตัวกรอง</Button>
          </div>
        </Card>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="นักเรียนในขอบเขต" value={scopedStudentCount} note="ตามนักเรียน/attempt ที่เลือก" />
        <SummaryCard label="Attempt ในขอบเขต" value={scopedSessions.length} note="ไม่ยุบตามวิธีเก็บคะแนน" />
        <SummaryCard label="เหตุการณ์ตามตัวกรอง" value={totalEvents} note="จำนวนจริงจากฐานข้อมูล" />
        <SummaryCard label="รอรับทราบ" value={pendingCountResult.data} note="ในนักเรียน/attempt ที่เลือก" />
      </div>

      {pageCapExceeded && (
        <Card padding="md" className="border-warning/30 bg-warning/5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-foreground">ตัวกรองนี้มีข้อมูลมากเกินขอบเขตการเปิดทีละหน้า</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                หน้ารายงานเปิดดูได้ถึง {(MAX_PAGE * PAGE_SIZE).toLocaleString('th-TH')} เหตุการณ์ล่าสุดเพื่อจำกัดภาระฐานข้อมูล
                กรุณาเลือกนักเรียน, attempt หรือชนิดเหตุการณ์ให้แคบลงเพื่อเข้าถึงรายการที่เหลือ โดยระบบไม่ได้สรุปว่าข้อมูลส่วนที่เกินไม่มีอยู่
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="font-semibold text-foreground">สรุปราย attempt</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              แสดง attempt แยกกัน แม้ข้อสอบเดียวกันจะมีการทำมากกว่าหนึ่งครั้ง
            </p>
          </div>
          <Badge variant="secondary">{scopedSessions.length.toLocaleString('th-TH')} attempt</Badge>
        </div>
        {visibleAttemptSummaries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <caption className="sr-only">สรุปข้อมูลคุมสอบแยกตาม attempt</caption>
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">นักเรียน / สถานะ</th>
                  <th scope="col" className="px-4 py-3 font-medium">เวลา attempt</th>
                  <th scope="col" className="px-4 py-3 font-medium">ช่องทางเข้าสอบ</th>
                  <th scope="col" className="px-4 py-3 font-medium">ตัวนับสัญญาณ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleAttemptSummaries.map(({ session, submission, studentName }) => (
                  <tr key={session.submission_id}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-foreground">{studentName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {submission?.attempt_number ? `ครั้งที่ ${submission.attempt_number}` : 'ไม่ทราบครั้ง'} · {submissionStatusLabel(submission?.status)}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <p>
                        เริ่ม <time dateTime={submission?.started_at ?? session.started_monitoring_at}>
                          {formatDateTime(submission?.started_at ?? session.started_monitoring_at)}
                        </time>
                      </p>
                      <p className="mt-1 text-xs">
                        {submission?.submitted_at ? (
                          <>ส่ง <time dateTime={submission.submitted_at}>{formatDateTime(submission.submitted_at)}</time></>
                        ) : session.completed_at ? (
                          <>สิ้นสุดการคุมสอบ <time dateTime={session.completed_at}>{formatDateTime(session.completed_at)}</time></>
                        ) : (
                          <>เห็นล่าสุด <time dateTime={session.last_seen_at}>{formatDateTime(session.last_seen_at)}</time></>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <p className="text-foreground">
                        {proctorReportAccessModeLabel(submission?.exam_access_mode ?? session.exam_access_mode)}
                      </p>
                      {session.secure_browser_verified_at && (
                        <p className="mt-1 text-xs">
                          {session.secure_browser_platform
                            ? platformLabels[session.secure_browser_platform]
                            : 'ไม่ทราบแพลตฟอร์ม'}
                          {session.secure_browser_version ? ` · รุ่น ${session.secure_browser_version}` : ''}
                          {' · ยืนยัน '}
                          <time dateTime={session.secure_browser_verified_at}>
                            {formatDateTime(session.secure_browser_verified_at)}
                          </time>
                        </p>
                      )}
                      {session.android_approved_at && (
                        <p className="mt-1 text-xs">
                          ครูอนุมัติ <time dateTime={session.android_approved_at}>
                            {formatDateTime(session.android_approved_at)}
                          </time>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs leading-6 text-muted-foreground">
                      ออกจากแท็บ {session.tab_switch_count} · ออกจากเต็มจอ {session.fullscreen_exit_count} · เสียโฟกัส {session.window_blur_count}<br />
                      คลิปบอร์ด {session.clipboard_attempt_count} · Print Screen {session.screenshot_key_count} · เปิดพร้อมกัน {session.concurrent_connection_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <FileClock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">ไม่พบข้อมูล attempt ที่ยังเก็บอยู่</p>
            <p className="mt-1 text-sm text-muted-foreground">
              อาจยังไม่มีนักเรียนเริ่มสอบ หรือข้อมูลถูกลบตามอายุการเก็บ/การล้างข้อมูลก่อนกำหนด
            </p>
          </div>
        )}
        {attemptSummaries.length > ATTEMPT_SUMMARY_LIMIT && (
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            ตารางนี้แสดง {ATTEMPT_SUMMARY_LIMIT} attempt ล่าสุดจากทั้งหมด {attemptSummaries.length.toLocaleString('th-TH')} attempt
            ใช้ตัวกรองนักเรียนหรือ attempt ด้านบนเพื่อดูเหตุการณ์ของรายการที่ต้องการ
          </p>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="font-semibold text-foreground">ลำดับเหตุการณ์</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              เรียงตามเวลาที่ server บันทึก เวลาเครื่องนักเรียนแสดงเป็นบริบทที่ยังไม่ยืนยัน
            </p>
          </div>
          <Badge variant="outline">หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}</Badge>
        </div>

        {events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <caption className="sr-only">ลำดับเหตุการณ์คุมสอบตามตัวกรอง</caption>
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">เวลาที่ระบบบันทึก</th>
                  <th scope="col" className="px-4 py-3 font-medium">นักเรียน</th>
                  <th scope="col" className="px-4 py-3 font-medium">เหตุการณ์</th>
                  <th scope="col" className="px-4 py-3 font-medium">การรับทราบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map(event => {
                  const session = sessionBySubmission.get(event.submission_id)
                  const submission = submissionById.get(event.submission_id)
                  const reportRow = mapProctorReportEventRow({
                    eventId: event.id,
                    studentName: studentNameById.get(event.student_id) ?? proctorReportStudentName(null),
                    attemptNumber: submission?.attempt_number ?? null,
                    accessMode: submission?.exam_access_mode ?? session?.exam_access_mode ?? null,
                    eventType: event.event_type,
                    createdAt: event.created_at,
                    occurredAtClient: event.occurred_at_client,
                    acknowledgedAt: event.acknowledged_at,
                  })
                  return (
                    <tr key={event.id}>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        <time dateTime={reportRow.serverTimestamp || undefined} className="font-medium text-foreground">
                          {formatDateTime(reportRow.serverTimestamp)}
                        </time>
                        {reportRow.clientTimestampUntrusted && (
                          <p className="mt-1 text-xs">
                            จากเครื่อง (ไม่ยืนยัน):{' '}
                            <time dateTime={reportRow.clientTimestampUntrusted}>
                              {formatDateTime(reportRow.clientTimestampUntrusted)}
                            </time>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-foreground">{reportRow.studentName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {reportRow.attemptNumber ? `ครั้งที่ ${reportRow.attemptNumber}` : 'ไม่ทราบครั้ง'} · {reportRow.accessMode}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-foreground">{reportRow.eventLabel}</p>
                        <code className="mt-1 block text-xs text-muted-foreground">
                          {reportRow.eventType} · อ้างอิง #{reportRow.eventId ?? '—'}
                        </code>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge
                          variant={reportRow.acknowledgementStatus === 'รับทราบแล้ว' ? 'secondary' : 'outline'}
                          className={reportRow.acknowledgementStatus === 'รอรับทราบ' ? 'text-warning' : undefined}
                        >
                          {reportRow.acknowledgementStatus}
                        </Badge>
                        {reportRow.acknowledgedAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            <time dateTime={reportRow.acknowledgedAt}>{formatDateTime(reportRow.acknowledgedAt)}</time>
                          </p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Clock3 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">ไม่พบข้อมูลที่ยังเก็บอยู่ตามตัวกรองนี้</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ข้อมูลอาจไม่เคยถูกบันทึก ถูกลบเมื่อครบอายุการเก็บ หรือถูกครูล้างก่อนกำหนด จึงไม่ควรตีความว่าไม่มีเหตุการณ์เกิดขึ้น
            </p>
          </div>
        )}

        {totalEvents > 0 && (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"
            aria-label="เปลี่ยนหน้ารายงานสัญญาณคุมสอบ"
          >
            {currentPage > 1 ? (
              <Button
                variant="outline"
                render={<Link href={buildProctorReportHref(reportPath, viewFilters, { page: currentPage - 1 })} />}
              >
                <ChevronLeft aria-hidden="true" /> ก่อนหน้า
              </Button>
            ) : <span />}
            <span className="text-sm text-muted-foreground">
              แสดง {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString('th-TH')}–{Math.min(currentPage * PAGE_SIZE, totalEvents).toLocaleString('th-TH')}
              {' '}จาก {totalEvents.toLocaleString('th-TH')} เหตุการณ์
            </span>
            {currentPage < navigableTotalPages ? (
              <Button
                variant="outline"
                render={<Link href={buildProctorReportHref(reportPath, viewFilters, { page: currentPage + 1 })} />}
              >
                ถัดไป <ChevronRight aria-hidden="true" />
              </Button>
            ) : <span />}
          </nav>
        )}
      </Card>

      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="font-semibold text-foreground">การเก็บและส่งออกข้อมูล</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              ข้อมูลคุมสอบถูกลบอัตโนมัติเมื่อไม่มี heartbeat เกิน 90 วัน และครูอาจล้างก่อนกำหนดได้
              CSV จะดึงทุกเหตุการณ์ตามตัวกรองปัจจุบันใหม่จาก server ไม่ใช่เฉพาะหน้าที่เห็น จำกัด {EXPORT_LIMIT.toLocaleString('th-TH')} แถว, {ATTEMPT_LIMIT.toLocaleString('th-TH')} attempts และ {Math.floor(EXPORT_MAX_BYTES / 1024 / 1024)} MiB
              ไฟล์มีชื่อนักเรียนและเป็นข้อมูลการศึกษา สามารถแก้ไขต่อได้และไม่ใช่หลักฐานรับรองการทุจริต
              การล้างข้อมูลหรือครบอายุ 90 วันใน KorKru จะไม่ลบสำเนาที่ดาวน์โหลดแล้ว จึงต้องจำกัดผู้เข้าถึงและลบเองเมื่อหมดวัตถุประสงค์
            </p>
          </div>
          <ProctorReportExportButton
            assignmentId={assignment.id}
            filters={{
              studentId: filters.studentId,
              submissionId: filters.submissionId,
              kind: filters.kind,
              review: filters.review,
            }}
          />
        </div>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
        รายงานนี้ไม่รวมคำตอบ คะแนน อีเมล IP user-agent หรือข้อมูลระบุตัวอุปกรณ์
      </p>
    </div>
  )
}

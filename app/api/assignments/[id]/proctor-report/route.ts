import { getAuthUser } from '@/lib/auth/server'
import {
  ATTEMPT_LIMIT,
  EXPORT_LIMIT,
  buildProctorReportFilename,
  compareProctorReportEventRowsNewestFirst,
  encodeRfc5987Filename,
  isUuid,
  mapProctorReportEventRow,
  proctorReportStudentName,
  serializeProctorReportCsv,
  type ProctorReportExportFilters,
} from '@/lib/exam-proctor-report'
import { PROCTOR_REVIEW_EVENT_TYPES } from '@/lib/exam-proctor-alerts'
import { getManagedProctorReportAssignment } from '@/lib/exam-proctor-report-server'
import { parseProctorReportExportRequest } from '@/lib/exam-proctor-report-request'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EVENT_FETCH_SIZE = 1_000
const LOOKUP_CHUNK_SIZE = 200

interface ExportEventRow {
  id: number
  submission_id: string
  student_id: string
  event_type: string
  occurred_at_client: string | null
  created_at: string
  acknowledged_at: string | null
}

interface ExportSubmissionRow {
  id: string
  student_id: string
  attempt_number: number | null
  exam_access_mode: string | null
}

interface RetainedSessionIdentityRow {
  submission_id: string
  student_id: string
}

type SessionClient = Awaited<ReturnType<typeof createClient>>

interface ChainableEventQuery {
  eq(column: string, value: string | number): ChainableEventQuery
  in(column: string, values: readonly string[]): ChainableEventQuery
  is(column: string, value: null): ChainableEventQuery
  not(column: string, operator: string, value: null): ChainableEventQuery
}

function applyEventFilters<T>(query: T, filters: ProctorReportExportFilters): T {
  let filtered = query as unknown as ChainableEventQuery
  if (filters.studentId) filtered = filtered.eq('student_id', filters.studentId)
  if (filters.submissionId) filtered = filtered.eq('submission_id', filters.submissionId)

  if (filters.kind === 'reviewable') {
    filtered = filtered.in('event_type', PROCTOR_REVIEW_EVENT_TYPES)
  } else if (filters.kind !== 'all') {
    filtered = filtered.eq('event_type', filters.kind)
  }

  if (filters.review === 'pending') {
    // Lifecycle rows also have a null acknowledgement, but they are not work
    // waiting for a teacher. Keep pending scoped to reviewable signals.
    filtered = filtered
      .in('event_type', PROCTOR_REVIEW_EVENT_TYPES)
      .is('acknowledged_at', null)
  } else if (filters.review === 'acknowledged') {
    filtered = filtered
      .in('event_type', PROCTOR_REVIEW_EVENT_TYPES)
      .not('acknowledged_at', 'is', null)
  }

  return filtered as unknown as T
}

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size))
  }
  return result
}

type ExactSessionIdentityResult =
  | { data: Map<string, string>; error: null }
  | { data: null; error: 'query_failed' | 'changed' }

async function loadExactRetainedSessionIdentities(
  supabase: SessionClient,
  assignmentId: string,
  submissionIds: string[],
): Promise<ExactSessionIdentityResult> {
  const expectedIds = new Set(submissionIds)
  const rows: RetainedSessionIdentityRow[] = []

  for (const submissionIdChunk of chunks(submissionIds, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('exam_proctor_sessions')
      .select('submission_id, student_id')
      .eq('assignment_id', assignmentId)
      .in('submission_id', submissionIdChunk)
    if (error) return { data: null, error: 'query_failed' }
    rows.push(...((data ?? []) as RetainedSessionIdentityRow[]))
  }

  const returnedIds = new Set(rows.map(row => row.submission_id))
  if (
    rows.length !== returnedIds.size
    || returnedIds.size !== expectedIds.size
    || [...returnedIds].some(id => !expectedIds.has(id))
  ) {
    return { data: null, error: 'changed' }
  }

  return {
    data: new Map(rows.map(row => [row.submission_id, row.student_id])),
    error: null,
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return jsonError('ข้อมูลชุดข้อสอบไม่ถูกต้อง', 400)

  const user = await getAuthUser()
  if (!user) return jsonError('กรุณาเข้าสู่ระบบก่อนดาวน์โหลดรายงาน', 401)

  const filters = await parseProctorReportExportRequest(request)
  if (!filters) return jsonError('ตัวกรองรายงานไม่ถูกต้อง', 400)

  const supabase = await createClient()
  const assignment = await getManagedProctorReportAssignment(supabase, user.id, id)
  if (!assignment || assignment.mode !== 'online' || assignment.type !== 'exam') {
    return jsonError('ไม่พบชุดข้อสอบหรือไม่มีสิทธิ์ส่งออกรายงาน', 404)
  }

  if (filters.submissionId || filters.studentId) {
    let selectedSessionQuery = supabase
      .from('exam_proctor_sessions')
      .select('submission_id, student_id')
      .eq('assignment_id', assignment.id)
      .limit(1)
    selectedSessionQuery = filters.submissionId
      ? selectedSessionQuery.eq('submission_id', filters.submissionId)
      : selectedSessionQuery.eq('student_id', filters.studentId!)
    const { data: selectedSession, error: selectedSessionError } = await selectedSessionQuery
      .maybeSingle()
    if (selectedSessionError) {
      return jsonError('ตรวจสอบขอบเขตรายงานไม่สำเร็จ กรุณาลองใหม่', 500)
    }
    if (
      !selectedSession
      || (filters.studentId && selectedSession.student_id !== filters.studentId)
    ) {
      return jsonError('ตัวกรองนักเรียนหรือครั้งที่ทำไม่อยู่ในข้อมูลคุมสอบที่ยังเก็บไว้', 400)
    }
  }

  // One database statement captures both the filtered count and its highest
  // event ID. Later inserts have higher IDs and are left for the next export.
  const exportedAt = new Date().toISOString()
  let maxEventQuery = supabase
    .from('exam_proctor_events')
    .select('id', { count: 'exact' })
    .eq('assignment_id', assignment.id)
  maxEventQuery = applyEventFilters(maxEventQuery, filters)
  const {
    data: maxEvent,
    error: maxEventError,
    count: initialEventCount,
  } = await maxEventQuery
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxEventError || initialEventCount === null) {
    return jsonError('อ่านข้อมูลคุมสอบไม่สำเร็จ กรุณาลองใหม่', 500)
  }

  if (
    maxEvent
    && (typeof maxEvent.id !== 'number' || !Number.isSafeInteger(maxEvent.id))
  ) {
    return jsonError('ตรวจสอบขอบเขตข้อมูลคุมสอบไม่สำเร็จ กรุณาลองใหม่', 500)
  }
  const maxEventId = maxEvent?.id ?? null
  const eventCount = initialEventCount

  if (eventCount > EXPORT_LIMIT) {
    return jsonError(
      `ยังไม่ได้สร้างไฟล์ เพราะพบมากกว่า ${EXPORT_LIMIT.toLocaleString('th-TH')} เหตุการณ์ กรุณาเลือกนักเรียนหรือครั้งที่ทำให้แคบลง`,
      413,
    )
  }

  const events: ExportEventRow[] = []
  let lastEventId = 0
  while (maxEventId !== null && events.length < eventCount) {
    let pageQuery = supabase
      .from('exam_proctor_events')
      .select('id, submission_id, student_id, event_type, occurred_at_client, created_at, acknowledged_at')
      .eq('assignment_id', assignment.id)
      .lte('id', maxEventId)
      .gt('id', lastEventId)
    pageQuery = applyEventFilters(pageQuery, filters)
    const { data: pageRows, error: pageError } = await pageQuery
      .order('id', { ascending: true })
      .limit(EVENT_FETCH_SIZE)
    if (pageError) return jsonError('เตรียมข้อมูลคุมสอบไม่สำเร็จ กรุณาลองใหม่', 500)

    const rows = (pageRows ?? []) as ExportEventRow[]
    if (rows.length === 0) break
    const nextLastId = rows.at(-1)?.id
    if (
      typeof nextLastId !== 'number'
      || !Number.isSafeInteger(nextLastId)
      || nextLastId <= lastEventId
    ) {
      return jsonError('ข้อมูลคุมสอบเปลี่ยนระหว่างเตรียมไฟล์ กรุณาลองใหม่', 409)
    }
    events.push(...rows)
    lastEventId = nextLastId
  }

  // Acknowledgement filters can change while an export is being generated.
  // Never return a silently partial file when the preflight count no longer
  // matches the rows that were actually read.
  if (events.length !== eventCount) {
    return jsonError('ข้อมูลคุมสอบเปลี่ยนระหว่างเตรียมไฟล์ กรุณาลองใหม่', 409)
  }

  const submissionIds = [...new Set(events.map(event => event.submission_id))]
  if (submissionIds.length > ATTEMPT_LIMIT) {
    return jsonError(
      `ยังไม่ได้สร้างไฟล์ เพราะพบมากกว่า ${ATTEMPT_LIMIT.toLocaleString('th-TH')} attempt กรุณาเลือกนักเรียนหรือครั้งที่ทำให้แคบลง`,
      413,
    )
  }

  // Re-read every event-derived attempt through the manager's RLS session
  // before any admin lookup. Retention or authorization changes abort the
  // whole export instead of widening the identity-resolution boundary.
  const retainedSessionsResult = await loadExactRetainedSessionIdentities(
    supabase,
    assignment.id,
    submissionIds,
  )
  if (retainedSessionsResult.error !== null) {
    return retainedSessionsResult.error === 'changed'
      ? jsonError('ข้อมูลคุมสอบเปลี่ยนระหว่างเตรียมไฟล์ กรุณาลองใหม่', 409)
      : jsonError('ตรวจสอบขอบเขตข้อมูลคุมสอบไม่สำเร็จ กรุณาลองใหม่', 500)
  }
  const retainedStudentBySubmission = retainedSessionsResult.data
  if (events.some(event => (
    retainedStudentBySubmission.get(event.submission_id) !== event.student_id
  ))) {
    return jsonError('ข้อมูลคุมสอบเปลี่ยนระหว่างเตรียมไฟล์ กรุณาลองใหม่', 409)
  }

  const studentIds = [...new Set(retainedStudentBySubmission.values())]
  const submissions: ExportSubmissionRow[] = []
  const names = new Map<string, string>()

  // Admin access begins only after exact manager authorization and after all
  // exported attempt/student pairs have been revalidated through session RLS.
  const admin = createAdminClient()

  for (const submissionIdChunk of chunks(submissionIds, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await admin
      .from('submissions')
      .select('id, student_id, attempt_number, exam_access_mode')
      .eq('assignment_id', assignment.id)
      .in('id', submissionIdChunk)
    if (error) return jsonError('อ่านข้อมูลครั้งที่ทำไม่สำเร็จ กรุณาลองใหม่', 500)
    submissions.push(...((data ?? []) as ExportSubmissionRow[]))
  }

  for (const studentIdChunk of chunks(studentIds, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await admin
      .from('users')
      .select('id, full_name')
      .in('id', studentIdChunk)
    if (error) return jsonError('อ่านชื่อนักเรียนไม่สำเร็จ กรุณาลองใหม่', 500)
    for (const row of data ?? []) {
      names.set(row.id, proctorReportStudentName(row.full_name))
    }
  }

  const submissionById = new Map(submissions.map(submission => [submission.id, submission]))
  if (
    submissions.length !== submissionById.size
    || submissionById.size !== submissionIds.length
    || submissionIds.some(submissionId => !submissionById.has(submissionId))
  ) {
    return jsonError('ตรวจสอบข้อมูลครั้งที่ทำไม่สำเร็จ กรุณาลองใหม่', 500)
  }
  if (
    names.size !== studentIds.length
    || studentIds.some(studentId => !names.has(studentId))
  ) {
    return jsonError('ตรวจสอบชื่อนักเรียนไม่สำเร็จ กรุณาลองใหม่', 500)
  }
  const everyEventMatchesAttempt = events.every(event => {
    const submission = submissionById.get(event.submission_id)
    return submission?.student_id === event.student_id
  })
  if (!everyEventMatchesAttempt) {
    return jsonError('ตรวจสอบขอบเขตข้อมูลคุมสอบไม่สำเร็จ กรุณาลองใหม่', 500)
  }

  const csvRows = events.map(event => {
    const submission = submissionById.get(event.submission_id)!
    return mapProctorReportEventRow({
      eventId: event.id,
      studentName: names.get(event.student_id) ?? 'ไม่พบชื่อนักเรียน',
      attemptNumber: submission.attempt_number,
      accessMode: submission.exam_access_mode,
      eventType: event.event_type,
      createdAt: event.created_at,
      occurredAtClient: event.occurred_at_client,
      acknowledgedAt: event.acknowledged_at,
    })
  }).sort(compareProctorReportEventRowsNewestFirst)

  let csv: string
  try {
    csv = serializeProctorReportCsv(csvRows)
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonError(
        'ยังไม่ได้สร้างไฟล์ เพราะขนาดรายงานเกิน 4 MiB กรุณาเลือกนักเรียนหรือครั้งที่ทำให้แคบลง',
        413,
      )
    }
    return jsonError('สร้างไฟล์ CSV ไม่สำเร็จ กรุณาลองใหม่', 500)
  }

  const fileName = buildProctorReportFilename(assignment.title, exportedAt)

  return new Response(csv, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': `attachment; filename="KorKru-proctor-report.csv"; filename*=UTF-8''${encodeRfc5987Filename(fileName)}`,
      'Content-Type': 'text/csv; charset=utf-8',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

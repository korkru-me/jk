'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  MonitorCheck,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Settings,
  ShieldAlert,
  LockKeyhole,
  Smartphone,
  Trash2,
  UserCheck,
  UserX,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { purgeAssignmentProctorData } from '@/lib/actions/exam-proctor'
import { reviewAndroidExamAccess, type AndroidApprovalView } from '@/lib/actions/android-exam'
import {
  EXAM_PROCTOR_RETENTION_DAYS,
  totalPurgedProctorRecords,
} from '@/lib/exam-proctor-retention'
import {
  applyProctorEventChanges,
  applyProctorSessionChanges,
  proctorDashboardConnectionMode,
  PROCTOR_FALLBACK_POLL_MS,
  PROCTOR_LIVE_RECONCILE_MS,
  type ProctorDashboardConnectionMode,
  type ProctorEventChange,
  type ProctorEventRow,
  type ProctorSessionChange,
  type ProctorSessionRow,
} from '@/lib/exam-proctor-realtime'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'

export interface ProctorParticipant {
  studentId: string
  name: string
  submissionId: string | null
  submissionStatus: string
  startedAt: string | null
  submittedAt: string | null
}

interface AssignmentSummary {
  id: string
  title: string
  classroomName: string
  enabled: boolean
  fullscreenRequired: boolean
  blockClipboard: boolean
  secureBrowserRequired: boolean
  androidMonitoredAllowed: boolean
}

interface Props {
  assignment: AssignmentSummary
  initialParticipants: ProctorParticipant[]
  initialSessions: ProctorSessionRow[]
  initialEvents: ProctorEventRow[]
  initialAndroidApprovals: AndroidApprovalView[]
}

const ACTIVE_WINDOW_MS = 45_000
const PROCTOR_SESSION_SELECT = 'submission_id, org_id, assignment_id, student_id, started_monitoring_at, last_seen_at, is_online, is_tab_visible, is_fullscreen, completed_at, tab_switch_count, fullscreen_exit_count, window_blur_count, clipboard_attempt_count, screenshot_key_count, active_connection_count, concurrent_connection_count, secure_browser_verified_at, secure_browser_platform, secure_browser_version, exam_access_mode, android_approved_at, android_approved_by, last_event_type, last_event_at, created_at, updated_at'
const PROCTOR_EVENT_SELECT = 'id, org_id, assignment_id, submission_id, student_id, event_type, occurred_at_client, created_at'
const ANDROID_APPROVAL_SELECT = 'id, assignment_id, student_id, status, requested_at, reviewed_at, reviewed_by, expires_at, updated_at'

type AndroidApprovalChange =
  | { type: 'upsert'; row: AndroidApprovalView }
  | { type: 'delete'; studentId: string }

function applyAndroidApprovalChanges(
  current: AndroidApprovalView[],
  changes: AndroidApprovalChange[],
): AndroidApprovalView[] {
  const byStudent = new Map(current.map(row => [row.student_id, row]))
  for (const change of changes) {
    if (change.type === 'delete') byStudent.delete(change.studentId)
    else byStudent.set(change.row.student_id, change.row)
  }
  return [...byStudent.values()].sort(
    (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
  )
}

const EVENT_LABELS: Record<string, string> = {
  monitoring_started: 'เริ่มเชื่อมต่อห้องคุมสอบ',
  tab_hidden: 'ออกจากแท็บข้อสอบ',
  tab_visible: 'กลับเข้าแท็บข้อสอบ',
  fullscreen_entered: 'กลับเข้าเต็มจอ',
  fullscreen_exited: 'ออกจากเต็มจอ',
  window_blur: 'หน้าต่างเสียโฟกัส',
  window_focus: 'กลับมาที่หน้าต่างข้อสอบ',
  copy_attempt: 'พยายามคัดลอก',
  cut_attempt: 'พยายามตัดข้อความ',
  paste_attempt: 'พยายามวางข้อความ',
  context_menu_attempt: 'เปิดเมนูคลิกขวา',
  screenshot_key: 'กดปุ่ม Print Screen',
  concurrent_connection: 'ตรวจพบหน้าสอบเปิดพร้อมกันหลายจุด',
}

const SEB_PLATFORM_LABELS = {
  windows: 'Windows',
  macos: 'macOS',
  ios: 'iOS',
} as const

const REVIEW_EVENT_TYPES = new Set([
  'tab_hidden',
  'fullscreen_exited',
  'window_blur',
  'copy_attempt',
  'cut_attempt',
  'paste_attempt',
  'context_menu_attempt',
  'screenshot_key',
  'concurrent_connection',
])

function formatTime(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function sessionHasFlags(session: ProctorSessionRow): boolean {
  return session.tab_switch_count > 0
    || session.fullscreen_exit_count > 0
    || session.window_blur_count > 0
    || session.clipboard_attempt_count > 0
    || session.screenshot_key_count > 0
    || session.concurrent_connection_count > 0
}

export function ProctorDashboard({
  assignment,
  initialParticipants,
  initialSessions,
  initialEvents,
  initialAndroidApprovals,
}: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [sessions, setSessions] = useState(initialSessions)
  const [events, setEvents] = useState(initialEvents)
  const [androidApprovals, setAndroidApprovals] = useState(initialAndroidApprovals)
  const [connectionMode, setConnectionMode] = useState<ProctorDashboardConnectionMode>('connecting')
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false)
  const [snapshotError, setSnapshotError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isPurging, startPurgeTransition] = useTransition()
  const [isReviewing, startReviewTransition] = useTransition()
  const [reviewingStudentId, setReviewingStudentId] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const snapshotInFlightRef = useRef(false)
  const pendingSessionChangesRef = useRef<ProctorSessionChange[]>([])
  const pendingEventChangesRef = useRef<ProctorEventChange[]>([])
  const pendingApprovalChangesRef = useRef<AndroidApprovalChange[]>([])

  const refreshSnapshot = useCallback(async () => {
    if (!assignment.enabled || snapshotInFlightRef.current) return
    snapshotInFlightRef.current = true
    pendingSessionChangesRef.current = []
    pendingEventChangesRef.current = []
    pendingApprovalChangesRef.current = []
    setSnapshotRefreshing(true)
    setSnapshotError(false)

    try {
      const [sessionsResult, eventsResult, approvalsResult] = await Promise.all([
        supabase
          .from('exam_proctor_sessions')
          .select(PROCTOR_SESSION_SELECT)
          .eq('assignment_id', assignment.id)
          .order('last_seen_at', { ascending: false }),
        supabase
          .from('exam_proctor_events')
          .select(PROCTOR_EVENT_SELECT)
          .eq('assignment_id', assignment.id)
          .order('created_at', { ascending: false })
          .limit(100),
        assignment.androidMonitoredAllowed
          ? supabase
              .from('exam_android_approvals')
              .select(ANDROID_APPROVAL_SELECT)
              .eq('assignment_id', assignment.id)
              .order('requested_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (sessionsResult.error || eventsResult.error || approvalsResult.error) {
        setSnapshotError(true)
        return
      }

      // Reapply changes delivered after these queries started. React then
      // processes any later Realtime callback after this replacement, so a
      // slow snapshot can never roll a newer heartbeat/event backwards.
      const sessionChanges = [...pendingSessionChangesRef.current]
      const eventChanges = [...pendingEventChangesRef.current]
      const approvalChanges = [...pendingApprovalChangesRef.current]
      setSessions(applyProctorSessionChanges(
        (sessionsResult.data ?? []) as unknown as ProctorSessionRow[],
        sessionChanges,
      ))
      setEvents(applyProctorEventChanges(
        (eventsResult.data ?? []) as unknown as ProctorEventRow[],
        eventChanges,
      ))
      setAndroidApprovals(applyAndroidApprovalChanges(
        (approvalsResult.data ?? []) as unknown as AndroidApprovalView[],
        approvalChanges,
      ))
    } catch {
      setSnapshotError(true)
    } finally {
      snapshotInFlightRef.current = false
      pendingSessionChangesRef.current = []
      pendingEventChangesRef.current = []
      pendingApprovalChangesRef.current = []
      setSnapshotRefreshing(false)
    }
  }, [assignment.androidMonitoredAllowed, assignment.enabled, assignment.id, supabase])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!assignment.enabled) return
    const channel = supabase
      .channel(`exam-proctor:${assignment.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_proctor_sessions',
          filter: `assignment_id=eq.${assignment.id}`,
        },
        payload => {
          let change: ProctorSessionChange | null = null
          if (payload.eventType === 'DELETE') {
            const previous = payload.old as Pick<ProctorSessionRow, 'submission_id'>
            if (previous?.submission_id) change = { type: 'delete', submissionId: previous.submission_id }
          } else {
            const next = payload.new as ProctorSessionRow
            if (next?.submission_id) change = { type: 'upsert', row: next }
          }
          if (!change) return
          if (snapshotInFlightRef.current) pendingSessionChangesRef.current.push(change)
          setSessions(current => applyProctorSessionChanges(current, [change]))
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_proctor_events',
          filter: `assignment_id=eq.${assignment.id}`,
        },
        payload => {
          let change: ProctorEventChange | null = null
          if (payload.eventType === 'DELETE') {
            const previous = payload.old as Pick<ProctorEventRow, 'id'>
            if (previous?.id) change = { type: 'delete', eventId: previous.id }
          } else {
            const next = payload.new as ProctorEventRow
            if (next?.id) change = { type: 'upsert', row: next }
          }
          if (!change) return
          if (snapshotInFlightRef.current) pendingEventChangesRef.current.push(change)
          setEvents(current => applyProctorEventChanges(current, [change]))
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_android_approvals',
          filter: `assignment_id=eq.${assignment.id}`,
        },
        payload => {
          let change: AndroidApprovalChange | null = null
          if (payload.eventType === 'DELETE') {
            const previous = payload.old as Pick<AndroidApprovalView, 'student_id'>
            if (previous?.student_id) change = { type: 'delete', studentId: previous.student_id }
          } else {
            const next = payload.new as AndroidApprovalView
            if (next?.student_id) change = { type: 'upsert', row: next }
          }
          if (!change) return
          if (snapshotInFlightRef.current) pendingApprovalChangesRef.current.push(change)
          setAndroidApprovals(current => applyAndroidApprovalChanges(current, [change]))
        },
      )
      .subscribe(status => {
        const nextMode = proctorDashboardConnectionMode(status)
        setConnectionMode(nextMode)
        if (nextMode === 'live') void refreshSnapshot()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [assignment.enabled, assignment.id, refreshSnapshot, supabase])

  useEffect(() => {
    if (!assignment.enabled) return
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refreshSnapshot()
    }
    const timer = setInterval(
      refreshIfVisible,
      connectionMode === 'live' ? PROCTOR_LIVE_RECONCILE_MS : PROCTOR_FALLBACK_POLL_MS,
    )
    document.addEventListener('visibilitychange', refreshIfVisible)
    if (connectionMode !== 'live') refreshIfVisible()
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [assignment.enabled, connectionMode, refreshSnapshot])

  const participantByStudent = useMemo(
    () => new Map(initialParticipants.map(participant => [participant.studentId, participant])),
    [initialParticipants],
  )

  const latestSessionByStudent = useMemo(() => {
    const map = new Map<string, ProctorSessionRow>()
    for (const session of [...sessions].sort(
      (a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
    )) {
      if (!map.has(session.student_id)) map.set(session.student_id, session)
    }
    return map
  }, [sessions])

  const androidApprovalByStudent = useMemo(
    () => new Map(androidApprovals.map(approval => [approval.student_id, approval])),
    [androidApprovals],
  )

  const allStudentIds = useMemo(() => {
    const ids = new Set(initialParticipants.map(participant => participant.studentId))
    for (const session of sessions) ids.add(session.student_id)
    for (const approval of androidApprovals) ids.add(approval.student_id)
    return [...ids]
  }, [androidApprovals, initialParticipants, sessions])

  const rows = allStudentIds.map(studentId => {
    const participant = participantByStudent.get(studentId)
    const session = latestSessionByStudent.get(studentId)
    const androidApproval = androidApprovalByStudent.get(studentId)
    const active = Boolean(
      session
      && !session.completed_at
      && session.is_online
      && now - new Date(session.last_seen_at).getTime() <= ACTIVE_WINDOW_MS,
    )
    return {
      studentId,
      name: participant?.name ?? 'นักเรียน',
      participant,
      session,
      androidApproval,
      active,
      flagged: session ? sessionHasFlags(session) : false,
      completed: Boolean(session?.completed_at || participant?.submissionStatus === 'submitted' || participant?.submissionStatus === 'graded'),
    }
  }).sort((a, b) => {
    const aPending = a.androidApproval?.status === 'pending'
    const bPending = b.androidApproval?.status === 'pending'
    if (aPending !== bPending) return aPending ? -1 : 1
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name, 'th')
  })

  const activeCount = rows.filter(row => row.active).length
  const flaggedCount = rows.filter(row => row.flagged).length
  const completedCount = rows.filter(row => row.completed).length
  const offlineCount = rows.filter(row => row.session && !row.active && !row.completed).length
  const concurrentCount = rows.filter(row => (row.session?.concurrent_connection_count ?? 0) > 0).length
  const pendingAndroidRows = rows.filter(row => row.androidApproval?.status === 'pending')
  const isRealtimeLive = connectionMode === 'live'
  const connectionLabel = isRealtimeLive
    ? 'รับข้อมูลสดแล้ว'
    : snapshotError
      ? 'ตรวจข้อมูลสำรองไม่สำเร็จ'
      : connectionMode === 'fallback'
        ? 'ใช้การตรวจซ้ำอัตโนมัติ'
        : 'กำลังเชื่อมต่อข้อมูลสด'

  async function handlePurge() {
    const ok = await confirm({
      title: 'ล้างข้อมูลคุมสอบของชุดนี้?',
      description: (
        <span>
          เหตุการณ์ ตัวนับสถานะ และข้อมูลการเชื่อมต่อจะถูกลบถาวร แต่คำตอบ คะแนน และประวัติการส่งข้อสอบยังอยู่ครบ
        </span>
      ),
      confirmLabel: 'ล้างข้อมูลคุมสอบ',
      variant: 'destructive',
    })
    if (!ok) return

    startPurgeTransition(async () => {
      const result = await purgeAssignmentProctorData(assignment.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }

      setSessions([])
      setEvents([])
      const totalDeleted = totalPurgedProctorRecords(result.deleted)
      toast.success(totalDeleted > 0
        ? `ล้างข้อมูลคุมสอบแล้ว ${totalDeleted} รายการ`
        : 'ไม่มีข้อมูลคุมสอบที่ต้องล้าง')
      router.refresh()
    })
  }

  function handleAndroidReview(studentId: string, decision: 'approve' | 'deny') {
    setReviewingStudentId(studentId)
    startReviewTransition(async () => {
      const result = await reviewAndroidExamAccess(assignment.id, studentId, decision)
      setReviewingStudentId(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setAndroidApprovals(current => current.map(approval => (
        approval.student_id === studentId
          ? {
              ...approval,
              status: result.status,
              reviewed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : approval
      )))
      toast.success(decision === 'approve' ? 'อนุมัติให้เข้าสอบแล้ว' : 'ปฏิเสธคำขอแล้ว')
      void refreshSnapshot()
    })
  }

  if (!assignment.enabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-8">
        <Button nativeButton={false} variant="ghost" render={<Link href={`/assignments/${assignment.id}`} />}>
          <ArrowLeft aria-hidden="true" /> กลับหน้าชุดข้อสอบ
        </Button>
        <Card padding="2xl" className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
            <MonitorCheck className="size-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">ข้อสอบนี้ยังไม่ได้เปิดห้องคุมสอบสด</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            เปิดได้จากหน้าตั้งค่าชุดข้อสอบ แล้วระบบจะเริ่มรับเฉพาะสัญญาณจากเบราว์เซอร์เมื่อนักเรียนเริ่มทำครั้งถัดไป
          </p>
          <Button nativeButton={false} className="mt-5" render={<Link href={`/assignments/${assignment.id}/edit`} />}>
            <Settings aria-hidden="true" /> ไปตั้งค่าชุดข้อสอบ
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button nativeButton={false} variant="ghost" render={<Link href={`/assignments/${assignment.id}`} />}>
            <ArrowLeft aria-hidden="true" /> กลับหน้าชุดข้อสอบ
          </Button>
          <div className="mt-2 flex items-center gap-2">
            <Radio className="size-5 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">ห้องคุมสอบสด</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{assignment.title} · {assignment.classroomName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={isRealtimeLive ? 'secondary' : 'outline'}
            className={isRealtimeLive ? 'text-success' : snapshotError ? 'text-destructive' : 'text-warning'}
          >
            {isRealtimeLive ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
            {connectionLabel}
          </Badge>
          {!isRealtimeLive && (
            <Button type="button" size="sm" variant="outline" onClick={() => void refreshSnapshot()} disabled={snapshotRefreshing}>
              <RefreshCw className={snapshotRefreshing ? 'animate-spin' : undefined} aria-hidden="true" />
              {snapshotRefreshing ? 'กำลังตรวจ…' : 'ตรวจข้อมูลล่าสุด'}
            </Button>
          )}
          {assignment.fullscreenRequired && <Badge variant="outline"><Maximize aria-hidden="true" /> บังคับเต็มจอ</Badge>}
          {assignment.blockClipboard && <Badge variant="outline"><ShieldAlert aria-hidden="true" /> ปิดคัดลอก/วาง</Badge>}
          {assignment.secureBrowserRequired && <Badge variant="secondary" className="text-success"><LockKeyhole aria-hidden="true" /> บังคับ SEB</Badge>}
          {assignment.androidMonitoredAllowed && <Badge variant="outline" className="text-warning"><Smartphone aria-hidden="true" /> Android ต้องอนุมัติ</Badge>}
        </div>
      </div>

      <Card padding="md" className="border-warning/30 bg-warning/5">
        <div className="flex gap-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-muted-foreground">
            เหตุการณ์เหล่านี้เป็นสัญญาณให้ครูพิจารณาร่วมกับบริบท ไม่ใช่ข้อสรุปว่านักเรียนทุจริต
            {assignment.secureBrowserRequired
              ? assignment.androidMonitoredAllowed
                ? ' SEB เป็นทางหลัก ส่วน Android เป็นโหมดเว็บที่ความมั่นใจต่ำกว่า ครูต้องตรวจเครื่องจริงก่อนอนุมัติ และเว็บกันภาพแคประดับระบบไม่ได้'
                : ' สถานะ SEB ยืนยันการตั้งค่าและเวอร์ชันที่อนุญาต แต่ยังไม่ใช่หลักฐานว่าทุจริตหรือไม่ทุจริต'
              : ' เบราว์เซอร์ไม่สามารถกันภาพถ่ายหน้าจอหรือควบคุมอุปกรณ์อื่นได้ทั้งหมด'}
          </p>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">เก็บข้อมูลคุมสอบไม่เกิน {EXAM_PROCTOR_RETENTION_DAYS} วัน</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ระบบลบอัตโนมัติหลังไม่มี heartbeat ตามระยะที่กำหนด การล้างส่วนนี้ไม่กระทบคำตอบ คะแนน หรือ submission
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handlePurge}
            disabled={isPurging || activeCount > 0}
            className="shrink-0 text-destructive"
          >
            <Trash2 aria-hidden="true" />
            {isPurging ? 'กำลังล้าง…' : activeCount > 0 ? 'รอให้นักเรียนออฟไลน์' : 'ล้างข้อมูลคุมสอบ'}
          </Button>
        </div>
      </Card>

      {assignment.androidMonitoredAllowed && (
        <Card className="overflow-hidden border-warning/30">
          <div className="flex items-center justify-between border-b border-border bg-warning/5 px-5 py-4">
            <div>
              <h2 className="font-semibold text-foreground">คำขอเข้าสอบจาก Android</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                กดอนุมัติเฉพาะเมื่อเห็นเครื่องอยู่ต่อหน้า ตรวจแอปล่าสุด ปิดการแจ้งเตือน และยืนยันว่ามีเครื่องเดียว
              </p>
            </div>
            <Badge variant={pendingAndroidRows.length > 0 ? 'destructive' : 'outline'}>
              <Smartphone aria-hidden="true" /> รอ {pendingAndroidRows.length} คน
            </Badge>
          </div>
          {pendingAndroidRows.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">ยังไม่มีคำขอที่รอครูตรวจเครื่อง</div>
          ) : (
            <div className="divide-y divide-border">
              {pendingAndroidRows.map(row => {
                const busy = isReviewing && reviewingStudentId === row.studentId
                return (
                  <div key={row.studentId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        ขอเมื่อ {formatTime(row.androidApproval?.requested_at ?? null)} · การตรวจเครื่องต้องทำต่อหน้า
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isReviewing}
                        onClick={() => handleAndroidReview(row.studentId, 'deny')}
                      >
                        <UserX aria-hidden="true" /> {busy ? 'กำลังบันทึก…' : 'ปฏิเสธ'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isReviewing}
                        onClick={() => handleAndroidReview(row.studentId, 'approve')}
                      >
                        <UserCheck aria-hidden="true" /> {busy ? 'กำลังบันทึก…' : 'ตรวจแล้ว อนุมัติ'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="กำลังทำและเชื่อมต่อ" value={activeCount} icon={Wifi} tone="success" />
        <SummaryCard label="Android รออนุมัติ" value={pendingAndroidRows.length} icon={Smartphone} tone="warning" />
        <SummaryCard label="เคยเปิดพร้อมกันหลายจุด" value={concurrentCount} icon={MonitorSmartphone} tone="destructive" />
        <SummaryCard label="มีสัญญาณให้ตรวจ" value={flaggedCount} icon={ShieldAlert} tone="warning" />
        <SummaryCard label="ขาดการเชื่อมต่อ" value={offlineCount} icon={WifiOff} tone="destructive" />
        <SummaryCard label="ส่งแล้ว" value={completedCount} icon={CheckCircle2} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold text-foreground">สถานะนักเรียน</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">ออนไลน์เมื่อได้รับ heartbeat ภายใน 45 วินาที</p>
            </div>
            <Badge variant="outline"><Users aria-hidden="true" /> {rows.length} คน</Badge>
          </div>
          {rows.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-muted-foreground">
              ยังไม่มีรายชื่อนักเรียนในห้องนี้
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map(row => (
                <StudentStatusRow
                  key={row.studentId}
                  name={row.name}
                  session={row.session}
                  active={row.active}
                  flagged={row.flagged}
                  completed={row.completed}
                  fullscreenRequired={assignment.fullscreenRequired}
                  secureBrowserRequired={assignment.secureBrowserRequired}
                  androidApproval={row.androidApproval}
                />
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-foreground">เหตุการณ์ล่าสุด</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">แสดงล่าสุดไม่เกิน 100 รายการ</p>
          </div>
          {events.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-muted-foreground">
              ยังไม่มีเหตุการณ์จากหน้าสอบ
            </div>
          ) : (
            <div className="max-h-[720px] divide-y divide-border overflow-y-auto">
              {events.map(event => {
                const participant = participantByStudent.get(event.student_id)
                const needsReview = REVIEW_EVENT_TYPES.has(event.event_type)
                return (
                  <div key={event.id} className="flex gap-3 px-5 py-3">
                    <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                      needsReview ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'
                    }`}>
                      {needsReview ? <ShieldAlert className="size-3.5" aria-hidden="true" /> : <Clock3 className="size-3.5" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{participant?.name ?? 'นักเรียน'}</p>
                      <p className="text-xs text-muted-foreground">{EVENT_LABELS[event.event_type] ?? event.event_type}</p>
                    </div>
                    <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={event.created_at}>
                      {formatTime(event.created_at)}
                    </time>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
      {confirmDialog}
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, tone = 'default' }: {
  label: string
  value: number
  icon: typeof Wifi
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}) {
  const toneClass = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone]
  return (
    <Card padding="lg" className="flex items-center gap-4">
      <div className={`flex size-10 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  )
}

function StudentStatusRow({
  name,
  session,
  active,
  flagged,
  completed,
  fullscreenRequired,
  secureBrowserRequired,
  androidApproval,
}: {
  name: string
  session: ProctorSessionRow | undefined
  active: boolean
  flagged: boolean
  completed: boolean
  fullscreenRequired: boolean
  secureBrowserRequired: boolean
  androidApproval: AndroidApprovalView | undefined
}) {
  return (
    <div className="space-y-3 px-5 py-4 sm:flex sm:items-center sm:gap-4 sm:space-y-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{name}</p>
          {completed ? (
            <Badge variant="secondary" className="text-success"><CheckCircle2 aria-hidden="true" /> ส่งแล้ว</Badge>
          ) : active ? (
            <Badge variant="secondary" className="text-success"><Wifi aria-hidden="true" /> ออนไลน์</Badge>
          ) : session ? (
            <Badge variant="outline" className="text-warning"><WifiOff aria-hidden="true" /> ขาดการเชื่อมต่อ</Badge>
          ) : (
            <Badge variant="outline">ยังไม่เริ่ม</Badge>
          )}
          {flagged && <Badge variant="destructive"><ShieldAlert aria-hidden="true" /> ควรตรวจสอบ</Badge>}
          {session?.secure_browser_verified_at ? (
            <Badge variant="secondary" className="text-success">
              <LockKeyhole aria-hidden="true" /> SEB ยืนยันแล้ว · {SEB_PLATFORM_LABELS[session.secure_browser_platform ?? 'windows']}
            </Badge>
          ) : session?.exam_access_mode === 'android_monitored' ? (
            <Badge variant="outline" className="text-warning">
              <Smartphone aria-hidden="true" /> Android · ครูอนุมัติ
            </Badge>
          ) : secureBrowserRequired && session ? (
            <Badge variant="destructive"><AlertTriangle aria-hidden="true" /> ไม่พบการยืนยัน SEB</Badge>
          ) : null}
          {!session && androidApproval?.status === 'approved' && (
            <Badge variant="outline" className="text-warning"><UserCheck aria-hidden="true" /> Android อนุมัติแล้ว</Badge>
          )}
          {!session && androidApproval?.status === 'denied' && (
            <Badge variant="destructive"><UserX aria-hidden="true" /> ปฏิเสธ Android</Badge>
          )}
          {(session?.active_connection_count ?? 0) > 1 && (
            <Badge variant="destructive"><MonitorSmartphone aria-hidden="true" /> เปิดพร้อมกัน {session?.active_connection_count} จุด</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {session ? `สัญญาณล่าสุด ${formatTime(session.last_seen_at)}` : 'ยังไม่พบการเชื่อมต่อจากหน้าสอบ'}
        </p>
      </div>

      {session && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:min-w-[300px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            {session.is_tab_visible ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5 text-warning" aria-hidden="true" />}
            {session.is_tab_visible ? 'อยู่ในแท็บ' : 'ออกจากแท็บ'}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {session.exam_access_mode === 'seb' ? <LockKeyhole className="size-3.5 text-success" aria-hidden="true" /> : session.is_fullscreen ? <Maximize className="size-3.5" aria-hidden="true" /> : <Minimize className={`size-3.5 ${fullscreenRequired ? 'text-warning' : ''}`} aria-hidden="true" />}
            {session.exam_access_mode === 'seb' ? 'SEB kiosk' : session.is_fullscreen ? 'เต็มจอ' : 'ไม่เต็มจอ'}
          </span>
          <span className="text-muted-foreground">สลับแท็บ <strong className="text-foreground">{session.tab_switch_count}</strong></span>
          <span className="text-muted-foreground">ออกเต็มจอ <strong className="text-foreground">{session.fullscreen_exit_count}</strong></span>
          <span className="text-muted-foreground">หน้าต่างหลุดโฟกัส <strong className="text-foreground">{session.window_blur_count}</strong></span>
          <span className="text-muted-foreground">คัดลอก/วาง <strong className="text-foreground">{session.clipboard_attempt_count}</strong></span>
          <span className="text-muted-foreground">พบเปิดซ้ำ <strong className="text-foreground">{session.concurrent_connection_count}</strong> ครั้ง</span>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
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
  Settings,
  ShieldAlert,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { purgeAssignmentProctorData } from '@/lib/actions/exam-proctor'
import {
  EXAM_PROCTOR_RETENTION_DAYS,
  totalPurgedProctorRecords,
} from '@/lib/exam-proctor-retention'
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

export interface ProctorSessionRow {
  submission_id: string
  org_id: string
  assignment_id: string
  student_id: string
  started_monitoring_at: string
  last_seen_at: string
  is_online: boolean
  is_tab_visible: boolean
  is_fullscreen: boolean
  completed_at: string | null
  tab_switch_count: number
  fullscreen_exit_count: number
  window_blur_count: number
  clipboard_attempt_count: number
  screenshot_key_count: number
  active_connection_count: number
  concurrent_connection_count: number
  last_event_type: string | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

export interface ProctorEventRow {
  id: number
  org_id: string
  assignment_id: string
  submission_id: string
  student_id: string
  event_type: string
  occurred_at_client: string | null
  created_at: string
}

interface AssignmentSummary {
  id: string
  title: string
  classroomName: string
  enabled: boolean
  fullscreenRequired: boolean
  blockClipboard: boolean
}

interface Props {
  assignment: AssignmentSummary
  initialParticipants: ProctorParticipant[]
  initialSessions: ProctorSessionRow[]
  initialEvents: ProctorEventRow[]
}

const ACTIVE_WINDOW_MS = 45_000

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

export function ProctorDashboard({ assignment, initialParticipants, initialSessions, initialEvents }: Props) {
  const router = useRouter()
  const [sessions, setSessions] = useState(initialSessions)
  const [events, setEvents] = useState(initialEvents)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isPurging, startPurgeTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!assignment.enabled) return
    const supabase = createClient()
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
          if (payload.eventType === 'DELETE') {
            const previous = payload.old as Pick<ProctorSessionRow, 'submission_id'>
            if (previous?.submission_id) {
              setSessions(current => current.filter(row => row.submission_id !== previous.submission_id))
            }
            return
          }
          const next = payload.new as ProctorSessionRow
          if (!next?.submission_id) return
          setSessions(current => {
            const withoutCurrent = current.filter(row => row.submission_id !== next.submission_id)
            return [next, ...withoutCurrent]
          })
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
          if (payload.eventType === 'DELETE') {
            const previous = payload.old as Pick<ProctorEventRow, 'id'>
            if (previous?.id) setEvents(current => current.filter(row => row.id !== previous.id))
            return
          }
          const next = payload.new as ProctorEventRow
          if (!next?.id) return
          setEvents(current => [next, ...current.filter(row => row.id !== next.id)].slice(0, 100))
        },
      )
      .subscribe(status => setRealtimeConnected(status === 'SUBSCRIBED'))

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [assignment.enabled, assignment.id])

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

  const allStudentIds = useMemo(() => {
    const ids = new Set(initialParticipants.map(participant => participant.studentId))
    for (const session of sessions) ids.add(session.student_id)
    return [...ids]
  }, [initialParticipants, sessions])

  const rows = allStudentIds.map(studentId => {
    const participant = participantByStudent.get(studentId)
    const session = latestSessionByStudent.get(studentId)
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
      active,
      flagged: session ? sessionHasFlags(session) : false,
      completed: Boolean(session?.completed_at || participant?.submissionStatus === 'submitted' || participant?.submissionStatus === 'graded'),
    }
  }).sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name, 'th')
  })

  const activeCount = rows.filter(row => row.active).length
  const flaggedCount = rows.filter(row => row.flagged).length
  const completedCount = rows.filter(row => row.completed).length
  const offlineCount = rows.filter(row => row.session && !row.active && !row.completed).length
  const concurrentCount = rows.filter(row => (row.session?.concurrent_connection_count ?? 0) > 0).length

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

  if (!assignment.enabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-8">
        <Button variant="ghost" render={<Link href={`/assignments/${assignment.id}`} />}>
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
          <Button className="mt-5" render={<Link href={`/assignments/${assignment.id}/edit`} />}>
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
          <Button variant="ghost" render={<Link href={`/assignments/${assignment.id}`} />}>
            <ArrowLeft aria-hidden="true" /> กลับหน้าชุดข้อสอบ
          </Button>
          <div className="mt-2 flex items-center gap-2">
            <Radio className="size-5 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">ห้องคุมสอบสด</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{assignment.title} · {assignment.classroomName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={realtimeConnected ? 'secondary' : 'outline'} className={realtimeConnected ? 'text-success' : 'text-warning'}>
            {realtimeConnected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
            {realtimeConnected ? 'รับข้อมูลสดแล้ว' : 'กำลังเชื่อมต่อข้อมูลสด'}
          </Badge>
          {assignment.fullscreenRequired && <Badge variant="outline"><Maximize aria-hidden="true" /> บังคับเต็มจอ</Badge>}
          {assignment.blockClipboard && <Badge variant="outline"><ShieldAlert aria-hidden="true" /> ปิดคัดลอก/วาง</Badge>}
        </div>
      </div>

      <Card padding="md" className="border-warning/30 bg-warning/5">
        <div className="flex gap-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-muted-foreground">
            เหตุการณ์เหล่านี้เป็นสัญญาณให้ครูพิจารณาร่วมกับบริบท ไม่ใช่ข้อสรุปว่านักเรียนทุจริต
            เบราว์เซอร์ไม่สามารถกันภาพถ่ายหน้าจอหรือควบคุมอุปกรณ์อื่นได้ทั้งหมด
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="กำลังทำและเชื่อมต่อ" value={activeCount} icon={Wifi} tone="success" />
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

function StudentStatusRow({ name, session, active, flagged, completed, fullscreenRequired }: {
  name: string
  session: ProctorSessionRow | undefined
  active: boolean
  flagged: boolean
  completed: boolean
  fullscreenRequired: boolean
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
            {session.is_fullscreen ? <Maximize className="size-3.5" aria-hidden="true" /> : <Minimize className={`size-3.5 ${fullscreenRequired ? 'text-warning' : ''}`} aria-hidden="true" />}
            {session.is_fullscreen ? 'เต็มจอ' : 'ไม่เต็มจอ'}
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

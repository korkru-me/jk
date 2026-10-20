'use client'

import { useCallback, useState } from 'react'
import { StudentAnnouncementInbox } from '@/components/classrooms/student-announcement-inbox'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { PendingAssignmentNotice, PendingAssignmentReminder } from '@/lib/assignment-reminders'
import type { PendingClassroomAnnouncement } from '@/lib/classroom-announcement-acknowledgements'

const reminderRows: PendingAssignmentReminder[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001', assignmentId: 'a0000000-0000-4000-8000-000000000002',
    classroomId: 'a0000000-0000-4000-8000-000000000003', assignmentTitle: 'การเคลื่อนที่แนวตรง · แบบฝึกหัดท้ายบท',
    classroomName: 'ฟิสิกส์ 1 · ห้องเรียนตัวอย่าง', teacherName: 'ครูตัวอย่าง', createdAt: '2026-10-20T02:30:00Z',
    endAt: '2026-10-25T16:59:00Z', href: '/exam-screen-lab/assignment-reminders?opened=homework', inProgress: true,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004', assignmentId: 'a0000000-0000-4000-8000-000000000005',
    classroomId: 'a0000000-0000-4000-8000-000000000003', assignmentTitle: 'แรงและกฎการเคลื่อนที่',
    classroomName: 'ฟิสิกส์ 1 · ห้องเรียนตัวอย่าง', teacherName: 'ครูตัวอย่าง', createdAt: '2026-10-20T02:25:00Z',
    endAt: null, href: '/exam-screen-lab/assignment-reminders?opened=another', inProgress: false,
  },
]
const assignedRows: PendingAssignmentNotice[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000007', assignmentId: 'a0000000-0000-4000-8000-000000000008',
    classroomId: reminderRows[0].classroomId, kind: 'assigned', assignmentType: 'exercise', mode: 'online',
    assignmentTitle: 'แบบฝึกหัดใหม่ เรื่อง การเคลื่อนที่แนวตรงและการอ่านกราฟความเร็ว–เวลา',
    classroomName: 'ฟิสิกส์ 1 · ห้องเรียนตัวอย่าง', teacherName: 'ครูตัวอย่าง', createdAt: '2026-10-20T03:00:00Z',
    dueAt: '2026-10-24T16:59:00Z', startAt: '2026-10-21T01:00:00Z', endAt: '2026-10-25T16:59:00Z',
    href: '/exam-screen-lab/assignment-reminders?opened=classroom', inProgress: false,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000009', assignmentId: 'a0000000-0000-4000-8000-000000000010',
    classroomId: reminderRows[0].classroomId, kind: 'assigned', assignmentType: 'exam', mode: 'online',
    assignmentTitle: 'ข้อสอบใหม่ · ทบทวนแรงและกฎการเคลื่อนที่',
    classroomName: 'ฟิสิกส์ 1 · ห้องเรียนตัวอย่าง', teacherName: 'ครูตัวอย่าง', createdAt: '2026-10-20T02:55:00Z',
    dueAt: null, startAt: null, endAt: null,
    href: '/exam-screen-lab/assignment-reminders?opened=classroom', inProgress: false,
  },
]
const reminderNoticeRows: PendingAssignmentNotice[] = reminderRows.map(row => ({
  ...row, kind: 'reminder', assignmentType: 'exercise', mode: 'online', dueAt: null, startAt: null,
}))
const announcement: PendingClassroomAnnouncement = {
  id: 'a0000000-0000-4000-8000-000000000006', classroomId: reminderRows[0].classroomId,
  classroomName: reminderRows[0].classroomName, classroomDescription: null, authorName: 'ครูตัวอย่าง',
  body: 'สัปดาห์นี้อย่าลืมทบทวนบทเรียนก่อนทำแบบฝึกหัดนะคะ', attachments: [],
  createdAt: '2026-10-20T02:20:00Z', editedAt: null, round: 1, remindedAt: null, pinned: false,
}
type Scenario = 'reminders' | 'announcements' | 'completed' | 'failure' | 'exam'
  | 'assigned_exercise' | 'assigned_exam' | 'assigned_failure' | 'all_notices'

export function AssignmentReminderLab() {
  const [scenario, setScenario] = useState<Scenario>('reminders')
  const [generation, setGeneration] = useState(0)
  const [readIds, setReadIds] = useState<string[]>([])
  const [failAssignedOnce, setFailAssignedOnce] = useState(false)
  const loadReminders = useCallback(async () => ({
    reminders: scenario === 'completed' ? [] : reminderRows.filter(row => !readIds.includes(row.id)),
  }), [scenario, readIds])
  const acknowledgeReminder = useCallback(async (id: string) => {
    if (scenario === 'failure') return { error: 'บันทึกการรับทราบไม่สำเร็จ (สถานการณ์จำลอง)' }
    setReadIds(previous => [...previous, id])
    return { success: true as const }
  }, [scenario])
  const loadNotices = useCallback(async () => {
    const rows = scenario === 'assigned_exam' ? [assignedRows[1]]
      : scenario === 'all_notices' || scenario === 'exam' ? [...reminderNoticeRows, ...assignedRows]
        : [assignedRows[0]]
    return { notices: rows.filter(row => !readIds.includes(row.id)) }
  }, [scenario, readIds])
  const acknowledgeNotice = useCallback(async (id: string) => {
    if (scenario === 'assigned_failure' && failAssignedOnce) {
      setFailAssignedOnce(false)
      return { error: 'บันทึกการรับทราบงานใหม่ไม่สำเร็จ (สถานการณ์จำลอง)' }
    }
    setReadIds(previous => [...previous, id])
    return { success: true as const }
  }, [scenario, failAssignedOnce])
  const allNoticeScenario = scenario === 'assigned_exercise' || scenario === 'assigned_exam'
    || scenario === 'assigned_failure' || scenario === 'all_notices' || scenario === 'exam'
  function reset(next: Scenario) {
    setScenario(next)
    setReadIds([])
    setFailAssignedOnce(next === 'assigned_failure')
    setGeneration(previous => previous + 1)
  }

  return (
    <main className="min-h-dvh bg-background p-3 text-foreground sm:p-5">
      <Card padding="sm" className="flex flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">ตัวอย่างป๊อปอัปงานใหม่และเตือนงาน</h1>
          <p className="text-sm text-muted-foreground">ข้อมูลสังเคราะห์เท่านั้น ไม่ส่งแจ้งเตือน ไม่เริ่มงาน และไม่บันทึกฐานข้อมูลจริง</p>
        </header>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => reset('reminders')}>เริ่มตัวอย่างใหม่</Button>
            <Button variant="outline" size="sm" onClick={() => reset('announcements')}>มีประกาศก่อนเตือนงาน</Button>
            <Button variant="outline" size="sm" onClick={() => reset('completed')}>จำลองส่งงานแล้ว</Button>
            <Button variant="outline" size="sm" onClick={() => reset('failure')}>จำลองรับทราบไม่สำเร็จ</Button>
            <Button variant="outline" size="sm" onClick={() => reset('exam')}>จำลองกำลังทำข้อสอบ</Button>
            <Button variant="outline" size="sm" onClick={() => reset('assigned_exercise')}>จำลองงานใหม่ · แบบฝึกหัด</Button>
            <Button variant="outline" size="sm" onClick={() => reset('assigned_exam')}>จำลองงานใหม่ · ข้อสอบไม่กำหนดส่ง</Button>
            <Button variant="outline" size="sm" onClick={() => reset('all_notices')}>ประกาศ → งานใหม่ → เตือนงาน</Button>
            <Button variant="outline" size="sm" onClick={() => reset('assigned_failure')}>จำลองรับทราบงานใหม่ไม่สำเร็จ</Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            รับทราบแล้ว {readIds.length} รายการ
            {scenario === 'completed' && ' · นักเรียนส่งงานแล้ว จึงไม่มีป๊อปอัปเตือนงาน'}
            {scenario === 'exam' && ' · พักป๊อปอัปประกาศ งานใหม่ และเตือนงานระหว่างทำข้อสอบ'}
          </p>
        </div>
      </Card>
      <StudentAnnouncementInbox
        key={generation}
        initialPosts={scenario === 'announcements' || scenario === 'all_notices' || scenario === 'exam' ? [announcement] : []}
        acknowledgeAction={async () => ({ success: true })}
        remindersEnabled
        loadReminderAction={allNoticeScenario ? undefined : loadReminders}
        acknowledgeReminderAction={allNoticeScenario ? undefined : acknowledgeReminder}
        loadNoticeAction={allNoticeScenario ? loadNotices : undefined}
        acknowledgeNoticeAction={allNoticeScenario ? acknowledgeNotice : undefined}
        pollReminders={false}
        pathnameOverride={scenario === 'exam' ? `/assignments/${reminderRows[0].assignmentId}/take` : '/dashboard'}
      />
    </main>
  )
}

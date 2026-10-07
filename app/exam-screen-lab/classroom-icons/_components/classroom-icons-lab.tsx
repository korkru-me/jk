'use client'

import { useCallback, useState } from 'react'
import { CreateCourseWizard, type CreateCourseWizardActions } from '@/app/(app)/classrooms/new/_components/create-course-wizard'
import { ClassroomContextNavigation } from '@/app/(app)/classrooms/[id]/_components/classroom-context-sidebar'
import { composeDescription, EMPTY_META, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ClassroomCard } from '@/app/(app)/classrooms/_components/classroom-card'
import { ShellClient } from '@/components/layout/shell-client'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { classroomNavigationFor } from '@/lib/classroom-navigation'
import type { Classroom } from '@/lib/types'

const ROOM_ID = '90000000-0000-4000-8000-000000000001'
const DEFAULT: Classroom = {
  id: ROOM_ID,
  org_id: ROOM_ID,
  teacher_id: ROOM_ID,
  name: 'ห้องจำลอง',
  description: composeDescription({ ...EMPTY_META, cover: 'blue' }),
  class_code: 'LAB001',
  status: 'active',
  classroom_type: 'subject',
  pinned_at: null,
  display_order: 0,
  deleted_at: null,
  created_at: '2026-10-07T00:00:00.000Z',
  updated_at: '2026-10-07T00:00:00.000Z',
}
const OTHER: Classroom = {
  ...DEFAULT,
  id: '90000000-0000-4000-8000-000000000002',
  name: 'ห้องภาษาเกาหลีจำลอง',
  description: composeDescription({ ...EMPTY_META, iconKey: 'korean', cover: 'purple' }),
  display_order: 1,
}

function LabContent() {
  const [room, setRoom] = useState(DEFAULT)
  const [created, setCreated] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const render = useCallback((onClose?: () => void) => <ClassroomContextNavigation
    classroom={room} switchableClassrooms={[DEFAULT, OTHER]} backHref="/exam-screen-lab/classroom-icons"
    navigationItems={classroomNavigationFor('subject', true)} studentCount={0}
    onNavigate={() => undefined} onClose={onClose}
    onSwitchClassroom={id => setRoom(id === ROOM_ID ? DEFAULT : OTHER)}
  />, [room])
  useContextualSidebar('/exam-screen-lab/classroom-icons', render, room.id)
  const actions: CreateCourseWizardActions = {
    createClassroom: async input => { setRoom({ ...DEFAULT, name: input.name, description: input.description }); return { success: true } },
    duplicateClassroom: async (_id, input) => { setRoom({ ...DEFAULT, name: input?.name ?? DEFAULT.name, description: input?.description ?? DEFAULT.description }); return { success: true, id: ROOM_ID, copiedAssignments: 0 } },
    onCreated: () => setCreated(true),
  }
  const savedMeta = parseDescription(room.description)
  return <div className="classroom-create-stage flex max-w-4xl flex-col gap-4">
    <p>ห้องทดลองไอคอน · ข้อมูลสมมติ · ไม่อ่านหรือเขียน Supabase</p>
    <Card className="flex flex-col gap-3 p-4">
      <h1>ไอคอนที่บันทึกจำลอง</h1>
      <div data-lab-classroom-card>
        <ClassroomCard
          classroom={room}
          studentCount={0}
          assignmentCount={0}
          onDuplicate={() => undefined}
          onDelete={() => undefined}
        />
      </div>
      <p role="status">{created ? 'สร้างห้องจำลองสำเร็จ' : 'ยังไม่บันทึกห้องจำลอง'}</p>
      <Button variant="outline" onClick={() => { setCreated(false); setFormKey(key => key + 1) }}>เปิดสำเนาห้องจำลอง</Button>
    </Card>
    <CreateCourseWizard key={formKey} actions={actions} initialValues={formKey > 0 ? {
      name: `${room.name} สำเนา`,
      iconKey: savedMeta.iconKey,
      cover: savedMeta.cover,
    } : undefined} />
  </div>
}

export function ClassroomIconsLab() {
  return <ShellClient user={{ id: ROOM_ID, email: 'icons@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>
    <LabContent />
  </ShellClient>
}

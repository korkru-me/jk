'use client'

import { useCallback, useState } from 'react'
import { CreateCourseWizard, type CreateCourseWizardActions } from '@/app/(app)/classrooms/new/_components/create-course-wizard'
import { ClassroomContextNavigation } from '@/app/(app)/classrooms/[id]/_components/classroom-context-sidebar'
import { composeDescription, EMPTY_META, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ClassroomCard } from '@/app/(app)/classrooms/_components/classroom-card'
import { TeacherDashboard } from '@/app/(app)/dashboard/_components/teacher-dashboard'
import { ShellClient } from '@/components/layout/shell-client'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { classroomNavigationFor } from '@/lib/classroom-navigation'
import type { ClassroomCoverPatternKey } from '@/lib/classroom-cover-patterns'
import type { Classroom } from '@/lib/types'

const ROOM_ID = '90000000-0000-4000-8000-000000000001'
const DEFAULT: Classroom = {
  id: ROOM_ID,
  org_id: ROOM_ID,
  teacher_id: ROOM_ID,
  name: 'ห้องจำลอง',
  description: composeDescription({ ...EMPTY_META, cover: 'blue', coverPattern: 'physics' }),
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
  description: composeDescription({ ...EMPTY_META, iconKey: 'korean', cover: 'purple', coverPattern: 'foreign-language' }),
  display_order: 1,
}

function LabContent({ initialCoverPattern }: { initialCoverPattern: ClassroomCoverPatternKey }) {
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
    <Card padding="lg" className="overflow-hidden">
      <TeacherDashboard
        classroomsCount={5}
        questionsCount={890}
        setsCount={8}
        studentsCount={210}
        classrooms={[
          { id: ROOM_ID, name: 'กลศาสตร์ 2', classroom_type: 'subject', cover: 'blue', coverPattern: 'physics', iconKey: 'physics', studentCount: 0, assignmentCount: 0 },
          { id: `${ROOM_ID}-2`, name: 'เคมี 1/2569', classroom_type: 'subject', cover: 'mint', coverPattern: 'chemistry', iconKey: 'chemistry', studentCount: 143, assignmentCount: 1 },
          { id: `${ROOM_ID}-3`, name: 'ชีววิทยาเพิ่มเติม', classroom_type: 'subject', cover: 'green', coverPattern: 'biology', iconKey: 'plant-biology', studentCount: 63, assignmentCount: 5 },
          { id: `${ROOM_ID}-4`, name: 'ม.4/1', classroom_type: 'homeroom', cover: 'sky', coverPattern: 'classroom', iconKey: 'school', studentCount: 1, assignmentCount: 0 },
          { id: `${ROOM_ID}-5`, name: 'ดาราศาสตร์', classroom_type: 'subject', cover: 'purple', coverPattern: 'korkru-deer', iconKey: 'astronomy', studentCount: 3, assignmentCount: 13 },
        ]}
        questionSets={[
          { id: 'set-1', title: 'การเคลื่อนที่แบบโปรเจกไทล์', questionCount: 22 },
          { id: 'set-2', title: 'ทดสอบ', questionCount: 5 },
          { id: 'set-3', title: 'แบบฝึกหัดกลศาสตร์', questionCount: 18 },
        ]}
        questions={[
          { id: 'question-1', title: 'การเคลื่อนที่แนวระดับ', question_type: 'written' },
          { id: 'question-2', title: 'แรงลัพธ์จากแรงหลายแรง', question_type: 'mcq' },
          { id: 'question-3', title: 'พลังงานกลของวัตถุ', question_type: 'true_false' },
        ]}
      />
    </Card>
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
    <CreateCourseWizard
      key={formKey}
      actions={actions}
      initialValues={formKey > 0 ? {
        name: `${room.name} สำเนา`,
        iconKey: savedMeta.iconKey,
        cover: savedMeta.cover,
        coverPattern: savedMeta.coverPattern,
      } : { coverPattern: initialCoverPattern }}
    />
  </div>
}

export function ClassroomIconsLab({ initialCoverPattern }: { initialCoverPattern: ClassroomCoverPatternKey }) {
  return <ShellClient user={{ id: ROOM_ID, email: 'icons@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>
    <LabContent initialCoverPattern={initialCoverPattern} />
  </ShellClient>
}

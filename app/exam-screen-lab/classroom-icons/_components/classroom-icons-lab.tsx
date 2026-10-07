'use client'

import { useCallback, useState } from 'react'
import { CreateCourseWizard, type CreateCourseWizardActions } from '@/app/(app)/classrooms/new/_components/create-course-wizard'
import { ClassroomContextNavigation } from '@/app/(app)/classrooms/[id]/_components/classroom-context-sidebar'
import { composeDescription, coverImageOf, coverOf, EMPTY_META, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ShellClient } from '@/components/layout/shell-client'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { classroomNavigationFor } from '@/lib/classroom-navigation'
import { ClassroomCoverBackdrop } from '@/components/classrooms/classroom-cover-backdrop'
import { cn } from '@/lib/utils'

const ROOM_ID = '90000000-0000-4000-8000-000000000001'
const DEFAULT = { id: ROOM_ID, name: 'ห้องจำลอง', description: composeDescription({ ...EMPTY_META, cover: 'blue' }), classroom_type: 'subject' as const }

function LabContent() {
  const [room, setRoom] = useState(DEFAULT)
  const [created, setCreated] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const other = { id: '90000000-0000-4000-8000-000000000002', name: 'ห้องภาษาเกาหลีจำลอง', description: composeDescription({ ...EMPTY_META, iconKey: 'korean', cover: 'purple' }) }
  const render = useCallback((onClose?: () => void) => <ClassroomContextNavigation
    classroom={room} switchableClassrooms={[DEFAULT, other]} backHref="/exam-screen-lab/classroom-icons"
    navigationItems={classroomNavigationFor('subject', true)} studentCount={0}
    onNavigate={() => undefined} onClose={onClose}
    onSwitchClassroom={id => setRoom(id === ROOM_ID ? DEFAULT : { ...other, classroom_type: 'subject' })}
  />, [room, other.description])
  useContextualSidebar('/exam-screen-lab/classroom-icons', render, room.id)
  const actions: CreateCourseWizardActions = {
    createClassroom: async input => { setRoom({ ...DEFAULT, name: input.name, description: input.description }); return { success: true } },
    duplicateClassroom: async (_id, input) => { setRoom({ ...DEFAULT, name: input?.name ?? DEFAULT.name, description: input?.description ?? DEFAULT.description }); return { success: true, id: ROOM_ID, copiedAssignments: 0 } },
    uploadCoverImage: async file => ({ url: URL.createObjectURL(file) }),
    onCreated: () => setCreated(true),
  }
  const savedMeta = parseDescription(room.description)
  const savedCover = coverOf(savedMeta)
  const savedCoverImage = coverImageOf(savedMeta)
  return <div className="classroom-create-stage flex max-w-4xl flex-col gap-4">
    <p>ห้องทดลองไอคอน · ข้อมูลสมมติ · ไม่อ่านหรือเขียน Supabase</p>
    <Card className="flex flex-col gap-3 p-4">
      <h1>ไอคอนที่บันทึกจำลอง</h1>
      <div
        data-lab-classroom-cover
        className={cn(
          'relative flex min-h-24 items-center overflow-hidden rounded-xl px-4',
          savedCoverImage
            ? 'bg-surface-inverse text-surface-inverse-foreground'
            : savedCover ? `${savedCover.surface} ${savedCover.text}` : 'bg-muted text-foreground',
        )}
      >
        <ClassroomCoverBackdrop imageUrl={savedCoverImage} cover={savedCover} />
        <div className="relative z-10 flex items-center gap-2"><ClassroomIcon iconKey={savedMeta.iconKey} /><span>{room.name}</span></div>
      </div>
      <p role="status">{created ? 'สร้างห้องจำลองสำเร็จ' : 'ยังไม่บันทึกห้องจำลอง'}</p>
      <Button variant="outline" onClick={() => { setCreated(false); setFormKey(key => key + 1) }}>เปิดสำเนาห้องจำลอง</Button>
    </Card>
    <CreateCourseWizard key={formKey} actions={actions} initialValues={formKey > 0 ? {
      name: `${room.name} สำเนา`,
      iconKey: savedMeta.iconKey,
      cover: savedMeta.cover,
      coverImageUrl: savedMeta.coverImageUrl,
    } : undefined} />
  </div>
}

export function ClassroomIconsLab() {
  return <ShellClient user={{ id: ROOM_ID, email: 'icons@example.invalid', full_name: 'ครูจำลอง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>
    <LabContent />
  </ShellClient>
}

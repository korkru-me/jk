'use client'

import { useState } from 'react'
import { ClassroomDetailClient } from '@/app/(app)/classrooms/[id]/_components/classroom-detail-client'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ClassroomCoverThemePicker } from '@/components/classrooms/classroom-cover-theme-picker'
import { ShellClient } from '@/components/layout/shell-client'
import { Card } from '@/components/ui/card'
import type { Classroom, ClassroomPost } from '@/lib/types'

const ID = '00000000-0000-4000-8000-000000000091'
const USER = { id: 'lab-teacher', email: 'teacher@example.invalid', full_name: 'ครูตัวอย่าง ใจดี', role: 'teacher' as const }
const POSTS: ClassroomPost[] = [{
  id: 'lab-theme-post', classroom_id: ID, author_id: 'lab-author',
  body: 'เตรียมทบทวนบทเรียนเรื่องแรงและการเคลื่อนที่ แล้วพบกันในห้องเรียน',
  pinned: true, attachments: [], created_at: '2026-10-15T03:00:00Z', updated_at: '2026-10-15T03:00:00Z', edited_at: null,
  users: { full_name: 'ครูตัวอย่าง ใจดี' }, comments: [],
}]

export function ClassroomThemesLab() {
  const [cover, setCover] = useState('blue')
  const classroom: Classroom = {
    id: ID, org_id: ID, teacher_id: 'lab-teacher', name: 'กลศาสตร์ 1 · ห้องเรียนจำลอง',
    description: composeDescription({ ...EMPTY_META, cover, iconKey: 'physics', coverPattern: 'physics', gradeLevel: 'ม.4', academicTerm: '1/2569' }),
    class_code: 'LAB091', classroom_type: 'subject', status: 'active', pinned_at: null,
    display_order: 0, deleted_at: null, created_at: '2026-10-15T03:00:00Z', updated_at: '2026-10-15T03:00:00Z',
  }
  return <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
    <Card padding="sm" className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-semibold">ตัวอย่างสีภายในห้องเรียน · ข้อมูลจำลอง</h1>
        <p className="text-xs text-muted-foreground">สำหรับตรวจหน้าตาเท่านั้น ไม่ใช้ส่งประกาศหรือแก้ข้อมูลจริง</p>
      </div>
      <div className="w-56"><ClassroomCoverThemePicker value={cover} onValueChange={setCover} allowAuto /></div>
    </Card>
    <ClassroomDetailClient
      classroom={classroom} switchableClassrooms={[classroom]} students={[]} assignmentCount={0}
      isOwner={false} canManage coTeachers={[]} invites={[]} classroomAssignments={[]} assignmentCategories={[]}
      classroomSubmissions={[]} classroomExtensions={[]} homeroomAssignments={[]} homeroomSubmissions={[]}
      studentNotes={[]} studentProfiles={{}} ownerName="ครูตัวอย่าง ใจดี" posts={POSTS}
      pendingReviewByAssignment={{}} seenByPost={{}} crossPostTargets={[]} groups={[]} groupMembers={{}}
      initialNavigationItem="overview" initialPeopleView="students" backHref="/exam-screen-lab/classroom-themes"
      navigationPathname="/exam-screen-lab/classroom-themes"
    />
  </ShellClient>
}

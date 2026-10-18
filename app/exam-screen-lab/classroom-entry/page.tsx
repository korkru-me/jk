import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { ClassroomDetailClient } from '@/app/(app)/classrooms/[id]/_components/classroom-detail-client'
import { ClassroomEntryLoading } from '@/app/(app)/classrooms/[id]/_components/classroom-entry-loading'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { classroomNavigationFor, resolveClassroomNavigationKey, type ClassroomNavigationKey } from '@/lib/classroom-navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import type { Classroom } from '@/lib/types'

const BASE = '/exam-screen-lab/classroom-entry'
const ID = '00000000-0000-4000-9000-000000000010'
interface Query { view?: string; people?: string; role?: string; type?: string; back?: string }

export const dynamic = 'force-dynamic'

export default async function ClassroomEntryLabPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === 'production' || !isExamScreenLabEnabled(process.env)) notFound()
  const query = await searchParams
  const canManage = query.role !== 'view'
  const homeroom = query.type === 'homeroom'
  const classroom: Classroom = {
    id: ID, org_id: '00000000-0000-4000-9000-000000000002', teacher_id: '00000000-0000-4000-9000-000000000001',
    name: homeroom ? 'โฮมรูม ม.4/1 จำลอง' : 'ฟิสิกส์ ม.4/1 จำลอง',
    description: composeDescription({ ...EMPTY_META, description: 'ใช้ตรวจการโหลดหน้าและเมนูห้องเรียนเท่านั้น', cover: 'purple', coverPattern: 'korkru-deer', gradeLevel: 'ม.4/1', academicTerm: '1/2569' }),
    class_code: 'LOCALROOM', status: 'active', classroom_type: homeroom ? 'homeroom' : 'subject', pinned_at: null, display_order: 1, deleted_at: null,
    created_at: '2026-10-18T00:00:00.000Z', updated_at: '2026-10-18T00:00:00.000Z',
  }
  const item = resolveClassroomNavigationKey(query.view, classroomNavigationFor(classroom.classroom_type, canManage))
  const people = query.view === 'groups' || query.people === 'groups' ? 'groups' : 'students'
  const backHref = query.back?.startsWith(BASE) ? query.back : BASE
  return <div className="flex min-w-0 flex-col gap-3" data-classroom-entry-lab>
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">LOCAL · ข้อมูลจำลอง · หน่วงเนื้อหา 2 วินาที</Badge><nav aria-label="กรณีทดสอบห้องเรียน" className="flex flex-wrap gap-x-3 gap-y-1 text-xs"><Link prefetch={false} href={`${BASE}?role=owner&back=${encodeURIComponent(BASE + '?source=kept')}`} className="text-primary underline underline-offset-2">ครูเจ้าของ</Link><Link prefetch={false} href={`${BASE}?role=view&back=${encodeURIComponent(BASE + '?source=kept')}`} className="text-primary underline underline-offset-2">ผู้ช่วยดูอย่างเดียว</Link><Link prefetch={false} href={`${BASE}?type=homeroom`} className="text-primary underline underline-offset-2">โฮมรูม</Link><Link prefetch={false} href={`${BASE}?view=students&people=groups`} className="text-primary underline underline-offset-2">กลุ่มนักเรียน</Link></nav></div>
    <p className="text-xs text-muted-foreground">ไม่อ่าน Auth/ฐานข้อมูล · คำสั่งแก้ไขทั้งหมดถูกปิด · ใช้ปุ่มเมนูห้องเรียนและ Back/Forward ของเบราว์เซอร์</p>
    <Suspense key={`${classroom.id}-${canManage}-${homeroom}`} fallback={<ClassroomEntryLoading classroom={classroom} canManage={canManage} initialNavigationItem={item} backHref={backHref} navigationPathname={BASE} />}>
      <DeferredClassroom classroom={classroom} canManage={canManage} item={item} people={people} backHref={backHref} />
    </Suspense>
  </div>
}

async function DeferredClassroom({ classroom, canManage, item, people, backHref }: { classroom: Classroom; canManage: boolean; item: ClassroomNavigationKey; people: 'groups' | 'students'; backHref: string }) {
  await new Promise(resolve => setTimeout(resolve, 2000))
  const students = ['กานต์พิชชา ใจดี', 'กิตติภพ วงศ์สวัสดิ์', 'จิราพร แก้วประเสริฐ'].map((full_name, index) => ({ id: `00000000-0000-4000-9100-${String(index + 1).padStart(12, '0')}`, full_name, email: `student${index + 1}@example.invalid`, roster_order: index + 1 }))
  const profiles = Object.fromEntries(students.map((student, index) => [student.id, { student_id: student.id, nickname: null, date_of_birth: null, gender: null, food_allergy: null, chronic_disease: null, grade_level: 'ม.4', section_number: 1, class_number: index + 1, student_code: String(68101 + index), school_name: null, address: null, phone: null, guardians: [] }]))
  return <div data-classroom-entry-loaded data-loaded-navigation={item}><ClassroomDetailClient classroom={classroom} switchableClassrooms={[classroom]} students={students} assignmentCount={0} isOwner={canManage} canManage={canManage} coTeachers={[]} invites={[]} classroomAssignments={[]} assignmentCategories={[]} classroomSubmissions={[]} classroomExtensions={[]} homeroomAssignments={[]} homeroomSubmissions={[]} studentNotes={[]} studentProfiles={profiles} ownerName="ครูจำลอง" posts={[]} pendingReviewByAssignment={{}} seenByPost={{}} crossPostTargets={[]} groups={[]} groupMembers={{}} initialNavigationItem={item} loadedNavigationItem={item} initialPeopleView={people} backHref={backHref} navigationPathname={BASE} /></div>
}

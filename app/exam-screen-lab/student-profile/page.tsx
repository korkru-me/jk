import { notFound } from 'next/navigation'
import { ShellClient } from '@/components/layout/shell-client'
import { SettingsShell } from '@/components/settings/settings-shell'
import { StudentProfileSettings } from '@/components/settings/student-profile-settings'
import { Card } from '@/components/ui/card'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import type { StudentProfile } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ข้อมูลส่วนตัวนักเรียน · ตัวอย่าง — KorKru' }
const USER = {
  id: 'lab-student', email: 'student@example.invalid', full_name: 'เด็กหญิงนักเรียน ตัวอย่าง', role: 'student' as const,
  prefix: 'เด็กหญิง' as const, first_name: 'นักเรียน', last_name: 'ตัวอย่าง',
  avatar_url: '/samples/avatar-crop-fixture.svg', created_at: '2026-08-18T00:00:00+07:00',
}
const PROFILE: StudentProfile = {
  student_id: USER.id, nickname: 'ตัวอย่าง', date_of_birth: null, gender: null, food_allergy: null, chronic_disease: null,
  grade_level: 'ม.4', section_number: 5, school_name: 'โรงเรียนตัวอย่าง', student_code: 'DEMO01', class_number: 3,
  address: null, phone: null, guardians: [{ name: '', phone: '' }], updated_at: USER.created_at,
}
// Standalone, environment-gated fixture actions cannot reach authentication, Storage or the database.
async function previewOnlyAction() {
  'use server'
  return { error: 'หน้านี้เป็นตัวอย่าง จึงไม่ได้บันทึกข้อมูลหรือเปลี่ยนรหัสผ่านจริง' }
}

export default async function StudentProfileLabPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { scenario } = await searchParams
  const isTeacherShell = scenario === 'teacher-shell'
  return (
    <ShellClient user={{ ...USER, role: isTeacherShell ? 'teacher' : 'student' }} initialUnreadCount={0} notificationsEnabled={false}>
      <SettingsShell role={isTeacherShell ? 'teacher' : 'student'}>
        <p className="mb-3 text-xs text-muted-foreground">ตัวอย่างสำหรับตรวจหน้าตา · ข้อมูลและรูปจำลอง ไม่มีการบันทึกจริง</p>
        {isTeacherShell ? <Card padding="md">ตัวอย่างเมนูตั้งค่าของครู</Card> : <StudentProfileSettings
          user={scenario === 'empty' ? { ...USER, avatar_url: null } : USER}
          profile={scenario === 'empty' ? null : PROFILE}
          saveProfileAction={previewOnlyAction} changePasswordAction={previewOnlyAction} />}
      </SettingsShell>
    </ShellClient>
  )
}

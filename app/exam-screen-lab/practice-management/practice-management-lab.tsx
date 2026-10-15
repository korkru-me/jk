'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ShellClient } from '@/components/layout/shell-client'
import { PracticeManagementShell } from '@/components/practice/practice-management-shell'
import { PracticeManagementQuestions } from '@/components/practice/practice-management-questions'
import { PracticeProgressDashboard } from '@/components/practice/practice-progress-dashboard'
import { PracticeStudentDetail } from '@/components/practice/practice-student-detail'
import { PracticeLibraryForm } from '@/app/(app)/practice/_components/practice-library-form'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { pagePracticeQuestionProgress, parsePracticeProgressSearchParams } from '@/lib/practice-progress'
import type { PracticeLibraryStatus } from '@/lib/practice-library-contracts'
import { Button } from '@/components/ui/button'

const ID = '11111111-1111-4111-8111-111111111111'
const BASE = '/exam-screen-lab/practice-management'
const USER = { id: 'lab-teacher', email: 'teacher@example.invalid', full_name: 'ครูตัวอย่าง', role: 'teacher' as const }
const ROOM = { id: 'lab-room', orgId: 'lab-org', name: 'ฟิสิกส์ 1', description: composeDescription({ ...EMPTY_META, cover: 'orange', iconKey: 'physics' }) }
const QUESTIONS = Array.from({ length: 60 }, (_, index) => ({
  id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
  title: index === 1 ? 'การประยุกต์ใช้กฎการเคลื่อนที่ของนิวตันในสถานการณ์ต่าง ๆ และการวิเคราะห์แรงที่กระทำต่อวัตถุ' : `โจทย์ตัวอย่าง ${index + 1} · แรงและการเคลื่อนที่`,
  question_text: 'วัตถุมวล 2 กิโลกรัม เคลื่อนที่ด้วยความเร่ง 3 เมตรต่อวินาทีกำลังสอง จงหาแรงลัพธ์',
  question_type: 'written' as const, difficulty: 'medium' as const, subject: 'ฟิสิกส์', tags: ['แรง', 'กฎของนิวตัน'],
  group_id: null, order_in_group: null, question_categories: null,
}))
const STUDENTS = [
  { student_id: 'student-one', display_name: 'นักเรียนตัวอย่างที่หนึ่ง', class_number: 1, attempted_question_count: 3, total_attempt_count: 7 },
  { student_id: 'student-two', display_name: 'นักเรียนตัวอย่างชื่อยาวสำหรับตรวจการตัดบรรทัดและพื้นที่แสดงข้อมูล', class_number: 2, attempted_question_count: 1, total_attempt_count: 1 },
  { student_id: 'student-three', display_name: 'นักเรียนที่ยังไม่ได้ฝึก', class_number: 3, attempted_question_count: 0, total_attempt_count: 0 },
]

export function PracticeManagementLab() {
  const params = useSearchParams()
  const section = params.get('tab') === 'settings' ? 'settings' : params.get('tab') === 'progress' ? 'progress' : 'overview'
  const scenario = params.get('scenario')
  const [status, setStatus] = useState<PracticeLibraryStatus>(scenario === 'draft' ? 'draft' : scenario === 'closed' ? 'closed' : 'published')
  const [saved, setSaved] = useState(0)
  const students = scenario === 'empty' ? [] : STUDENTS
  const questions = scenario === 'empty' ? [] : QUESTIONS
  const student = students.find(row => row.student_id === params.get('student'))
  const state = parsePracticeProgressSearchParams({ q: params.get('q') ?? '', page: params.get('page') ?? '' })
  const rows = questions.map((question, index) => ({ question_id: question.id, title: question.title, tags: question.tags,
    attempt_count: student?.student_id === 'student-one' ? ({ 0: 4, 55: 2, 59: 1 }[index] ?? 0) : student?.student_id === 'student-two' && index === 10 ? 1 : 0,
  })).filter(row => `${row.title} ${row.tags.join(' ')}`.includes(state.q))
  const paged = pagePracticeQuestionProgress(rows, state.page)
  const summary = { id: ID, title: 'คลังฝึกตัวอย่าง · ทบทวนฟิสิกส์', status, classroom: ROOM, questionCount: questions.length, studentCount: students.length }
  return <ShellClient user={USER} initialUnreadCount={0} notificationsEnabled={false}>
    <PracticeManagementShell summary={summary} section={section} hrefBase={BASE} actions={{
      publish: async () => { if (scenario === 'error') return { ok: false, error: 'จำลองการเผยแพร่ไม่สำเร็จ' }; setStatus('published'); return { ok: true, id: ID } },
      close: async () => { if (scenario === 'error') return { ok: false, error: 'จำลองการหยุดไม่สำเร็จ' }; setStatus('closed'); return { ok: true, id: ID } },
    }}>
      <p className="text-xs text-muted-foreground">ข้อมูลจำลองสำหรับตรวจหน้าตาและการใช้งานในเครื่อง · ไม่มีการเขียนฐานข้อมูล{saved > 0 ? ` · บันทึกตัวอย่างแล้ว ${saved} ครั้ง` : ''}</p>
      {section === 'settings' ? <PracticeLibraryForm embedded classrooms={[ROOM]} questions={questions.map(row => ({ ...row, sub_question_count: 1, default_points: 1, has_random_values: false }))}
        initialLibrary={{ id: ID, title: summary.title, description: '', classroomId: ROOM.id, questionIds: questions.map(row => row.id), status,
          revealAnswerKey: true, accessCode: null, calculatorEnabled: true, scratchpadEnabled: true, shuffleQuestions: true, shuffleOptions: true }}
        actions={{ createPracticeLibrary: async () => ({ ok: true, id: ID }), updatePracticeLibrary: async () => ({ ok: true, id: ID }), deletePracticeLibrary: async () => ({ ok: false, error: 'หน้าตัวอย่างไม่ลบข้อมูล' }), onSaved: () => setSaved(value => value + 1) }} />
        : section === 'progress' && student ? <section className="flex min-w-0 flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{student.display_name}</h2><Button variant="ghost" render={<Link href={`${BASE}?tab=progress`} />}>รายชื่อนักเรียน</Button></div><p className="text-xs text-muted-foreground">เรียงข้อที่ฝึกแล้วก่อนข้อที่ยังไม่ได้ฝึก · 1 รอบนับเมื่อส่งคำตอบเพื่อตรวจสำเร็จ</p><PracticeStudentDetail libraryId={ID} studentId={student.student_id} rows={paged.questions} query={state.q} page={paged.page} totalPages={paged.totalPages} total={rows.length} hrefBase={BASE} /></section>
          : section === 'progress' ? <PracticeProgressDashboard libraryId={ID} totalQuestionCount={questions.length} rows={students} hrefBase={BASE} />
            : <div className="grid min-w-0 items-start gap-3 @min-[60rem]/practice-management:grid-cols-[minmax(0,1fr)_20rem]" data-practice-overview-grid><PracticeManagementQuestions libraryId={ID} questions={questions} error={scenario === 'error' ? 'จำลองโหลดโจทย์ไม่สำเร็จ' : null}
              previewLoader={async (_, ids) => ({ data: QUESTIONS.filter(row => ids.includes(row.id)).map(row => ({ ...row, is_random: false, variables: [], answer_parts: null, mcq_options: null, image_urls: [], extra_data: {} })) })} /><PracticeProgressDashboard libraryId={ID} totalQuestionCount={questions.length} rows={students} hrefBase={BASE} /></div>}
    </PracticeManagementShell>
  </ShellClient>
}

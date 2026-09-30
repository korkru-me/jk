'use client'

import { ClassroomScoresMatrix } from '@/app/(app)/classrooms/[id]/_components/classroom-scores-matrix'
import type { ClassroomAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/classroom-assignments-tab'

const id = (kind: number, value: number) =>
  `00000000-0000-4000-8${kind}00-${String(value).padStart(12, '0')}`

const students = [
  { id: id(1, 1), full_name: 'ก่อกุศล มาแสน', email: 'sunji.teen@gmail.com', grade_level: 'ม.3', section_number: 5, class_number: 3, student_code: '57290' },
  { id: id(1, 2), full_name: 'เด็กหญิงเด่น ดัก', email: 'sanglao.nil2@gmail.com', grade_level: null, section_number: null, class_number: null, student_code: null },
  { id: id(1, 3), full_name: 'เด็กชายก่อกุศล มาแสน', email: 'sunji.teen1@gmail.com', grade_level: 'ม.4', section_number: 8, class_number: 5, student_code: 'กดเกด' },
]

const assignments: ClassroomAssignmentRow[] = Array.from({ length: 7 }, (_, index) => ({
  id: id(2, index + 1),
  title: index === 0 ? 'ทดสอบ (สำเนา)' : `ทดสอบ ${index + 1}`,
  type: index === 3 ? 'exam' : 'exercise',
  mode: 'online',
  status: 'published',
  start_at: null,
  end_at: null,
  question_ids: [],
  random_question_count: null,
  completion_rule: null,
  streak_target: null,
  created_at: new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
  passing_type: 'percent',
  passing_value: 50,
  max_attempts: null,
  score_strategy: 'best',
  display_order: index,
  group_ids: null,
  category_id: null,
}))

const submissions = [
  { id: id(3, 1), assignment_id: assignments[0].id, student_id: students[0].id, status: 'submitted', total_score: 9, max_score: 9, submitted_at: '2026-09-30T01:00:00.000Z', attempt_number: 1 },
  { id: id(3, 2), assignment_id: assignments[1].id, student_id: students[1].id, status: 'submitted', total_score: 10, max_score: 11, submitted_at: '2026-09-30T01:00:00.000Z', attempt_number: 1 },
  { id: id(3, 3), assignment_id: assignments[3].id, student_id: students[0].id, status: 'submitted', total_score: 4, max_score: 9, submitted_at: '2026-09-30T01:00:00.000Z', attempt_number: 1 },
  { id: id(3, 4), assignment_id: assignments[4].id, student_id: students[1].id, status: 'submitted', total_score: 9, max_score: 11, submitted_at: '2026-09-30T01:00:00.000Z', attempt_number: 1 },
]

export function ScoresMatrixLabClient() {
  return (
    <main className="min-h-dvh bg-background p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">คะแนนและการส่งงาน</h1>
          <p className="text-sm text-muted-foreground">ข้อมูลจำลองสำหรับตรวจตาราง คอลัมน์ และการเรียงลำดับ</p>
        </div>
        <ClassroomScoresMatrix
          classroomId={id(4, 1)}
          classroomName="ห้องทดสอบ"
          students={students}
          assignments={assignments}
          categories={[]}
          submissions={submissions}
          extensions={[]}
        />
      </div>
    </main>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AssignmentList, type StudentAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/assignment-list'
import { ClassroomScoresMatrix } from '@/app/(app)/classrooms/[id]/_components/classroom-scores-matrix'
import type { ClassroomAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/classroom-assignments-tab'

const id = (kind: number, value: number) =>
  `00000000-0000-4000-8${kind}00-${String(value).padStart(12, '0')}`

const students = [
  { id: id(1, 1), full_name: 'นักเรียนตัวอย่าง 1', email: 'student1@example.invalid', grade_level: 'ม.3', section_number: 5, class_number: 3, student_code: '57290' },
  { id: id(1, 2), full_name: 'นักเรียนตัวอย่าง 2', email: 'student2@example.invalid', grade_level: null, section_number: null, class_number: null, student_code: null },
  { id: id(1, 3), full_name: 'นักเรียนตัวอย่าง 3', email: 'student3@example.invalid', grade_level: 'ม.4', section_number: 8, class_number: 5, student_code: '53001' },
]

const manyStudents = [
  { ...students[0], full_name: 'นักเรียนตัวอย่างชื่อยาวมาก สำหรับทดสอบการแสดงชื่อและนามสกุลให้ครบถ้วน' },
  ...students.slice(1),
  ...Array.from({ length: 33 }, (_, index) => ({
    id: id(1, index + 4), full_name: `นักเรียนตัวอย่าง ${index + 4}`, email: `student${index + 4}@example.invalid`,
    grade_level: 'ม.4', section_number: index % 5 + 1, class_number: index + 4, student_code: `53${String(index + 4).padStart(3, '0')}`,
  })),
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
  { id: id(3, 5), assignment_id: assignments[3].id, student_id: students[1].id, status: 'submitted', total_score: 0, max_score: 9, submitted_at: '2026-09-30T01:00:00.000Z', attempt_number: 1 },
  { id: id(3, 6), assignment_id: assignments[3].id, student_id: students[2].id, status: 'in_progress', total_score: null, max_score: 9, submitted_at: null, attempt_number: 1 },
  { id: id(3, 7), assignment_id: assignments[1].id, student_id: students[2].id, status: 'graded', total_score: 0, max_score: 11, submitted_at: '2026-09-30T01:00:00.000Z', attempt_number: 1 },
]

const studentAssignments: StudentAssignmentRow[] = assignments.map(assignment => ({
  ...assignment,
  duration_minutes: null,
  retry_scope: 'all',
  show_results: 'immediate',
  attempts_used: 0,
  has_in_progress: false,
  submission: null,
}))

export function ScoresMatrixLabClient() {
  const [studentView, setStudentView] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [showManyStudents, setShowManyStudents] = useState(false)
  return (
    <main className="min-h-dvh bg-background p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{studentView ? 'งานที่มอบหมาย · นักเรียนจำลอง' : 'คะแนนและการส่งงาน'}</h1>
          <p className="text-sm text-muted-foreground">ข้อมูลจำลองสำหรับตรวจตาราง คอลัมน์ และการเรียงลำดับ</p>
          <Button variant="outline" size="sm" onClick={() => setStudentView(value => !value)}>
            {studentView ? 'กลับตารางคะแนนจำลอง' : 'ดูงานในมุมนักเรียนจำลอง'}
          </Button>
          {!studentView && <Button variant="outline" size="sm" onClick={() => setReviewed(value => !value)}>
            {reviewed ? 'จำลองรอตรวจอีกครั้ง' : 'จำลองตรวจครบ'}
          </Button>}
          {!studentView && <Button variant="outline" size="sm" onClick={() => setShowManyStudents(value => !value)}>
            {showManyStudents ? 'กลับรายชื่อ 3 คน' : 'จำลองชื่อยาวและรายชื่อ 36 คน'}
          </Button>}
        </div>
        {studentView ? (
          <AssignmentList assignments={studentAssignments} categories={[]} />
        ) : (
          <ClassroomScoresMatrix
            classroomId={id(4, 1)}
            classroomName="ห้องทดสอบ"
            students={showManyStudents ? manyStudents : students}
            assignments={assignments}
            categories={[]}
            submissions={submissions}
            extensions={[]}
            pendingReviewByStudent={reviewed ? {} : { [assignments[3].id]: { [students[0].id]: true, [students[1].id]: true } }}
          />
        )}
      </div>
    </main>
  )
}

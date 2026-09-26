'use client'

import Link from 'next/link'
import { StudentAbilityTab } from '@/app/(app)/classrooms/[id]/_components/student-ability-tab'
import type { ClassroomAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/classroom-assignments-tab'
import type { StudentProfileRow } from '@/app/(app)/classrooms/[id]/_components/homeroom-overview'
import { LAB_SCENARIOS, type LabScenario } from './scenarios'


interface SubmissionRow {
  id: string; assignment_id: string; student_id: string; status: string
  total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
}

interface Room {
  title: string
  students: { id: string; full_name: string; email: string }[]
  assignments: ClassroomAssignmentRow[]
  profiles: Record<string, StudentProfileRow>
  submissions: SubmissionRow[]
  pendingReviewByAssignment: Record<string, number>
}

/** Ids nobody's database holds, so a stray click on a real link finds nothing. */
const labId = (group: number, n: number) =>
  `00000000-0000-4000-8${group}00-${String(n).padStart(12, '0')}`

/** Small seeded generator, so every load draws the same room. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['ธนภัทร', 'พิมพ์ชนก', 'ณัฐวุฒิ', 'กานต์ธิดา', 'ภูมิพัฒน์', 'ชลธิชา', 'ปัณณวัฒน์', 'อรุณรัตน์', 'ศุภกร', 'วรัญญา', 'กิตติพัฒน์', 'ธัญชนก', 'ปวริศ', 'นันท์นภัส', 'จิรายุ', 'สุพิชญา', 'ธีรภัทร', 'เบญญาภา', 'พีรพล', 'มณีรัตน์']
const LAST = ['สุขใส', 'รักดี', 'วงษ์ศรี', 'ทองคำ', 'แก้วประเสริฐ', 'ศรีสวัสดิ์', 'บุญมา', 'จันทร์เพ็ญ', 'ใจงาม', 'พรหมมา', 'เรืองศรี', 'สมบูรณ์']

function assignmentRow(
  n: number,
  title: string,
  type: string,
  strategy: ClassroomAssignmentRow['score_strategy'],
  status = 'published',
): ClassroomAssignmentRow {
  return {
    id: labId(1, n), title, type, mode: 'online', status,
    start_at: null, end_at: null, question_ids: [], random_question_count: null,
    completion_rule: null, streak_target: null,
    created_at: new Date(Date.UTC(2026, 5, 1 + n * 3)).toISOString(),
    passing_type: null, passing_value: null, max_attempts: null,
    score_strategy: strategy, display_order: null,
  }
}

function profileRow(studentId: string, classNumber: number | null, code: string | null): StudentProfileRow {
  return {
    student_id: studentId, grade_level: 'ม.4', section_number: 1,
    class_number: classNumber, student_code: code,
    nickname: null, date_of_birth: null, gender: null, food_allergy: null, chronic_disease: null,
    school_name: null, address: null, phone: null, guardians: [],
  } as StudentProfileRow
}

function rosterOf(count: number, longNameAt: number | null) {
  return Array.from({ length: count }, (_, i) => ({
    id: labId(2, i + 1),
    full_name: i === longNameAt
      ? 'กิตติพัฒน์ศักดิ์ชัยมงคล ศรีสวัสดิ์วงศ์ประเสริฐ'
      : `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    email: `student${i + 1}@example.invalid`,
  }))
}

/** Random hand-ins for a roster: each student has a steady skill plus noise. */
function randomSubmissions(
  seed: number,
  students: Room['students'],
  specs: { assignment: ClassroomAssignmentRow; max: number; handIn: number; inProgressChance?: number }[],
  skipStudent: number | null,
): SubmissionRow[] {
  const random = seeded(seed)
  const rows: SubmissionRow[] = []
  students.forEach((student, si) => {
    const skill = 0.35 + random() * 0.6
    if (si === skipStudent) return
    for (const spec of specs) {
      if (random() > spec.handIn) continue
      const attempts = spec.assignment.type === 'exercise' && random() < 0.3 ? 2 : 1
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const inProgress = attempt === attempts && random() < (spec.inProgressChance ?? 0)
        const share = Math.min(1, Math.max(0, skill + (random() - 0.5) * 0.35 + (attempt - 1) * 0.08))
        rows.push({
          id: labId(3, rows.length + 1),
          assignment_id: spec.assignment.id,
          student_id: student.id,
          status: inProgress ? 'in_progress' : 'submitted',
          total_score: inProgress ? null : Math.round(share * spec.max * 2) / 2,
          max_score: spec.max,
          submitted_at: inProgress ? null : spec.assignment.created_at,
          attempt_number: attempt,
        })
      }
    }
  })
  return rows
}

const DEFAULT_SPECS: { title: string; type: string; max: number; strategy: ClassroomAssignmentRow['score_strategy']; handIn: number }[] = [
  { title: 'แบบฝึกหัด: การเคลื่อนที่แนวตรง', type: 'exercise', max: 10, strategy: 'best', handIn: 0.95 },
  { title: 'แบบฝึกหัด: เวกเตอร์และการรวมแรง', type: 'exercise', max: 20, strategy: 'best', handIn: 0.9 },
  { title: 'ข้อสอบย่อย: กฎการเคลื่อนที่ของนิวตัน', type: 'exam', max: 25, strategy: 'best', handIn: 0.92 },
  { title: 'แบบฝึกหัด: แรงเสียดทาน', type: 'exercise', max: 10, strategy: 'latest', handIn: 0.85 },
  { title: 'การบ้าน: สมดุลกลและโมเมนต์ของแรง', type: 'exercise', max: 15, strategy: 'best', handIn: 0.8 },
  { title: 'ข้อสอบกลางภาค ฟิสิกส์ 1', type: 'exam', max: 40, strategy: 'best', handIn: 0.97 },
  { title: 'แบบฝึกหัด: งานและพลังงาน', type: 'exercise', max: 10, strategy: 'average', handIn: 0.75 },
  { title: 'แบบฝึกหัด: โมเมนตัมและการชน', type: 'exercise', max: 20, strategy: 'best', handIn: 0.3 },
]

function buildDefaultRoom(): Room {
  const assignments = DEFAULT_SPECS.map((spec, i) => assignmentRow(i + 1, spec.title, spec.type, spec.strategy))
  // A draft never reached students and must stay out of the picker.
  assignments.push(assignmentRow(99, 'ร่าง: การเคลื่อนที่แบบโพรเจกไทล์', 'exercise', 'best', 'draft'))
  const students = rosterOf(58, 7)
  const profiles: Record<string, StudentProfileRow> = {}
  students.forEach((s, i) => {
    // A few rows without เลขที่ or รหัส, the way a real roster arrives.
    profiles[s.id] = profileRow(s.id, i % 23 === 11 ? null : i + 1, i % 29 === 13 ? null : `65${1001 + i * 3}`)
  })
  const submissions = randomSubmissions(2569, students, DEFAULT_SPECS.map((spec, i) => ({
    assignment: assignments[i], max: spec.max, handIn: spec.handIn, inProgressChance: i === 7 ? 0.4 : 0,
  })), 4)
  return {
    title: 'ฟิสิกส์ 1 ม.4/1',
    students, assignments, profiles, submissions,
    pendingReviewByAssignment: { [assignments[5].id]: 7, [assignments[2].id]: 2 },
  }
}

const TOPICS = ['หน่วยและการวัด', 'การเคลื่อนที่แนวตรง', 'เวกเตอร์', 'กฎของนิวตัน', 'แรงเสียดทาน', 'สมดุลกล', 'งานและพลังงาน', 'โมเมนตัม', 'การเคลื่อนที่แบบวงกลม', 'การเคลื่อนที่แบบโพรเจกไทล์', 'การสั่นแบบฮาร์มอนิก', 'คลื่นกล', 'เสียง', 'ของไหล', 'ความร้อนและแก๊ส', 'ไฟฟ้าสถิต', 'ไฟฟ้ากระแส']

/** 26 students (one card spills onto page 2) and 18 งาน, so every chart is dense. */
function buildManyRoom(): Room {
  const assignments = Array.from({ length: 18 }, (_, i) => assignmentRow(
    i + 1,
    i === 17
      ? 'โครงงานปลายภาค: ออกแบบและทดลองวัดค่าความเร่งโน้มถ่วงของโลกด้วยลูกตุ้มอย่างง่ายพร้อมวิเคราะห์ความคลาดเคลื่อน'
      : `แบบฝึกหัดที่ ${i + 1}: ${TOPICS[i % TOPICS.length]}`,
    i % 6 === 5 ? 'exam' : 'exercise',
    'best',
  ))
  const students = rosterOf(26, null)
  const profiles: Record<string, StudentProfileRow> = {}
  students.forEach((s, i) => { profiles[s.id] = profileRow(s.id, i + 1, `66${2001 + i}`) })
  const submissions = randomSubmissions(3141, students, assignments.map((assignment, i) => ({
    assignment, max: 10 + (i % 4) * 5, handIn: 0.85,
  })), null)
  return { title: 'ฟิสิกส์ 2 ม.5/2', students, assignments, profiles, submissions, pendingReviewByAssignment: {} }
}

/** Hand-written rows for the cases a random room rarely draws. */
function buildEdgeRoom(): Room {
  const a = assignmentRow(1, 'แบบฝึกหัด: เต็ม 10', 'exercise', 'best')
  const b = assignmentRow(2, 'แบบสำรวจความเข้าใจ (ไม่มีคะแนน)', 'exercise', 'best')
  const c = assignmentRow(3, 'แบบฝึกหัด: นับค่าเฉลี่ยทุกครั้ง', 'exercise', 'average')
  const d = assignmentRow(4, 'ข้อสอบย่อย: นับครั้งล่าสุด', 'exam', 'latest')
  const students = [
    { id: labId(2, 1), full_name: 'สมชาย ใจดี', email: 'a@example.invalid' },
    { id: labId(2, 2), full_name: 'สมชาย ใจดี', email: 'b@example.invalid' },
    { id: labId(2, 3), full_name: 'ปวริศา ไม่มีโปรไฟล์', email: 'c@example.invalid' },
    { id: labId(2, 4), full_name: 'อนันต์ ยังไม่ส่งเลย', email: 'd@example.invalid' },
    { id: labId(2, 5), full_name: 'ชุติมา กำลังทำอยู่', email: 'e@example.invalid' },
    { id: labId(2, 6), full_name: 'Alex Johnson', email: 'f@example.invalid' },
  ]
  const profiles: Record<string, StudentProfileRow> = {
    [students[0].id]: profileRow(students[0].id, 3, 'ST-001'),
    [students[1].id]: profileRow(students[1].id, 1, 'st-002'),
    // students[2] has no profile row at all.
    [students[3].id]: profileRow(students[3].id, null, 'ST-004'),
    [students[4].id]: profileRow(students[4].id, 2, null),
    [students[5].id]: profileRow(students[5].id, 10, 'EX-10'),
  }
  let n = 0
  const row = (assignment: ClassroomAssignmentRow, student: number, score: number | null, max: number, over: Partial<SubmissionRow> = {}): SubmissionRow => ({
    id: labId(3, ++n), assignment_id: assignment.id, student_id: students[student].id,
    status: 'submitted', total_score: score, max_score: max, submitted_at: assignment.created_at, attempt_number: 1, ...over,
  })
  const submissions: SubmissionRow[] = [
    // สมชาย #1: every kind of attempt rule.
    row(a, 0, 10, 10),
    row(b, 0, 0, 0),
    row(c, 0, 12, 20), row(c, 0, 16, 20, { attempt_number: 2 }), row(c, 0, null, 20, { attempt_number: 3, status: 'in_progress', submitted_at: null }),
    row(d, 0, 15, 15), row(d, 0, 6, 15, { attempt_number: 2 }),
    // สมชาย #2: above full marks, a teacher-graded attempt, D not sent.
    row(a, 1, 11, 10),
    row(c, 1, 20, 20, { status: 'graded' }),
    // No profile: handed in and scored nothing.
    row(a, 2, 0, 10),
    // Still working on the only thing they opened.
    row(a, 4, null, 10, { status: 'in_progress', submitted_at: null }),
    // Alex: everything.
    row(a, 5, 7, 10), row(b, 5, 0, 0), row(c, 5, 9, 20), row(d, 5, 12, 15),
  ]
  return {
    title: 'ห้องทดสอบกรณีขอบ',
    students, assignments: [a, b, c, d], profiles, submissions,
    pendingReviewByAssignment: { [d.id]: 1 },
  }
}

const ROOMS: Record<Exclude<LabScenario, 'empty'>, () => Room> = {
  default: buildDefaultRoom,
  many: buildManyRoom,
  edge: buildEdgeRoom,
}

export function StudentAbilityLabClient({ scenario }: { scenario: LabScenario }) {
  const room = ROOMS[scenario === 'empty' ? 'default' : scenario]()
  const empty = scenario === 'empty'
  return (
    <main className="mx-auto max-w-[1200px] space-y-4 p-4 sm:p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">ห้องทดลอง · ข้อมูลสังเคราะห์</p>
        <h1 className="text-xl font-bold text-foreground">ศักยภาพผู้เรียน — {room.title}</h1>
        <nav aria-label="สถานการณ์ทดสอบ" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {LAB_SCENARIOS.map(s => (
            <Link
              key={s.key}
              href={s.key === 'default' ? '?' : `?scenario=${s.key}`}
              aria-current={s.key === scenario ? 'page' : undefined}
              className={s.key === scenario ? 'font-semibold text-foreground' : 'text-primary hover:underline'}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>
      <StudentAbilityTab
        // A different room is a different classroom: fresh state and its own remembered choices.
        key={scenario}
        classroomId={`lab-student-ability-${scenario}`}
        students={room.students}
        assignments={empty ? [] : room.assignments}
        submissions={empty ? [] : room.submissions}
        profiles={room.profiles}
        pendingReviewByAssignment={empty ? {} : room.pendingReviewByAssignment}
      />
    </main>
  )
}

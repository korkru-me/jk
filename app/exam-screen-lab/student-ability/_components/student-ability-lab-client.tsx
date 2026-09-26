'use client'

import { StudentAbilityTab } from '@/app/(app)/classrooms/[id]/_components/student-ability-tab'
import type { ClassroomAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/classroom-assignments-tab'
import type { StudentProfileRow } from '@/app/(app)/classrooms/[id]/_components/homeroom-overview'

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

const ASSIGNMENTS: { title: string; type: string; max: number; strategy: ClassroomAssignmentRow['score_strategy']; handIn: number }[] = [
  { title: 'แบบฝึกหัด: การเคลื่อนที่แนวตรง', type: 'exercise', max: 10, strategy: 'best', handIn: 0.95 },
  { title: 'แบบฝึกหัด: เวกเตอร์และการรวมแรง', type: 'exercise', max: 20, strategy: 'best', handIn: 0.9 },
  { title: 'ข้อสอบย่อย: กฎการเคลื่อนที่ของนิวตัน', type: 'exam', max: 25, strategy: 'best', handIn: 0.92 },
  { title: 'แบบฝึกหัด: แรงเสียดทาน', type: 'exercise', max: 10, strategy: 'latest', handIn: 0.85 },
  { title: 'การบ้าน: สมดุลกลและโมเมนต์ของแรง', type: 'exercise', max: 15, strategy: 'best', handIn: 0.8 },
  { title: 'ข้อสอบกลางภาค ฟิสิกส์ 1', type: 'exam', max: 40, strategy: 'best', handIn: 0.97 },
  { title: 'แบบฝึกหัด: งานและพลังงาน', type: 'exercise', max: 10, strategy: 'average', handIn: 0.75 },
  { title: 'แบบฝึกหัด: โมเมนตัมและการชน', type: 'exercise', max: 20, strategy: 'best', handIn: 0.3 },
]

function buildRoom() {
  const random = seeded(2569)
  const assignments: ClassroomAssignmentRow[] = ASSIGNMENTS.map((a, i) => ({
    id: labId(1, i + 1),
    title: a.title,
    type: a.type,
    mode: 'online',
    status: 'published',
    start_at: null,
    end_at: null,
    question_ids: [],
    random_question_count: null,
    completion_rule: null,
    streak_target: null,
    created_at: new Date(Date.UTC(2026, 5, 1 + i * 7)).toISOString(),
    passing_type: null,
    passing_value: null,
    max_attempts: null,
    score_strategy: a.strategy,
    display_order: null,
  }))
  // A draft never reached students and must stay out of the picker.
  assignments.push({
    ...assignments[0],
    id: labId(1, 99),
    title: 'ร่าง: การเคลื่อนที่แบบโพรเจกไทล์',
    status: 'draft',
    created_at: new Date(Date.UTC(2026, 8, 1)).toISOString(),
  })

  const students = Array.from({ length: 58 }, (_, i) => {
    const name = i === 7
      ? 'กิตติพัฒน์ศักดิ์ชัยมงคล ศรีสวัสดิ์วงศ์ประเสริฐ'
      : `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`
    return { id: labId(2, i + 1), full_name: name, email: `student${i + 1}@example.invalid` }
  })

  const profiles: Record<string, StudentProfileRow> = {}
  students.forEach((s, i) => {
    profiles[s.id] = {
      student_id: s.id,
      grade_level: 'ม.4',
      section_number: 1,
      // A few rows without เลขที่ or รหัส, the way a real roster arrives.
      class_number: i % 23 === 11 ? null : i + 1,
      student_code: i % 29 === 13 ? null : `65${String(1001 + i * 3)}`,
      nickname: null, date_of_birth: null, gender: null, food_allergy: null, chronic_disease: null,
      school_name: null, address: null, phone: null, guardians: [],
    } as StudentProfileRow
  })

  const submissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[] = []
  let row = 0
  students.forEach((student, si) => {
    const skill = 0.35 + random() * 0.6
    // Student 5 has handed nothing in, so "–" and no average are on screen.
    if (si === 4) return
    assignments.forEach((assignment, ai) => {
      const spec = ASSIGNMENTS[ai]
      if (!spec || random() > spec.handIn) return
      const attempts = spec.type === 'exercise' && random() < 0.3 ? 2 : 1
      for (let attempt = 1; attempt <= attempts; attempt++) {
        row += 1
        const inProgress = attempt === attempts && ai === 7 && random() < 0.4
        const share = Math.min(1, Math.max(0, skill + (random() - 0.5) * 0.35 + (attempt - 1) * 0.08))
        submissions.push({
          id: labId(3, row),
          assignment_id: assignment.id,
          student_id: student.id,
          status: inProgress ? 'in_progress' : 'submitted',
          total_score: inProgress ? null : Math.round(share * spec.max * 2) / 2,
          max_score: spec.max,
          submitted_at: inProgress ? null : assignment.created_at,
          attempt_number: attempt,
        })
      }
    })
  })

  return {
    students,
    assignments,
    profiles,
    submissions,
    pendingReviewByAssignment: { [assignments[5].id]: 7, [assignments[2].id]: 2 },
  }
}

const ROOM = buildRoom()

export function StudentAbilityLabClient({ empty }: { empty: boolean }) {
  return (
    <main className="mx-auto max-w-[1200px] space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">ห้องทดลอง · ข้อมูลสังเคราะห์</p>
        <h1 className="text-xl font-bold text-foreground">ศักยภาพผู้เรียน — ฟิสิกส์ 1 ม.4/1</h1>
      </div>
      <StudentAbilityTab
        classroomId="lab-student-ability"
        students={ROOM.students}
        assignments={empty ? [] : ROOM.assignments}
        submissions={empty ? [] : ROOM.submissions}
        profiles={ROOM.profiles}
        pendingReviewByAssignment={empty ? {} : ROOM.pendingReviewByAssignment}
      />
    </main>
  )
}

'use client'

import { useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import type { GroupState } from '@/app/(app)/classrooms/[id]/_components/breakout-groups'
import {
  ClassroomPeopleTabs, type PeopleView,
} from '@/app/(app)/classrooms/[id]/_components/classroom-people-tabs'
import type { StudentProfileRow } from '@/app/(app)/classrooms/[id]/_components/homeroom-overview'
import {
  ClassroomAssignmentsTab,
  type ClassroomAssignmentRow,
} from '@/app/(app)/classrooms/[id]/_components/classroom-assignments-tab'
import { GroupActionsProvider, type GroupActions } from '@/app/(app)/classrooms/[id]/_components/group-actions-context'
import { AssignmentCreationMenu } from '@/components/assignments/assignment-creation-menu'
import { AssignmentReviewSummary } from '@/components/assignments/assignment-review-summary'
import { GroupTargetPicker, type GroupTargets } from '@/components/assignments/group-target-picker'
import { GROUP_COLOR_IDS, type ClassroomGroup } from '@/lib/classroom-groups'
import { nextStudentSortRules, type StudentSortRule } from '@/lib/student-sort'
import { ClassroomAccessPanel } from '@/app/(app)/classrooms/[id]/_components/classroom-access-panel'
import { JoinClassroomForm } from '@/components/classrooms/join-classroom-form'
import type { AssignmentCategory } from '@/lib/assignment-categories'

export type GroupsLabScenario = 'default' | 'many' | 'empty'

const CLASSROOM_ID = '00000000-0000-4000-8000-000000000001'
const CATEGORY_ONE_ID = '00000000-0000-4000-c000-000000000001'
const CATEGORY_TWO_ID = '00000000-0000-4000-c000-000000000002'

const LAB_CATEGORIES: AssignmentCategory[] = [
  {
    id: CATEGORY_ONE_ID,
    classroom_id: CLASSROOM_ID,
    name: 'ฟิสิกส์ง่าย',
    color: 'purple',
    position: 0,
  },
  {
    id: CATEGORY_TWO_ID,
    classroom_id: CLASSROOM_ID,
    name: 'กลศาสตร์',
    color: 'blue',
    position: 1,
  },
]

const LAB_ASSIGNMENTS: ClassroomAssignmentRow[] = [
  {
    id: '00000000-0000-4000-b000-000000000001',
    title: 'แบบฝึกหัดที่กำลังเตรียมโจทย์',
    type: 'exercise',
    mode: 'standard',
    status: 'draft',
    start_at: null,
    end_at: null,
    question_ids: ['q1', 'q2', 'q3'],
    random_question_count: null,
    completion_rule: null,
    streak_target: null,
    created_at: '2026-09-27T08:00:00.000Z',
    passing_type: null,
    passing_value: null,
    max_attempts: null,
    score_strategy: 'best',
    display_order: 1,
    category_id: CATEGORY_ONE_ID,
    group_ids: null,
  },
  {
    id: '00000000-0000-4000-b000-000000000002',
    title: 'การเคลื่อนที่แบบโปรเจกไทล์',
    type: 'exercise',
    mode: 'standard',
    status: 'published',
    start_at: null,
    end_at: null,
    question_ids: ['q1', 'q2', 'q3', 'q4', 'q5'],
    random_question_count: null,
    completion_rule: null,
    streak_target: null,
    created_at: '2026-09-28T08:00:00.000Z',
    passing_type: 'percent',
    passing_value: 80,
    max_attempts: 3,
    score_strategy: 'best',
    display_order: 2,
    category_id: null,
    group_ids: null,
  },
  {
    id: '00000000-0000-4000-b000-000000000003',
    title: 'ทบทวนก่อนสอบกลางภาค',
    type: 'exercise',
    mode: 'standard',
    status: 'closed',
    start_at: null,
    end_at: '2026-09-29T08:00:00.000Z',
    question_ids: ['q1', 'q2', 'q3', 'q4'],
    random_question_count: null,
    completion_rule: null,
    streak_target: null,
    created_at: '2026-09-29T08:00:00.000Z',
    passing_type: 'percent',
    passing_value: 70,
    max_attempts: 1,
    score_strategy: 'best',
    display_order: 3,
    category_id: null,
    group_ids: null,
  },
]

const FIRST = ['กนกธร', 'กมลวรรณ', 'ขวัญหทัย', 'จิรัชญา', 'ชญานิษฐ์', 'ชลดา', 'ชลธิชา', 'โชติกา', 'ชาคริต', 'ณัฐวุฒิ', 'ธนกร', 'ธีรภัทร', 'นภัสสร', 'ปภาวรินทร์', 'พิมพ์ชนก', 'ภูมิพัฒน์', 'วรินทร', 'ศุภกร', 'สิรินดา', 'อนันดา']
const LAST = ['พรมยศ', 'จินามา', 'ขัติยเนตร', 'สุวราพัฒนากรณ์', 'คงธนอนันต์', 'ปัญญาดิบวงศ์', 'ทะยศ', 'บุญหนอ', 'ศรีสุข', 'ใจดี', 'มั่นคง', 'รุ่งเรือง']

function students(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`,
    // Two students share a name on purpose — the lists must still tell them apart by id.
    full_name: i === 7 ? `${FIRST[7]} ${LAST[7]}` : `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    grade_level: i % 13 === 0 ? null : `ม.${4 + (i % 3)}`,
    section_number: i % 11 === 0 ? null : (i % 4) + 1,
    class_number: i + 1,
    student_code: `2569${String(i + 1).padStart(4, '0')}`,
  })).sort((a, b) => a.full_name.localeCompare(b.full_name, 'th'))
}

function group(i: number, name: string): ClassroomGroup {
  return {
    id: `00000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`,
    classroom_id: CLASSROOM_ID,
    name,
    color: GROUP_COLOR_IDS[i % GROUP_COLOR_IDS.length],
    position: i,
  }
}

function initial(scenario: GroupsLabScenario) {
  if (scenario === 'empty') return { roster: students(20), state: { groups: [], members: {} } }
  const roster = students(scenario === 'many' ? 143 : 32)
  const groups = scenario === 'many'
    ? ['ทีมปลาโลมา', 'ทีมนกฮูก', 'ทีมเสือ', 'ทีมช้าง', 'ทีมผีเสื้อ', 'ทีมกระต่าย'].map((n, i) => group(i, n))
    : ['กลุ่มทดลองที่ 1', 'กลุ่มทดลองที่ 2', 'กลุ่มควบคุม', 'กลุ่มเสริม'].map((n, i) => group(i, n))
  // Deterministic: the first two-thirds are placed, the rest wait in the pool.
  const placed = roster.slice(0, Math.floor(roster.length * 2 / 3))
  const members: Record<string, string> = {}
  placed.forEach((s, i) => { members[s.id] = groups[i % groups.length].id })
  return { roster, state: { groups, members } }
}

const wait = () => new Promise(resolve => setTimeout(resolve, 350))

export function ClassroomGroupsLabClient({ scenario, fail }: { scenario: GroupsLabScenario; fail: boolean }) {
  const seed = useMemo(() => initial(scenario), [scenario])
  const [state, setState] = useState<GroupState>(seed.state)
  const [targets, setTargets] = useState<GroupTargets>({})
  const [peopleView, setPeopleView] = useState<PeopleView>('students')
  const [sortRules, setSortRules] = useState<StudentSortRule[]>([{ key: 'name', dir: 'asc' }])
  const counter = useRef(100)
  // The fake "server" keeps its own copy, like the database would.
  const server = useRef<GroupState>(seed.state)

  const actions: GroupActions = useMemo(() => {
    const refuse = { ok: false as const, error: '(ห้องทดลอง) บันทึกไม่สำเร็จ — หน้าจอควรย้อนกลับเป็นแบบเดิม' }
    return {
      async createClassroomGroup(_classroomId, input) {
        await wait()
        if (fail) return refuse
        const g: ClassroomGroup = {
          ...group(counter.current++, input.name),
          color: input.color as ClassroomGroup['color'],
          position: server.current.groups.length,
        }
        server.current = { ...server.current, groups: [...server.current.groups, g] }
        return { ok: true as const, group: g }
      },
      async updateClassroomGroup(_classroomId, groupId, patch) {
        await wait()
        if (fail) return refuse
        const g = server.current.groups.find(x => x.id === groupId)
        if (!g) return refuse
        const next = { ...g, ...patch } as ClassroomGroup
        server.current = { ...server.current, groups: server.current.groups.map(x => (x.id === groupId ? next : x)) }
        return { ok: true as const, group: next }
      },
      async deleteClassroomGroup(_classroomId, groupId) {
        await wait()
        if (fail) return refuse
        server.current = {
          groups: server.current.groups.filter(g => g.id !== groupId),
          members: Object.fromEntries(Object.entries(server.current.members).filter(([, g]) => g !== groupId)),
        }
        return { ok: true as const }
      },
      async reorderClassroomGroups(_classroomId, orderedIds) {
        await wait()
        if (fail) return refuse
        server.current = {
          ...server.current,
          groups: orderedIds.map((id, position) => ({ ...server.current.groups.find(g => g.id === id)!, position })),
        }
        return { ok: true as const }
      },
      async moveStudentsToGroup(_classroomId, studentIds, groupId) {
        await wait()
        if (fail) return refuse
        const members = { ...server.current.members }
        for (const id of studentIds) {
          if (groupId) members[id] = groupId
          else delete members[id]
        }
        server.current = { ...server.current, members }
        return { ok: true as const }
      },
    }
  }, [fail])

  const groupOptions = {
    [CLASSROOM_ID]: state.groups.map(g => ({
      id: g.id,
      name: g.name,
      color: g.color,
      memberCount: Object.values(state.members).filter(id => id === g.id).length,
    })),
  }
  const roster = seed.roster.map(student => ({
    id: student.id,
    full_name: student.full_name,
    email: `${student.student_code}@example.invalid`,
  }))
  const profiles = Object.fromEntries(seed.roster.map(student => [student.id, {
    student_id: student.id,
    grade_level: student.grade_level,
    section_number: student.section_number,
    class_number: student.class_number,
    student_code: student.student_code,
    nickname: null,
    date_of_birth: null,
    gender: null,
    food_allergy: null,
    chronic_disease: null,
    school_name: null,
    address: null,
    phone: null,
    guardians: [],
  } as StudentProfileRow]))

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">ห้องทดลอง: นักเรียนและกลุ่ม</h1>
        <p className="text-sm text-muted-foreground">
          ข้อมูลจำลอง {seed.roster.length} คน · การบันทึกทั้งหมดอยู่ในหน่วยความจำของแท็บนี้
          {fail && ' · โหมด ?fail=1: ทุกการบันทึกจะล้มเหลว'}
        </p>
      </div>

      <div className="flex justify-start rounded-2xl bg-foreground p-6 text-background sm:justify-end">
        <ClassroomAccessPanel
          classCode="ABC123"
          canManage
          onCover={false}
          mutedClassName="text-background/60"
        />
      </div>

      <Card padding="lg" className="flex max-w-md flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">ตัวอย่างปลายทางลิงก์เชิญนักเรียน</p>
        <p className="text-xs text-muted-foreground">เมื่อเปิดลิงก์ ระบบเติมรหัสห้องเรียนให้พร้อมกดเข้าร่วม</p>
        <JoinClassroomForm initialCode="ABC123" />
      </Card>

      <GroupActionsProvider value={actions}>
        <ClassroomPeopleTabs
          classroomId={CLASSROOM_ID}
          students={roster}
          groupStudents={seed.roster}
          profiles={profiles}
          canManage
          sortRules={sortRules}
          onToggleSort={key => setSortRules(current => nextStudentSortRules(current, key))}
          groupState={state}
          setGroupState={setState}
          assignmentTitlesByGroup={new Map(state.groups.slice(0, 1).map(g => [g.id, ['แบบฝึกหัดเรื่องแรงและการเคลื่อนที่']]))}
          value={peopleView}
          onValueChange={setPeopleView}
        />
      </GroupActionsProvider>

      <Card padding="lg" className="max-w-2xl space-y-2">
        <p className="text-sm font-semibold text-foreground">ตัวอย่างช่อง “มอบหมายให้” ในหน้าสร้างงาน</p>
        <GroupTargetPicker
          classrooms={[{ id: CLASSROOM_ID, name: 'ฟิสิกส์ ม.4/1 (จำลอง)' }]}
          groupsByClassroom={groupOptions}
          value={targets}
          onChange={setTargets}
          idPrefix="lab-target"
        />
      </Card>

      <Card padding="lg" className="flex max-w-sm flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">ตัวอย่างเมนู “มอบหมายงาน”</p>
        <AssignmentCreationMenu
          classroomId={CLASSROOM_ID}
          label="มอบหมายงาน"
          variant="primaryGhost"
          align="start"
          className="w-full justify-start"
        />
      </Card>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">ตัวอย่างรายการงานและการลากเรียง</h2>
          <p className="text-sm text-muted-foreground">
            มีครบทั้งฉบับร่าง เผยแพร่แล้ว และปิดแล้ว · ลำดับที่ลากอยู่ในหน่วยความจำของแท็บนี้
          </p>
        </div>
        <ClassroomAssignmentsTab
          classroomId={CLASSROOM_ID}
          assignments={LAB_ASSIGNMENTS}
          categories={LAB_CATEGORIES}
          submissions={[]}
          studentCount={32}
          pendingReviewByAssignment={{}}
          onReorderAssignments={async () => {
            await wait()
            return fail
              ? { error: '(ห้องทดลอง) บันทึกลำดับไม่สำเร็จ — รายการควรย้อนกลับเป็นแบบเดิม' }
              : {}
          }}
          onSetAssignmentCategory={async () => {
            await wait()
            return fail
              ? { ok: false, error: '(ห้องทดลอง) ย้ายกลุ่มไม่สำเร็จ — งานควรกลับไปอยู่กลุ่มเดิม' }
              : { ok: true }
          }}
        />
      </section>

      <div className="max-w-2xl">
        <AssignmentReviewSummary
          mode="copy"
          rows={[
            { label: 'ชื่อ', value: 'ทดสอบระบบตรวจกลับไปให้คะแนนเอง (สำเนา)' },
            { label: 'ห้องเรียน', value: 'ทดสอบ สอบแก้กลางภาค' },
            { label: 'มอบหมายให้', value: 'นักเรียนทุกคนในห้อง' },
            { label: 'ประเภท', value: '🔁 แบบฝึกหัด' },
            { label: 'โจทย์', value: '5 ข้อ' },
            { label: 'คะแนนเต็ม', value: '11 คะแนน' },
            { label: 'เงื่อนไขจบ', value: 'ทำครบแล้วจบ' },
            { label: 'วิธีเก็บคะแนน', value: 'คะแนนครั้งที่ดีที่สุด' },
            { label: 'แสดงผล', value: 'ทันทีหลังส่ง' },
          ]}
        />
      </div>
    </div>
  )
}

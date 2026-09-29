'use client'

import { useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { BreakoutGroups, type GroupState } from '@/app/(app)/classrooms/[id]/_components/breakout-groups'
import { GroupActionsProvider, type GroupActions } from '@/app/(app)/classrooms/[id]/_components/group-actions-context'
import { GroupTargetPicker, type GroupTargets } from '@/components/assignments/group-target-picker'
import { GROUP_COLOR_IDS, type ClassroomGroup } from '@/lib/classroom-groups'

export type GroupsLabScenario = 'default' | 'many' | 'empty'

const CLASSROOM_ID = '00000000-0000-4000-8000-000000000001'

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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">ห้องทดลอง: กลุ่มย่อย</h1>
        <p className="text-sm text-muted-foreground">
          ข้อมูลจำลอง {seed.roster.length} คน · การบันทึกทั้งหมดอยู่ในหน่วยความจำของแท็บนี้
          {fail && ' · โหมด ?fail=1: ทุกการบันทึกจะล้มเหลว'}
        </p>
      </div>

      <GroupActionsProvider value={actions}>
        <BreakoutGroups
          classroomId={CLASSROOM_ID}
          students={seed.roster}
          state={state}
          setState={setState}
          canManage
          assignmentTitlesByGroup={new Map(state.groups.slice(0, 1).map(g => [g.id, ['แบบฝึกหัดเรื่องแรงและการเคลื่อนที่']]))}
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
    </div>
  )
}

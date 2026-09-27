import { describe, it, expect } from 'vitest'
import {
  GROUP_COLOR_IDS,
  assignmentReachesStudent,
  cleanGroupTarget,
  defaultGroupName,
  describeGroupTarget,
  isGroupColorId,
  linkReachesGroup,
  nextGroupColor,
  normalizeGroupName,
  splitIntoGroups,
  targetedStudentIds,
} from './classroom-groups'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'

describe('group colours', () => {
  it('are exactly the classroom cover colours, which the CHECK constraint also lists', () => {
    expect([...GROUP_COLOR_IDS].sort()).toEqual(COVER_PRESETS.map(p => p.id).sort())
  })

  it('rejects anything outside the palette', () => {
    expect(isGroupColorId('mint')).toBe(true)
    expect(isGroupColorId('#ff0000')).toBe(false)
    expect(isGroupColorId(undefined)).toBe(false)
  })

  it('hands out a different colour to each of the first nine groups, then cycles', () => {
    const used: string[] = []
    for (let i = 0; i < GROUP_COLOR_IDS.length; i++) used.push(nextGroupColor(used))
    expect(new Set(used).size).toBe(GROUP_COLOR_IDS.length)
    expect(nextGroupColor(used)).toBe(GROUP_COLOR_IDS[0])
  })

  it('fills the colour nobody uses before repeating one', () => {
    expect(nextGroupColor(['purple', 'purple', 'blue'])).toBe('sky')
  })
})

describe('group names', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeGroupName('  กลุ่ม   ปลาโลมา ')).toBe('กลุ่ม ปลาโลมา')
  })

  it('refuses empty and over-long names', () => {
    expect(normalizeGroupName('   ')).toBeNull()
    expect(normalizeGroupName('ก'.repeat(61))).toBeNull()
    expect(normalizeGroupName(42)).toBeNull()
  })

  it('suggests the smallest free number', () => {
    expect(defaultGroupName([])).toBe('กลุ่มที่ 1')
    expect(defaultGroupName(['กลุ่มที่ 1', 'กลุ่มที่ 3'])).toBe('กลุ่มที่ 2')
    expect(defaultGroupName(['ทีมแดง'])).toBe('กลุ่มที่ 1')
  })
})

describe('who a งาน reaches', () => {
  it('a whole-classroom link reaches everyone, grouped or not', () => {
    expect(linkReachesGroup(null, undefined)).toBe(true)
    expect(linkReachesGroup(null, 'g1')).toBe(true)
  })

  it('a group link reaches only members of those groups', () => {
    expect(linkReachesGroup(['g1', 'g2'], 'g2')).toBe(true)
    expect(linkReachesGroup(['g1'], 'g2')).toBe(false)
    expect(linkReachesGroup(['g1'], undefined)).toBe(false)
  })

  it('an emptied group list reaches nobody — deleting the groups never widens a งาน', () => {
    expect(linkReachesGroup([], 'g1')).toBe(false)
  })

  const links = [
    { classroom_id: 'room-a', group_ids: ['g1'] },
    { classroom_id: 'room-b', group_ids: null },
  ]

  it('needs enrolment in the linked classroom', () => {
    expect(assignmentReachesStudent(links, new Set(['room-c']), new Map())).toBe(false)
  })

  it('any one reaching link is enough', () => {
    expect(assignmentReachesStudent(links, new Set(['room-a', 'room-b']), new Map())).toBe(true)
  })

  it('checks the group in the link\'s own classroom', () => {
    const enrolled = new Set(['room-a'])
    expect(assignmentReachesStudent(links, enrolled, new Map([['room-a', 'g1']]))).toBe(true)
    expect(assignmentReachesStudent(links, enrolled, new Map([['room-a', 'g2']]))).toBe(false)
    // Being in g1 of some other room does not count.
    expect(assignmentReachesStudent(links, enrolled, new Map([['room-z', 'g1']]))).toBe(false)
  })

  it('keeps a started งาน reachable after the student moves out of the group', () => {
    const enrolled = new Set(['room-a'])
    expect(assignmentReachesStudent(links, enrolled, new Map([['room-a', 'g2']]), true)).toBe(true)
  })

  it('but a submission does not stand in for being on the roster', () => {
    expect(assignmentReachesStudent(links, new Set(), new Map(), true)).toBe(false)
  })
})

describe('targetedStudentIds', () => {
  const roster = ['s1', 's2', 's3']
  const groupOf = new Map([['s1', 'g1'], ['s2', 'g2']])

  it('is the whole roster for a whole-classroom link', () => {
    expect(targetedStudentIds(null, roster, groupOf)).toEqual(new Set(roster))
  })

  it('is only the chosen groups\' members otherwise', () => {
    expect(targetedStudentIds(['g2'], roster, groupOf)).toEqual(new Set(['s2']))
    expect(targetedStudentIds([], roster, groupOf)).toEqual(new Set())
  })
})

describe('splitIntoGroups', () => {
  it('places everyone, with sizes differing by at most one', () => {
    const students = Array.from({ length: 23 }, (_, i) => `s${i}`)
    const result = splitIntoGroups(students, ['a', 'b', 'c', 'd'])
    expect(result.size).toBe(23)
    const sizes = ['a', 'b', 'c', 'd'].map(g => [...result.values()].filter(v => v === g).length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('shuffles with the random source it is given', () => {
    const students = ['s1', 's2', 's3', 's4']
    const first = splitIntoGroups(students, ['a', 'b'], () => 0)
    const second = splitIntoGroups(students, ['a', 'b'], () => 0.99)
    expect([...first.entries()]).not.toEqual([...second.entries()])
  })

  it('places nobody when there are no groups', () => {
    expect(splitIntoGroups(['s1'], []).size).toBe(0)
  })
})

describe('cleanGroupTarget', () => {
  const groups = new Set(['g1', 'g2'])

  it('treats a missing choice as the whole classroom', () => {
    expect(cleanGroupTarget(null, groups)).toBeNull()
    expect(cleanGroupTarget(undefined, groups)).toBeNull()
  })

  it('drops ids that are not groups of this classroom, and duplicates', () => {
    expect(cleanGroupTarget(['g1', 'other-room-group', 'g1'], groups)).toEqual(['g1'])
  })

  it('refuses a group choice with no real group left in it', () => {
    expect(cleanGroupTarget([], groups)).toBe('invalid')
    expect(cleanGroupTarget(['nope'], groups)).toBe('invalid')
    expect(cleanGroupTarget('g1', groups)).toBe('invalid')
  })
})

describe('describeGroupTarget', () => {
  const names = new Map([['g1', 'ทีมแดง'], ['g2', 'ทีมฟ้า']])
  it('names the groups, or says ทั้งห้อง', () => {
    expect(describeGroupTarget(null, names)).toBe('ทั้งห้อง')
    expect(describeGroupTarget(['g1', 'g2'], names)).toBe('ทีมแดง, ทีมฟ้า')
    expect(describeGroupTarget(['gone'], names)).toBe('ไม่มีกลุ่ม (กลุ่มที่เลือกถูกลบแล้ว)')
  })
})

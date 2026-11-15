import { afterEach, expect, it, vi } from 'vitest'
import { composeDescription, EMPTY_META } from '@/app/(app)/classrooms/_components/classroom-meta'
import { readAssignmentClassroomCover } from './assignment-classroom-appearance.server'

vi.mock('server-only', () => ({}))
const from = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))

function visibleRooms(data: Array<{ classroom_id: string; classrooms: { description: string | null } }> | null, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data, error }),
  }
  from.mockReturnValue(query)
  return query
}

afterEach(() => vi.resetAllMocks())

it('uses the primary classroom only when its link is visible to the viewer', async () => {
  const room = (id: string, cover: string) => ({
    classroom_id: id, classrooms: { description: composeDescription({ ...EMPTY_META, cover }) },
  })
  const query = visibleRooms([room('room-a', 'sky'), room('room-b', 'amber')])
  await expect(readAssignmentClassroomCover('test-assignment', 'room-b')).resolves.toBe('amber')
  await expect(readAssignmentClassroomCover('test-assignment', 'other-room')).resolves.toBe('sky')
  expect(from).toHaveBeenCalledWith('assignment_classrooms')
  expect(query.eq).toHaveBeenCalledWith('assignment_id', 'test-assignment')
  expect(query.eq).toHaveBeenCalledWith('classrooms.status', 'active')
  expect(query.is).toHaveBeenCalledWith('classrooms.deleted_at', null)
})

it('uses the default appearance when the classroom read fails', async () => {
  visibleRooms(null, { code: '42501' })
  await expect(readAssignmentClassroomCover('test-assignment')).resolves.toBe('')
})

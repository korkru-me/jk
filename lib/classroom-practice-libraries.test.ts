import { describe, expect, it, vi } from 'vitest'
import { classroomPracticeLibraryItem } from './classroom-practice-libraries'

vi.mock('server-only', () => ({}))
import { loadClassroomPracticeLibraries } from './classroom-practice-libraries.server'

function sessionClient(data: unknown[] | null, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data, error }),
  }
  const client = { from: vi.fn().mockReturnValue(query) }
  return {
    query,
    client: client as unknown as Parameters<typeof loadClassroomPracticeLibraries>[0],
    from: client.from,
  }
}

const published = { id: 'library', title: 'คลังฝึก', status: 'published', practice_library_questions: [{ count: 143 }] }

describe('classroom practice list', () => {
  it('loads the exact classroom and uses a safe summary with a relation count', async () => {
    const { client, query, from } = sessionClient([published])
    expect(await loadClassroomPracticeLibraries(client, 'room', 'classroom_owner')).toEqual({
      items: [{ id: 'library', title: 'คลังฝึก', status: 'published', questionCount: 143 }], error: null,
    })
    expect(from).toHaveBeenCalledWith('practice_libraries')
    expect(query.eq).toHaveBeenCalledWith('classroom_id', 'room')
    expect(query.select).toHaveBeenCalledWith('id, title, status, practice_library_questions(count)')
  })

  it('shows only published libraries to a student even if a relation response includes drafts', async () => {
    const { client, query } = sessionClient([published, { ...published, id: 'draft', status: 'draft' }, { ...published, id: 'closed', status: 'closed' }])
    const result = await loadClassroomPracticeLibraries(client, 'room', 'student_member')
    expect(result.items.map(item => item.id)).toEqual(['library'])
    expect(query.eq).toHaveBeenCalledWith('status', 'published')
  })

  it('keeps drafts and closed libraries visible to the teaching staff', async () => {
    const { client } = sessionClient([published, { ...published, id: 'draft', status: 'draft' }, { ...published, id: 'closed', status: 'closed' }])
    expect((await loadClassroomPracticeLibraries(client, 'room', 'co_teacher_view')).items).toHaveLength(3)
  })

  it('reports read failure separately from an empty classroom', async () => {
    const failed = await loadClassroomPracticeLibraries(sessionClient(null, { code: '42501' }).client, 'room', 'student_member')
    const empty = await loadClassroomPracticeLibraries(sessionClient([]).client, 'room', 'student_member')
    expect(failed.items).toEqual([])
    expect(failed.error).toBeTruthy()
    expect(empty).toEqual({ items: [], error: null })
  })

  it('does not read libraries without an authorized classroom relationship', async () => {
    const { client, from } = sessionClient([published])
    expect(await loadClassroomPracticeLibraries(client, 'room', 'none')).toEqual({ items: [], error: null })
    expect(from).not.toHaveBeenCalled()
  })

  it('drops secret, answer and progress fields before the classroom RSC payload', () => {
    const row = { id: 'library', title: 'คลังฝึก', status: 'published' as const, questionCount: 143, access_code: 'secret', correct_answer: 'answer', score: 10, attempts: 7 }
    expect(Object.keys(classroomPracticeLibraryItem(row)).sort()).toEqual(['id', 'questionCount', 'status', 'title'])
  })
})

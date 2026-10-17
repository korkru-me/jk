import { describe, expect, it } from 'vitest'
import { RECENT_WORK_WINDOW_MS, recentClassroomWorkItems, visibleRecentClassroomWork, type RecentWorkRow } from './classroom-recent-work'

const now = Date.parse('2026-10-14T08:00:00Z')
function row(overrides: Partial<RecentWorkRow> = {}): RecentWorkRow {
  return { id: 'work', title: 'งานใหม่', type: 'practice', status: 'published', created_by: 'owner', created_at: new Date(now - 1000).toISOString(), ...overrides }
}

describe('recent classroom work', () => {
  it('expires at exactly 72 hours and keeps a row a millisecond before expiry', () => {
    const items = recentClassroomWorkItems([row({ created_at: new Date(now - RECENT_WORK_WINDOW_MS + 1).toISOString() })], 'owner', now)
    expect(items).toHaveLength(1)
    expect(visibleRecentClassroomWork(items, now + 1)).toEqual([])
  })
  it('never renews the window when settings are edited', () => {
    const edited = { ...row({ created_at: new Date(now - RECENT_WORK_WINDOW_MS).toISOString() }), updated_at: new Date(now).toISOString() }
    expect(recentClassroomWorkItems([edited], 'owner', now)).toEqual([])
  })
  it('rejects future, invalid and expired creation times', () => {
    expect(recentClassroomWorkItems([row({ created_at: 'invalid' }), row({ created_at: new Date(now + 1).toISOString() }), row({ created_at: new Date(now - RECENT_WORK_WINDOW_MS - 1).toISOString() })], 'owner', now)).toEqual([])
  })
  it('shows only the creator, including a draft with its real status', () => {
    const items = recentClassroomWorkItems([row({ created_by: 'another-teacher' }), row({ status: 'draft' })], 'owner', now)
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('draft')
  })
  it('excludes closed work and unknown types', () => {
    expect(recentClassroomWorkItems([row({ status: 'closed' }), row({ type: 'survey' })], 'owner', now)).toEqual([])
  })
  it('orders new work first across exercises, exams and practice', () => {
    const items = recentClassroomWorkItems([row({ id: 'old', type: 'exercise', created_at: new Date(now - 2000).toISOString() }), row({ id: 'new', type: 'exam' }), row({ id: 'practice', created_at: new Date(now - 1500).toISOString() })], 'owner', now)
    expect(items.map(item => item.id)).toEqual(['new', 'practice', 'old'])
  })
  it('projects only safe metadata, excluding creator IDs, settings and answers', () => {
    const input = { ...row(), access_code: 'private', answer_key: { correct: true }, question_ids: ['question'] }
    expect(Object.keys(recentClassroomWorkItems([input], 'owner', now)[0]).sort()).toEqual(['createdAt', 'id', 'status', 'title', 'type'])
  })
})

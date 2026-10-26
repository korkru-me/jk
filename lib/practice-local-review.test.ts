import { describe, expect, it } from 'vitest'
import {
  changeLocalPracticeExercise, deleteLocalPracticeExercise, changeLocalPracticePin, EMPTY_PRACTICE_LOCAL_REVIEW,
  isLocalPracticeReviewEnabled, localPracticeExercises, practiceLocalReviewSchema,
} from './practice-local-review'
import type { PracticeQuestionListItem } from './practice-question-access.server'

const libraryId = '00000000-0000-4000-8300-000000000001'
const groupId = '00000000-0000-4000-8400-000000000001'
const ids = [1, 2, 3].map(n => `00000000-0000-4000-8200-${String(n).padStart(12, '0')}`)
const items: PracticeQuestionListItem[] = ids.map((id, position) => ({
  id, position, title: `โจทย์ ${position + 1}`, excerpt: 'ฝึกด้วยตนเอง', questionType: 'written',
  tags: [], attemptCount: position === 0 ? 2 : 0,
}))
const input = { id: groupId, libraryId, title: ' ทบทวนกลศาสตร์ ', questionIds: ids.slice(0, 2) }
function saved() {
  const result = changeLocalPracticeExercise(EMPTY_PRACTICE_LOCAL_REVIEW, libraryId, items, input, false)
  if (!result.ok) throw Error(result.error)
  return result.state
}

describe('development-only practice review', () => {
  it('never enables the browser adapter in a production build or tests', () => {
    expect(isLocalPracticeReviewEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isLocalPracticeReviewEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(isLocalPracticeReviewEnabled({ NODE_ENV: 'test' })).toBe(false)
  })
  it('stores only a name, membership and revision, deriving progress from current authorized metadata', () => {
    const state = saved()
    expect(state.exercises[0]).toEqual({ id: groupId, title: 'ทบทวนกลศาสตร์', questionIds: ids.slice(0, 2), revision: 1 })
    expect(localPracticeExercises(state, items)[0].attemptedCount).toBe(1)
    expect(localPracticeExercises(state, items.map(item => ({ ...item, attemptCount: 0 })))[0].attemptedCount).toBe(0)
    expect(localPracticeExercises(state, items)[0].questionTitles[ids[1]]).toBe('โจทย์ 2')
  })
  it('rejects a different library or a question outside the authorized snapshot', () => {
    expect(changeLocalPracticeExercise(EMPTY_PRACTICE_LOCAL_REVIEW, ids[0], items, input, false).ok).toBe(false)
    expect(changeLocalPracticeExercise(EMPTY_PRACTICE_LOCAL_REVIEW, libraryId, items.slice(0, 1), input, false).ok).toBe(false)
  })
  it('rejects empty, duplicate or oversized selections and a blank title', () => {
    for (const patch of [{ questionIds: [] }, { questionIds: [ids[0], ids[0]] }, { title: '  ' }]) {
      expect(changeLocalPracticeExercise(EMPTY_PRACTICE_LOCAL_REVIEW, libraryId, items, { ...input, ...patch }, false).ok).toBe(false)
    }
  })
  it('supports create retry without duplicating a group', () => {
    const state = saved()
    expect(changeLocalPracticeExercise(state, libraryId, items, input, false)).toEqual({ ok: true, state })
  })
  it('renames and changes membership without changing question attempts', () => {
    const result = changeLocalPracticeExercise(saved(), libraryId, items,
      { ...input, title: 'ฝึกพลังงาน', questionIds: [ids[2]], expectedRevision: 1 }, true)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.exercises[0].revision).toBe(2)
    expect(localPracticeExercises(result.state, items)[0]).toMatchObject({ title: 'ฝึกพลังงาน', attemptedCount: 0, questionIds: [ids[2]] })
    expect(items[0].attemptCount).toBe(2)
  })
  it('rejects a stale revision but accepts an identical retry', () => {
    const changed = { ...input, title: 'ชุดใหม่', expectedRevision: 1 }
    const result = changeLocalPracticeExercise(saved(), libraryId, items, changed, true)
    if (!result.ok) throw Error(result.error)
    expect(changeLocalPracticeExercise(result.state, libraryId, items, { ...changed, title: 'ชื่อจากอีกหน้าต่าง' }, true))
      .toMatchObject({ ok: false, conflict: true })
    expect(changeLocalPracticeExercise(result.state, libraryId, items, changed, true)).toEqual({ ok: true, state: result.state })
  })
  it('never treats updating a missing group as creation', () => {
    expect(changeLocalPracticeExercise(EMPTY_PRACTICE_LOCAL_REVIEW, libraryId, items, { ...input, expectedRevision: 1 }, true).ok).toBe(false)
  })
  it('intersects stored groups with currently authorized questions', () => {
    expect(localPracticeExercises(saved(), items.slice(1))[0].questionIds).toEqual([ids[1]])
    expect(localPracticeExercises(saved(), [])).toEqual([])
  })
  it('pins and unpins the desired state idempotently and preserves groups', () => {
    const state = saved()
    const pin = { libraryId, questionId: ids[2], pinned: true }
    const result = changeLocalPracticePin(state, libraryId, items, pin)
    if (!result.ok) throw Error(result.error)
    expect(result.state.pinnedQuestionIds).toEqual([ids[2]])
    expect(result.state.exercises).toBe(state.exercises)
    expect(changeLocalPracticePin(result.state, libraryId, items, pin)).toEqual(result)
    expect(changeLocalPracticePin(result.state, libraryId, items, { ...pin, pinned: false })).toEqual({ ok: true, state })
  })
  it('rejects pinning across libraries or outside the snapshot', () => {
    expect(changeLocalPracticePin(saved(), ids[0], items, { libraryId, questionId: ids[0], pinned: true }).ok).toBe(false)
    expect(changeLocalPracticePin(saved(), libraryId, items.slice(1), { libraryId, questionId: ids[0], pinned: true }).ok).toBe(false)
  })
  it('rejects malformed, duplicate or answer-bearing stored data', () => {
    expect(practiceLocalReviewSchema.safeParse({ ...saved(), answers: {} }).success).toBe(false)
    expect(practiceLocalReviewSchema.safeParse({ exercises: [saved().exercises[0], saved().exercises[0]], pinnedQuestionIds: [] }).success).toBe(false)
    expect(practiceLocalReviewSchema.safeParse({ exercises: [], pinnedQuestionIds: [ids[0], ids[0]] }).success).toBe(false)
  })
})


describe('deleting personal practice exercises', () => {
  const deletion = { id: groupId, libraryId, expectedRevision: 1 }
  it('deletes only the requested group, preserving pins, other groups and attempts', () => {
    const other = { ...saved().exercises[0], id: ids[2] }
    const state = { exercises: [...saved().exercises, other], pinnedQuestionIds: [ids[0]] }
    const result = deleteLocalPracticeExercise(state, libraryId, deletion)
    expect(result).toEqual({ ok: true, state: { exercises: [other], pinnedQuestionIds: [ids[0]] } })
    expect(state.exercises).toHaveLength(2)
    expect(items[0].attemptCount).toBe(2)
  })
  it('rejects stale revisions, cross-library inputs, unknown IDs and malformed deletion', () => {
    const state = saved()
    expect(deleteLocalPracticeExercise(state, libraryId, { ...deletion, expectedRevision: 2 })).toMatchObject({ ok: false, conflict: true })
    expect(deleteLocalPracticeExercise(state, ids[1], deletion).ok).toBe(false)
    expect(deleteLocalPracticeExercise(state, libraryId, { ...deletion, id: ids[2] }).ok).toBe(false)
    expect(deleteLocalPracticeExercise(state, libraryId, { ...deletion, studentId: ids[1] }).ok).toBe(false)
    expect(deleteLocalPracticeExercise(state, libraryId, { ...deletion, expectedRevision: 0 }).ok).toBe(false)
    expect(state).toEqual(saved())
  })
})

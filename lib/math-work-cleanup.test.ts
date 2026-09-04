import { describe, expect, it } from 'vitest'
import {
  isManagedMathWorkPath,
  MATH_WORK_ORPHAN_GRACE_MS,
  planMathWorkCleanup,
} from '@/lib/math-work-cleanup'

const STUDENT_ID = '11111111-1111-4111-8111-111111111111'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
const ANSWER_ID = '33333333-3333-4333-8333-333333333333'
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'
const QUESTION_ID = '66666666-6666-4666-8666-666666666666'

const studentPreview = `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/preview.webp`
const teacherScene = `teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/5/${UPLOAD_ID}/scene.json`
const now = Date.parse('2026-09-03T12:00:00.000Z')

function daysAgo(days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('math-work orphan cleanup plan', () => {
  it('accepts only exact student and teacher upload paths', () => {
    expect(isManagedMathWorkPath(studentPreview)).toBe(true)
    expect(isManagedMathWorkPath(teacherScene)).toBe(true)
    expect(isManagedMathWorkPath(teacherScene.replace('/5/', '/6/'))).toBe(false)
    expect(isManagedMathWorkPath(studentPreview.replace('preview.webp', '../preview.webp'))).toBe(false)
    expect(isManagedMathWorkPath(`other/${UPLOAD_ID}/preview.webp`)).toBe(false)
    // Safari cannot encode WebP, so its boards are stored as PNG.
    expect(isManagedMathWorkPath(studentPreview.replace('preview.webp', 'preview.png'))).toBe(true)
    expect(isManagedMathWorkPath(studentPreview.replace('preview.webp', 'preview.gif'))).toBe(false)
  })

  it('deletes only old, unreferenced objects from managed paths', () => {
    const plan = planMathWorkCleanup([
      { path: studentPreview, size: 100, createdAt: daysAgo(8) },
      { path: teacherScene, size: 200, createdAt: daysAgo(8) },
      { path: teacherScene.replace('scene.json', 'preview.webp'), size: 300, createdAt: daysAgo(2) },
    ], new Set([teacherScene]), now)

    expect(plan.deletable.map(file => file.path)).toEqual([studentPreview])
    expect(plan.deletableBytes).toBe(100)
    expect(plan.keptReferenced).toBe(1)
    expect(plan.keptRecent).toBe(1)
  })

  it('keeps unknown paths and objects whose age cannot be proved', () => {
    const plan = planMathWorkCleanup([
      { path: `unknown/${UPLOAD_ID}/preview.webp`, size: 100, createdAt: daysAgo(30) },
      { path: studentPreview, size: 100, createdAt: null },
      { path: teacherScene, size: 100, createdAt: 'not-a-date' },
    ], new Set(), now)

    expect(plan.deletable).toHaveLength(0)
    expect(plan.keptUnmanaged).toBe(1)
    expect(plan.keptRecent).toBe(2)
  })

  it('retains an unreferenced object until the full seven-day grace boundary', () => {
    const justInside = new Date(now - MATH_WORK_ORPHAN_GRACE_MS + 1).toISOString()
    const atBoundary = new Date(now - MATH_WORK_ORPHAN_GRACE_MS).toISOString()
    const plan = planMathWorkCleanup([
      { path: studentPreview, size: 1, createdAt: justInside },
      { path: teacherScene, size: 1, createdAt: atBoundary },
    ], new Set(), now)

    expect(plan.deletable.map(file => file.path)).toEqual([teacherScene])
    expect(plan.keptRecent).toBe(1)
  })
})

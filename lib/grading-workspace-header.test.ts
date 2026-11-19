import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GradingWorkspaceHeader, type GradingWorkspaceHeaderData } from '@/components/assignments/grading-workspace-header'
import type { GradingStudent } from './grading-workspace'

beforeEach(() => vi.stubGlobal('React', { createElement }))
afterEach(() => vi.unstubAllGlobals())

const student: GradingStudent = {
  id: 'student', name: 'นักเรียนทดสอบ', gradeLevel: null, sectionNumber: null, classNumber: null,
  studentCode: null, classroom: null, submissionId: 'submission', attemptNumber: 1,
  score: 0, maxScore: 10, status: 'submitted', pendingReview: true,
}
function render(students: GradingStudent[]) {
  const data: GradingWorkspaceHeaderData = {
    assignment: { id: 'assignment', title: 'งานทดสอบ', classroomName: 'ห้องทดสอบ',
      type: 'exam', displayMaxScore: 10, completionRule: 'fixed' },
    students, inProgressCount: 0, pendingFinalizationCount: 0,
  }
  return renderToStaticMarkup(createElement(GradingWorkspaceHeader, { data }))
}

describe('grading header published average', () => {
  it('replaces a provisional average of zero with the review status', () => {
    const html = render([student])
    expect(html).toContain('รอตรวจ')
    expect(html).not.toContain('0/10')
  })
  it('shows a published zero even when lifecycle status is submitted', () => {
    const html = render([{ ...student, pendingReview: false }])
    expect(html).toContain('0/10')
    expect(html).not.toContain('รอตรวจ')
  })
  it('averages only students whose grading is complete', () => {
    const html = render([student, { ...student, id: 'reviewed', score: 8, pendingReview: false }])
    expect(html).toContain('8/10')
    expect(html).not.toContain('4/10')
  })
})

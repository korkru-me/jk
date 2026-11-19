import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubmissionScoreSummary } from '@/components/student/submission-score-summary'

beforeEach(() => vi.stubGlobal('React', { createElement }))
afterEach(() => vi.unstubAllGlobals())

const base = {
  visible: true, score: 0, maxScore: 10, percentage: 0, passed: false,
  threshold: '60%', counts: null, submittedAt: null, strategy: null,
}

describe('pending submission summary', () => {
  it.each([0, 8])('replaces provisional %s points, percentage and pass/fail with the review status', score => {
    const html = renderToStaticMarkup(createElement(SubmissionScoreSummary, {
      ...base, score, percentage: score * 10, pendingReview: true,
    }))
    expect(html).toContain('รอตรวจ')
    expect(html).not.toContain(`${score}/10`)
    expect(html).not.toContain(`${score * 10}%`)
    expect(html).not.toContain('ยังไม่ผ่านเกณฑ์')
    expect(html).not.toContain('ผ่านเกณฑ์')
  })

  it('uses the pending flag when answer counts are withheld by score-only settings', () => {
    const html = renderToStaticMarkup(createElement(SubmissionScoreSummary, { ...base, pendingReview: true, counts: null }))
    expect(html).toContain('รอตรวจ')
    expect(html).not.toContain('0/10')
  })

  it('preserves a real zero after publication', () => {
    const html = renderToStaticMarkup(createElement(SubmissionScoreSummary, base))
    expect(html).toContain('0/10')
    expect(html).toContain('0%')
    expect(html).toContain('ยังไม่ผ่านเกณฑ์')
    expect(html).not.toContain('รอตรวจ')
  })

  it('releases a reviewed full-work score even when the answer verdict stays null', () => {
    const html = renderToStaticMarkup(createElement(SubmissionScoreSummary, {
      ...base, pendingReview: false, counts: { correct: 0, wrong: 0, pending: 1 },
    }))
    expect(html).toContain('0/10')
    expect(html).not.toContain('รอตรวจ')
    expect(html).not.toContain('รอครูตรวจ')
  })

  it('keeps released scores hidden when the teacher disables score visibility', () => {
    const html = renderToStaticMarkup(createElement(SubmissionScoreSummary, { ...base, visible: false }))
    expect(html).not.toContain('0/10')
    expect(html).not.toContain('0%')
  })
})

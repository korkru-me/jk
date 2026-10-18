import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_GRADING_QUICK_SCORES, gradingQuickScore, gradingQuickScoresStorageKey, isGradingQuickScores, parseGradingQuickScores, readGradingQuickScores, writeGradingQuickScores } from './grading-quick-scores'

describe('quick grading percentages', () => {
  it('keeps all six requested defaults and accepts decimal percentages', () => {
    expect(DEFAULT_GRADING_QUICK_SCORES).toEqual([100, 90, 80, 70, 60, 50])
    expect(isGradingQuickScores([100, 87.5, 70.25, 60, 50, 0])).toBe(true)
  })
  it.each([
    [100, 90, 80, 70, 60], [100, 90, 80, 70, 60, 50, 40], [100, 90, 80, 70, 60, 50, 40, 30],
    [101, 90, 80, 70, 60, 50], [-1, 90, 80, 70, 60, 50],
    [NaN, 90, 80, 70, 60, 50], [Infinity, 90, 80, 70, 60, 50],
    ['100', 90, 80, 70, 60, 50], null, { values: [100, 90, 80, 70, 60, 50] },
  ].map(value => ({ value })))('rejects invalid preference shapes without coercing $value', ({ value }) => {
    expect(isGradingQuickScores(value)).toBe(false)
  })
  it('rejects sparse arrays instead of treating missing buttons as valid percentages', () => {
    expect(isGradingQuickScores(Array(6))).toBe(false)
  })
  it('calculates answer and work scores from their own raw maxima', () => {
    expect(gradingQuickScore(3, 90)).toBe(2.7)
    expect(gradingQuickScore(5, 90)).toBe(4.5)
    expect(gradingQuickScore(7, 87.5)).toBe(6.125)
    expect(gradingQuickScore(7, 0)).toBe(0)
  })
  it('rounds non-full scores to six decimals and never exceeds the supplied maximum', () => {
    expect(gradingQuickScore(1, 33.333333333)).toBe(0.333333)
    expect(gradingQuickScore(0.0000009, 99)).toBe(0.0000009)
    expect(gradingQuickScore(3, 70)).toBe(2.1)
  })
  it('retains the exact full maximum for 100 percent, including fractional raw weights', () => {
    expect(gradingQuickScore(0.123456789, 100)).toBe(0.123456789)
    expect(gradingQuickScore(Number.MAX_VALUE, 100)).toBe(Number.MAX_VALUE)
    expect(gradingQuickScore(Number.MAX_VALUE, 50)).toBe(Number.MAX_VALUE / 2)
  })
  it.each([[NaN, 100], [Infinity, 100], [-1, 50], [1, Infinity], [1, -1], [1, 101]])('rejects invalid score bounds or percentages (%s, %s)', (maximum, percentage) => {
    expect(gradingQuickScore(maximum, percentage)).toBeNull()
  })
})

describe('non-sensitive quick grading preferences', () => {
  it('separates assignment and viewer scopes and prevents separator collisions', () => {
    expect(gradingQuickScoresStorageKey('assignment-a', 'teacher-a')).toBe('korkru:grading-quick-scores:v1:assignment-a:viewer:teacher-a')
    expect(gradingQuickScoresStorageKey('assignment-a', 'teacher-a')).not.toBe(gradingQuickScoresStorageKey('assignment-b', 'teacher-a'))
    expect(gradingQuickScoresStorageKey('assignment-a', 'teacher-a')).not.toBe(gradingQuickScoresStorageKey('assignment-a', 'teacher-b'))
    expect(gradingQuickScoresStorageKey('assignment-a')).not.toBe(gradingQuickScoresStorageKey('assignment-a', 'browser'))
    expect(gradingQuickScoresStorageKey('a:b', 'c')).not.toBe(gradingQuickScoresStorageKey('a', 'b:c'))
  })
  it.each([null, '', '{broken', '{"studentAnswer":"private"}', '[100,90,80]', '[100,90,80,70,60,50,null]', 'x'.repeat(2049)])('uses safe defaults for missing or malformed storage', raw => {
    expect(parseGradingQuickScores(raw)).toEqual(DEFAULT_GRADING_QUICK_SCORES)
  })
  it('migrates all-valid seven-button preferences in place without changing order or decimal choices', () => {
    const key = gradingQuickScoresStorageKey('assignment', 'teacher')
    const legacy = [95, 87.5, 0, 75.25, 50, 50, 12.5]
    const memory = new Map([[key, JSON.stringify(legacy)]])
    const storage = { getItem: (storedKey: string) => memory.get(storedKey) ?? null }
    expect(readGradingQuickScores(storage, key)).toEqual(legacy.slice(0, 6))
    expect(memory.get(key)).toBe(JSON.stringify(legacy))
  })
  it.each(['null', '"40"', '-1', '101', '1e999', '{}', '[]'])('rejects a legacy set with invalid final percentage %s before truncating', tail => {
    expect(parseGradingQuickScores(`[95,87.5,0,75.25,50,50,${tail}]`)).toEqual(DEFAULT_GRADING_QUICK_SCORES)
  })
  it('does not truncate an eight-button set into an accepted preference', () => {
    expect(parseGradingQuickScores('[95,87.5,0,75.25,50,50,40,30]')).toEqual(DEFAULT_GRADING_QUICK_SCORES)
  })
  it('falls back safely when browser storage access fails', () => {
    expect(readGradingQuickScores({ getItem: () => { throw new Error('blocked') } }, 'key')).toEqual(DEFAULT_GRADING_QUICK_SCORES)
    expect(writeGradingQuickScores({ setItem: () => { throw new Error('quota') } }, 'key', DEFAULT_GRADING_QUICK_SCORES)).toBe(false)
  })
  it('persists only the six numbers and restores them in both detail views using the same scope', () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const key = gradingQuickScoresStorageKey('assignment', 'teacher')
    const percentages = [100, 95, 87.5, 75, 62.5, 50]
    expect(writeGradingQuickScores(storage, key, percentages)).toBe(true)
    expect(memory.get(key)).toBe(JSON.stringify(percentages))
    expect(readGradingQuickScores(storage, key)).toEqual(percentages)
    expect(readGradingQuickScores(storage, gradingQuickScoresStorageKey('another-assignment', 'teacher'))).toEqual(DEFAULT_GRADING_QUICK_SCORES)
  })
  it('does not store invalid preferences or let a mutable result change the defaults', () => {
    const setItem = vi.fn()
    expect(writeGradingQuickScores({ setItem }, 'key', [50])).toBe(false)
    expect(writeGradingQuickScores({ setItem }, 'key', [100, 90, 80, 70, 60, 50, 40])).toBe(false)
    expect(writeGradingQuickScores({ setItem }, 'key', [100, 90, 80, 70, 60, 50, 40, 30])).toBe(false)
    expect(writeGradingQuickScores({ setItem }, 'key', Array(6))).toBe(false)
    expect(setItem).not.toHaveBeenCalled()
    const result = parseGradingQuickScores(null)
    result[0] = 0
    expect(DEFAULT_GRADING_QUICK_SCORES[0]).toBe(100)
  })
})

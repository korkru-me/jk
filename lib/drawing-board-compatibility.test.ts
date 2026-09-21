import { describe, expect, it } from 'vitest'
import fixtures from '@/lib/fixtures/drawing-scenes-v1.json'
import { validateDrawingScene, type DrawingBoardRole } from '@/lib/drawing-board-policy'

const REQUIRED_COVERAGE = new Set([
  'empty',
  'freehand',
  'highlighter',
  'text-thai',
  'text-english',
  'line',
  'shape',
  'background-blank',
  'background-lined',
  'background-grid',
  'background-dots',
  'deleted-element',
  'teacher-question-image',
])

describe('drawing scene v1 compatibility fixtures', () => {
  it('keeps the fixture manifest on the current persisted envelope version', () => {
    expect(fixtures.formatVersion).toBe(1)
    const coverage = new Set(fixtures.fixtures.flatMap(fixture => fixture.coverage))
    expect([...REQUIRED_COVERAGE].filter(name => !coverage.has(name))).toEqual([])
  })

  it.each(fixtures.fixtures)('accepts and round-trips $name', fixture => {
    const verifyTeacherImage = fixture.role === 'teacher'
      ? ({ claim }: { claim: string | null }) => claim === 'phase-7-current-question-claim-fixture' ? 'valid' as const : 'invalid' as const
      : undefined
    const first = validateDrawingScene(fixture.scene, {
      role: fixture.role as DrawingBoardRole,
      verifyTeacherImage,
    })
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) return
    const serialized = JSON.stringify(first.scene)
    const second = validateDrawingScene(JSON.parse(serialized) as unknown, {
      role: fixture.role as DrawingBoardRole,
      verifyTeacherImage,
    })
    expect(second).toEqual(first)
  })

  it('fails closed when a persisted fixture changes envelope version or gains an unknown field', () => {
    const source = structuredClone(fixtures.fixtures[0].scene) as Record<string, unknown>
    expect(validateDrawingScene({ ...source, formatVersion: 2 }, { role: 'student' }))
      .toMatchObject({ ok: false, code: 'unsupported-version' })
    expect(validateDrawingScene({ ...source, injected: true }, { role: 'student' }))
      .toMatchObject({ ok: false, code: 'invalid-envelope' })
  })

  it('does not accept the teacher image fixture without a matching current-question claim decision', () => {
    const fixture = fixtures.fixtures.find(value => value.name === 'teacher-question-image')
    expect(fixture).toBeDefined()
    if (!fixture) return
    expect(validateDrawingScene(fixture.scene, {
      role: 'teacher',
      verifyTeacherImage: () => 'invalid',
    })).toMatchObject({ ok: false, code: 'untrusted-image' })
  })
})

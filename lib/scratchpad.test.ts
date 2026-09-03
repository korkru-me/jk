import { describe, expect, it } from 'vitest'
import {
  SCRATCHPAD_TTL_MS,
  emptyScratchpadScene,
  isScratchpadSceneWithinLimits,
  isScratchpadExpired,
  sanitizeScratchpadScene,
  scratchpadStorageKey,
  scratchpadSubmissionKey,
} from './scratchpad'

describe('scratchpad scene foundation', () => {
  const scope = {
    ownerId: 'student-1',
    submissionId: 'submission-1',
    answerId: 'answer-1',
    partKey: 'part:a',
  }

  it('scopes local data to owner, attempt, answer, and part', () => {
    expect(scratchpadStorageKey(scope)).not.toBe(scratchpadStorageKey({ ...scope, partKey: 'part:b' }))
    expect(scratchpadSubmissionKey(scope.ownerId, scope.submissionId)).toBe('["student-1","submission-1"]')
  })

  it('creates and validates a versioned editable scene', () => {
    const scene = emptyScratchpadScene('lined')
    expect(sanitizeScratchpadScene(scene)).toEqual(scene)
    expect(sanitizeScratchpadScene({ ...scene, background: 'paper' })).toBeNull()
    expect(sanitizeScratchpadScene({ ...scene, formatVersion: 999 })).toBeNull()
  })

  it('rejects a scene above the local byte ceiling', () => {
    const scene = {
      ...emptyScratchpadScene(),
      appState: { note: 'x'.repeat(2 * 1024 * 1024) },
    }
    expect(isScratchpadSceneWithinLimits(scene)).toBe(false)
  })

  it('expires local recovery data after seven days', () => {
    const now = Date.UTC(2026, 8, 3)
    expect(isScratchpadExpired(now - SCRATCHPAD_TTL_MS + 1, now)).toBe(false)
    expect(isScratchpadExpired(now - SCRATCHPAD_TTL_MS, now)).toBe(true)
    expect(isScratchpadExpired(Number.NaN, now)).toBe(true)
  })
})

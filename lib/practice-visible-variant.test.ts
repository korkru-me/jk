import { describe, expect, it } from 'vitest'
import { readPracticeVisibleValues, rememberPracticeVisibleValues } from './practice-visible-variant'

describe('visible practice variant memory', () => {
  it('isolates visible numeric sets by owner, library and question', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    rememberPracticeVisibleValues(storage, 'owner', 'library', 'question', { x: 3 })
    expect(readPracticeVisibleValues(storage, 'owner', 'library', 'question')).toEqual({ x: 3 })
    expect(readPracticeVisibleValues(storage, 'other', 'library', 'question')).toBeUndefined()
    expect(readPracticeVisibleValues(storage, 'owner', 'other', 'question')).toBeUndefined()
    expect(readPracticeVisibleValues(storage, 'owner', 'library', 'other')).toBeUndefined()
    expect([...data.values()].join('')).not.toMatch(/answer|verdict|receipt/)
  })
  it('tolerates unavailable storage without making it authority', () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readPracticeVisibleValues(storage, 'a', 'b', 'c')).toBeUndefined()
    expect(() => rememberPracticeVisibleValues(storage, 'a', 'b', 'c', { x: 3 })).not.toThrow()
  })
})

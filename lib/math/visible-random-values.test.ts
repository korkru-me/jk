import { afterEach, expect, it, vi } from 'vitest'
import { readVisibleRandomValues, rememberVisibleRandomValues, visibleRandomValueStorage } from './visible-random-values'

afterEach(() => vi.unstubAllGlobals())

it('does not let a blocked storage getter interrupt a completed variant transition', () => {
  vi.stubGlobal('window', Object.defineProperty({}, 'sessionStorage', { get() { throw new Error('blocked') } }))
  const storage = visibleRandomValueStorage()
  expect(storage).toBeUndefined()
  expect(readVisibleRandomValues(storage, 'question')).toBeUndefined()
  expect(() => rememberVisibleRandomValues(storage, 'question', { x: 2 })).not.toThrow()
})

it('keeps numeric history separate for different display identities', () => {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  rememberVisibleRandomValues(storage, 'owner-a/question', { x: 3 })
  expect(readVisibleRandomValues(storage, 'owner-a/question')).toEqual({ x: 3 })
  expect(readVisibleRandomValues(storage, 'owner-b/question')).toBeUndefined()
})

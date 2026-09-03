import { describe, expect, it } from 'vitest'
import { parseAnswerBackup, sameAnswerPayload, serializeAnswerBackup } from './answer-backup'

describe('answer autosave backup', () => {
  it('round-trips answer text and DEG/RAD metadata together', () => {
    const raw = serializeAnswerBackup(new Map([
      ['answer-1', { value: 'sin(pi/6)', mathInputModes: { main: 'rad' as const } }],
    ]))
    expect(parseAnswerBackup(raw)).toEqual({
      'answer-1': { value: 'sin(pi/6)', mathInputModes: { main: 'rad' } },
    })
  })

  it('restores legacy text-only backups as DEG-compatible empty metadata', () => {
    expect(parseAnswerBackup(JSON.stringify({ a: '30', b: '' }))).toEqual({
      a: { value: '30', mathInputModes: {} },
      b: { value: '', mathInputModes: {} },
    })
  })

  it('drops malformed mode metadata without dropping the answer', () => {
    expect(parseAnswerBackup(JSON.stringify({
      version: 2,
      entries: { a: { value: 'sin(30)', mathInputModes: { main: 'degrees' } } },
    }))).toEqual({ a: { value: 'sin(30)', mathInputModes: {} } })
  })

  it('compares both text and mode metadata', () => {
    const value = { value: 'sin(30)', mathInputModes: { main: 'deg' as const } }
    expect(sameAnswerPayload(value, value)).toBe(true)
    expect(sameAnswerPayload(value, { ...value, mathInputModes: { main: 'rad' } })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { mathInputPartKey, parseMathInputModes, readMathInputMode } from './input-mode'

describe('math input modes', () => {
  it('uses a stable main key for zero or one part', () => {
    expect(mathInputPartKey(undefined, 0, 0)).toBe('main')
    expect(mathInputPartKey('part-id', 0, 1)).toBe('main')
  })

  it('prefers a part id and falls back to its frozen index', () => {
    expect(mathInputPartKey('velocity', 1, 3)).toBe('part:velocity')
    expect(mathInputPartKey('', 1, 3)).toBe('part-index:1')
    expect(mathInputPartKey('legacy part!', 1, 3)).toBe('part-index:1')
  })

  it('reads missing and malformed legacy values as DEG', () => {
    expect(readMathInputMode({}, 'main')).toBe('deg')
    expect(readMathInputMode({ main: 'rad' }, 'main')).toBe('rad')
  })

  it('strictly validates browser input', () => {
    expect(parseMathInputModes({ main: 'deg', 'part:a': 'rad' })).toEqual({ main: 'deg', 'part:a': 'rad' })
    expect(parseMathInputModes({ main: 'degrees' })).toBeNull()
    expect(parseMathInputModes({ '../path': 'rad' })).toBeNull()
    expect(parseMathInputModes([])).toBeNull()
  })
})

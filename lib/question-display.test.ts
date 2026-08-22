import { describe, it, expect } from 'vitest'
import { questionExcerpt } from './question-display'

describe('questionExcerpt', () => {
  it('is empty for empty input', () => {
    expect(questionExcerpt('')).toBe('')
    expect(questionExcerpt(null)).toBe('')
    expect(questionExcerpt(undefined)).toBe('')
  })

  it('strips the tags an imported bank carries', () => {
    // This is what used to reach the reader verbatim on every card.
    expect(questionExcerpt('<pre class="question-text mat-title-medium">หากมีการเตือนภัย</pre>'))
      .toBe('หากมีการเตือนภัย')
    expect(questionExcerpt('<h2 class="x">ตามเกณฑ์ปริมาณฝน</h2>')).toBe('ตามเกณฑ์ปริมาณฝน')
  })

  it('strips the plain wrapper an editor-authored question has', () => {
    expect(questionExcerpt('<p>จงหาแรงลัพธ์</p>')).toBe('จงหาแรงลัพธ์')
  })

  it('decodes entities', () => {
    expect(questionExcerpt('<p>a &lt; b &amp; c &gt; d</p>')).toBe('a < b & c > d')
    expect(questionExcerpt('<p>เว้น&nbsp;วรรค</p>')).toBe('เว้น วรรค')
  })

  it('collapses the whitespace tag removal leaves behind', () => {
    expect(questionExcerpt('<p>หนึ่ง</p>\n<p>สอง</p>')).toBe('หนึ่ง สอง')
  })

  it('keeps plain text as it is', () => {
    expect(questionExcerpt('ไม่มีแท็กเลย')).toBe('ไม่มีแท็กเลย')
  })
})

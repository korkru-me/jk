import { describe, it, expect } from 'vitest'
import { readAnswerKey } from './answer-key'

/**
 * Every case here is taken from a real worksheet — one file of twelve
 * rotational-motion questions, which is where the bracket convention was read
 * off rather than guessed at.
 */
describe('reading the เฉลย a teacher writes in brackets', () => {
  it('reads a plain number and takes it out of the โจทย์', () => {
    const read = readAnswerKey('<p>จงหาอัตราเร็วเชิงมุมเฉลี่ยในหน่วยเรเดียนต่อวินาที (2.5)</p>')

    expect(read.answers).toEqual([{ formula: '2.5', unit: '' }])
    // The โจทย์ a student sees must not carry its own answer.
    expect(read.html).toBe('<p>จงหาอัตราเร็วเชิงมุมเฉลี่ยในหน่วยเรเดียนต่อวินาที</p>')
  })

  it('separates the value from the unit, in either language', () => {
    expect(readAnswerKey('<p>ก (25 rad/s)</p>').answers).toEqual([{ formula: '25', unit: 'rad/s' }])
    expect(readAnswerKey('<p>ก (1000 เรเดียน)</p>').answers).toEqual([{ formula: '1000', unit: 'เรเดียน' }])
    // No space between the two, which is how it is often typed.
    expect(readAnswerKey('<p>ก (200เมตร)</p>').answers).toEqual([{ formula: '200', unit: 'เมตร' }])
  })

  it('keeps a superscript unit readable', () => {
    const read = readAnswerKey('<p>จงหาค่าความเร่งเชิงมุม (4 rad/s<sup>2</sup>)</p>')

    expect(read.answers).toEqual([{ formula: '4', unit: 'rad/s²' }])
    expect(read.html).toBe('<p>จงหาค่าความเร่งเชิงมุม</p>')
  })

  it('reads pi the way a worksheet writes it', () => {
    expect(readAnswerKey('<p>ก (pi)</p>').answers).toEqual([{ formula: 'pi', unit: '' }])
    // Implicit multiplication is how it is written and not how it is evaluated.
    expect(readAnswerKey('<p>ก (14pi)</p>').answers).toEqual([{ formula: '14*pi', unit: '' }])
    expect(readAnswerKey('<p>ก (4pi)</p>').answers).toEqual([{ formula: '4*pi', unit: '' }])
    expect(readAnswerKey('<p>ก (25/pi รอบ)</p>').answers).toEqual([{ formula: '25/pi', unit: 'รอบ' }])
    expect(readAnswerKey('<p>ก (-2pi/3)</p>').answers).toEqual([{ formula: '-2*pi/3', unit: '' }])
    expect(readAnswerKey('<p>ก (14π)</p>').answers).toEqual([{ formula: '14*pi', unit: '' }])
  })

  it('reads a โจทย์ that asks for two values as two answers', () => {
    const read = readAnswerKey('<p>จงหาความเร็ว และความเร่งที่ผิวล้อ (200 m/s, 10 m/s<sup>2</sup>)</p>')

    expect(read.answers).toEqual([
      { formula: '200', unit: 'm/s' },
      { formula: '10', unit: 'm/s²' },
    ])
    expect(read.html).toBe('<p>จงหาความเร็ว และความเร่งที่ผิวล้อ</p>')
  })

  it('reads a pair where one side is a fraction of pi', () => {
    expect(readAnswerKey('<p>ก (-2pi/3, 225 รอบ)</p>').answers).toEqual([
      { formula: '-2*pi/3', unit: '' },
      { formula: '225', unit: 'รอบ' },
    ])
  })

  it('leaves a bracket that is not an answer alone', () => {
    for (const html of [
      '<p>เฟือง A ขบกับเฟือง B (ดังรูป)</p>',
      '<p>จงหาความเร่ง (ดูวิธีทำท้ายเล่ม)</p>',
      '<p>จงอธิบายการหมุน (2 คะแนน)</p>',
      '<p>จงหาค่า (ใช้ g = 10 m/s<sup>2</sup> ในการคำนวณทุกข้อของแบบฝึกหัดชุดนี้ด้วยนะครับ)</p>',
    ]) {
      const read = readAnswerKey(html)
      expect(read.answers, html).toEqual([])
      expect(read.html, html).toBe(html)
    }
  })

  it('refuses a half-readable bracket rather than keep the readable half', () => {
    // Taking "4" here would leave a โจทย์ marked on an answer the teacher never
    // gave, and the rest of the bracket would vanish from the โจทย์ as well.
    const html = '<p>จงหาความเร่ง (4 rad/s, ดูเฉลยท้ายเล่ม)</p>'
    expect(readAnswerKey(html).answers).toEqual([])
    expect(readAnswerKey(html).html).toBe(html)
  })

  it('only reads a bracket that ends the โจทย์', () => {
    const html = '<p>ล้อรัศมี (2 เมตร) หมุนรอบแกน จงหาคาบ</p>'
    expect(readAnswerKey(html).answers).toEqual([])
  })

  it('does not run from one paragraph into the next', () => {
    // An opening bracket left unclosed in one line must not swallow the lines
    // under it on its way to a closing bracket somewhere else.
    const html = '<p>จงหาค่า (ก</p><p>และค่า ข)</p>'
    expect(readAnswerKey(html).answers).toEqual([])
    expect(readAnswerKey(html).html).toBe(html)
  })

  it('refuses arithmetic that would not evaluate', () => {
    expect(readAnswerKey('<p>ก (25/)</p>').answers).toEqual([])
    expect(readAnswerKey('<p>ก ((2+3)</p>').answers).toEqual([])
    expect(readAnswerKey('<p>ก (+)</p>').answers).toEqual([])
  })

  it('reads through the emphasis a teacher may have left on the bracket', () => {
    const read = readAnswerKey('<p>จงหาความเร็ว (<strong>48 rad/s</strong>)</p>')
    expect(read.answers).toEqual([{ formula: '48', unit: 'rad/s' }])
  })
})

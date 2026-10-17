import { describe, expect, it } from 'vitest'
import { buildSolutionWatermark, solutionWatermarkLines } from './solution-watermark'

const name = { full_name: 'ก่อ เรียนรู้', prefix: 'เด็กชาย', first_name: 'ก่อ', last_name: 'เรียนรู้' }
const profile = { student_code: '00007', grade_level: 'ม.4', section_number: 1, class_number: 7 }
const at = '2026-10-14T18:30:00.000Z'
describe('authorized solution watermark projection', () => {
  it('includes only the requested identity, preserving leading zeroes and using Thai date/time', () => {
    const data = buildSolutionWatermark({ ...name, email: 'private@example.invalid' } as typeof name, profile, at)
    expect(data).toEqual({ name: 'เด็กชายก่อ เรียนรู้', studentCode: '00007', classroom: 'ม.4/1', classNumber: '7', issuedAt: at })
    expect(solutionWatermarkLines(data)).toEqual(['เด็กชายก่อ เรียนรู้', 'รหัส 00007 · ชั้น ม.4/1 · เลขที่ 7', 'วันที่ 15/10/69 01:30'])
  })
  it('does not duplicate a prefix on a legacy full name', () => {
    expect(buildSolutionWatermark({ ...name, full_name: 'เด็กชายก่อ เรียนรู้', first_name: null, last_name: null }, profile, at).name).toBe('เด็กชายก่อ เรียนรู้')
  })
  it('does not invent absent student profile fields', () => {
    expect(buildSolutionWatermark(name, null, at)).toMatchObject({ studentCode: 'ไม่ระบุ', classroom: 'ไม่ระบุ', classNumber: 'ไม่ระบุ' })
  })
  it('bounds repeated profile text and removes direction/control characters', () => {
    const data = buildSolutionWatermark({ ...name, first_name: 'ก'.repeat(1000)+'\u202e', last_name: '\u0000เรียนรู้\nดี' }, profile, at)
    expect(data.name.length).toBeLessThan(120)
    expect(data.name).not.toMatch(/[\u0000\u202e\n]/)
  })
})

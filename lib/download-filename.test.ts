import { describe, expect, it } from 'vitest'
import { encodeRfc5987Filename } from './download-filename'

describe('download filename encoding', () => {
  it('encodes Thai and reserved RFC 5987 filename characters', () => {
    const value = encodeRfc5987Filename("ข้อสอบ O'Brien (ปลายภาค)*.docx")
    expect(value).toContain('%E0%B8%82')
    expect(value).toContain('O%27Brien')
    expect(value).toContain('%28')
    expect(value).toContain('%29')
    expect(value).toContain('%2A')
    expect(value).not.toMatch(/[!'()*]/)
  })
})

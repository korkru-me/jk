import { describe, it, expect } from 'vitest'
import { linkify, hrefOf, shortenUrl } from './linkify'

describe('linkify', () => {
  it('leaves text with no link as one plain run', () => {
    expect(linkify('พรุ่งนี้เรียนห้อง 4.1 นะครับ')).toEqual([
      { type: 'text', value: 'พรุ่งนี้เรียนห้อง 4.1 นะครับ' },
    ])
  })

  it('splits a link out of the sentence around it', () => {
    expect(linkify('ส่งงานที่ https://forms.gle/abc123 ก่อนวันศุกร์')).toEqual([
      { type: 'text', value: 'ส่งงานที่ ' },
      { type: 'link', value: 'https://forms.gle/abc123', href: 'https://forms.gle/abc123' },
      { type: 'text', value: ' ก่อนวันศุกร์' },
    ])
  })

  it('gives a bare www address a scheme', () => {
    expect(linkify('www.korkru.com')).toEqual([
      { type: 'link', value: 'www.korkru.com', href: 'https://www.korkru.com' },
    ])
  })

  it('does not swallow the full stop that ends the sentence', () => {
    const segments = linkify('ดูที่ https://korkru.com/exam.')
    expect(segments[1]).toMatchObject({ value: 'https://korkru.com/exam' })
    expect(segments[2]).toEqual({ type: 'text', value: '.' })
  })

  it('keeps a closing bracket the URL itself opened', () => {
    expect(linkify('https://th.wikipedia.org/wiki/นิวตัน_(หน่วย)')).toEqual([
      {
        type: 'link',
        value: 'https://th.wikipedia.org/wiki/นิวตัน_(หน่วย)',
        href: 'https://th.wikipedia.org/wiki/นิวตัน_(หน่วย)',
      },
    ])
  })

  it('finds every link in one announcement', () => {
    const links = linkify('ใบงาน https://a.com/1 และเฉลย https://b.com/2').filter(s => s.type === 'link')
    expect(links.map(l => l.value)).toEqual(['https://a.com/1', 'https://b.com/2'])
  })

  it('never loses a character of the body', () => {
    const body = 'ก่อน https://x.com/y! หลัง'
    expect(linkify(body).map(s => s.value).join('')).toBe(body)
  })

  it('does not link a bare domain, which is usually not one', () => {
    expect(linkify('คะแนนเต็ม 10.5 คะแนน')).toHaveLength(1)
  })
})

describe('hrefOf', () => {
  it('leaves an absolute URL alone and never invents another scheme', () => {
    expect(hrefOf('http://korkru.com')).toBe('http://korkru.com')
    expect(hrefOf('https://korkru.com')).toBe('https://korkru.com')
    expect(hrefOf('www.korkru.com')).toBe('https://www.korkru.com')
  })
})

describe('shortenUrl', () => {
  it('drops the scheme but keeps a short address whole', () => {
    expect(shortenUrl('https://korkru.com/exam')).toBe('korkru.com/exam')
  })

  it('elides the middle of a long one, keeping both ends', () => {
    const short = shortenUrl(`https://korkru.com/${'a'.repeat(80)}/end12345`)
    expect(short.length).toBeLessThanOrEqual(48)
    expect(short.startsWith('korkru.com/')).toBe(true)
    expect(short.endsWith('end12345')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  decodeHtmlEntities,
  htmlToDocxParagraphs,
  htmlToPlainText,
  IOC_DOCX_IMAGE_PLACEHOLDER,
} from './ioc-docx-html'

describe('decodeHtmlEntities', () => {
  it('decodes the named entities the editor emits', () => {
    expect(decodeHtmlEntities('a &amp; b &lt;c&gt; &quot;d&quot;')).toBe('a & b <c> "d"')
  })

  it('decodes decimal and hexadecimal references', () => {
    expect(decodeHtmlEntities('&#3585;&#x0E02;')).toBe('กข')
  })

  it('leaves an unknown entity as the author typed it', () => {
    expect(decodeHtmlEntities('&notanentity;')).toBe('&notanentity;')
  })
})

describe('htmlToDocxParagraphs', () => {
  it('returns nothing for empty input', () => {
    expect(htmlToDocxParagraphs('')).toEqual([])
    expect(htmlToDocxParagraphs(null)).toEqual([])
    expect(htmlToDocxParagraphs(undefined)).toEqual([])
  })

  it('turns each block into its own paragraph', () => {
    const result = htmlToDocxParagraphs('<p>บรรทัดหนึ่ง</p><p>บรรทัดสอง</p>')
    expect(result).toHaveLength(2)
    expect(result[0].runs[0].text).toBe('บรรทัดหนึ่ง')
    expect(result[1].runs[0].text).toBe('บรรทัดสอง')
  })

  it('carries inline styles onto the runs they wrap', () => {
    const [paragraph] = htmlToDocxParagraphs('<p>ปกติ <b>หนา</b> และ <em>เอียง</em></p>')
    expect(paragraph.runs.map(run => [run.text, run.bold ?? false, run.italics ?? false])).toEqual([
      ['ปกติ ', false, false],
      ['หนา', true, false],
      [' และ ', false, false],
      ['เอียง', false, true],
    ])
  })

  it('nests styles rather than replacing them', () => {
    const [paragraph] = htmlToDocxParagraphs('<p><b>หนา<i>ทั้งสอง</i></b></p>')
    expect(paragraph.runs[1]).toMatchObject({ text: 'ทั้งสอง', bold: true, italics: true })
  })

  it('keeps superscript and subscript apart', () => {
    const [paragraph] = htmlToDocxParagraphs('<p>x<sup>2</sup> และ H<sub>2</sub>O</p>')
    expect(paragraph.runs.find(run => run.superScript)?.text).toBe('2')
    expect(paragraph.runs.find(run => run.subScript)?.text).toBe('2')
  })

  it('breaks a paragraph at <br>', () => {
    const result = htmlToDocxParagraphs('บน<br>ล่าง')
    expect(result.map(p => p.runs[0].text)).toEqual(['บน', 'ล่าง'])
  })

  it('marks list items as bullets', () => {
    const result = htmlToDocxParagraphs('<ul><li>ก</li><li>ข</li></ul>')
    expect(result.map(p => [p.runs[0].text, p.bullet])).toEqual([['ก', true], ['ข', true]])
  })

  it('says where an image was rather than dropping it silently', () => {
    const [paragraph] = htmlToDocxParagraphs('<p>ดูรูป <img src="https://example.test/a.png" alt=""> แล้วตอบ</p>')
    expect(paragraph.runs.map(run => run.text).join('')).toContain(IOC_DOCX_IMAGE_PLACEHOLDER)
  })

  it('ignores tags it does not know instead of losing their text', () => {
    const [paragraph] = htmlToDocxParagraphs('<p><span class="whatever">ยังอยู่</span></p>')
    expect(paragraph.runs[0].text).toBe('ยังอยู่')
  })

  it('leaves LaTeX as the author typed it', () => {
    // The printed page renders \\(…\\) through KaTeX; Word has no KaTeX, and the
    // source a teacher can retype is more useful than a formula silently gone.
    const [paragraph] = htmlToDocxParagraphs('<p>จงหาค่า \\(\\frac{1}{2}\\)</p>')
    expect(paragraph.runs[0].text).toBe('จงหาค่า \\(\\frac{1}{2}\\)')
  })

  it('keeps the non-breaking space that indents the scale', () => {
    // The +1 / 0 / −1 scale lines up its middle row with two of these; an
    // ordinary space would be collapsed away and the column would jump.
    const [paragraph] = htmlToDocxParagraphs('<p>&nbsp;&nbsp;0 ไม่แน่ใจ</p>')
    expect(paragraph.runs[0].text.startsWith('\u00a0\u00a00')).toBe(true)
  })

  it('collapses runs of whitespace the way a browser would', () => {
    const [paragraph] = htmlToDocxParagraphs('<p>เว้น     วรรค\n\nยาว</p>')
    expect(paragraph.runs[0].text).toBe('เว้น วรรค ยาว')
  })

  it('drops a paragraph that holds only whitespace', () => {
    expect(htmlToDocxParagraphs('<p>  </p><p>มีเนื้อหา</p>')).toHaveLength(1)
  })

  it('survives an unclosed tag', () => {
    const result = htmlToDocxParagraphs('<p><b>ยังเปิดค้างอยู่')
    expect(result[0].runs[0]).toMatchObject({ text: 'ยังเปิดค้างอยู่', bold: true })
  })

  it('ignores comments', () => {
    const [paragraph] = htmlToDocxParagraphs('<p>ก<!-- ซ่อน -->ข</p>')
    expect(paragraph.runs.map(run => run.text).join('')).toBe('กข')
  })
})

describe('htmlToPlainText', () => {
  it('joins every block into one line', () => {
    expect(htmlToPlainText('<p>หนึ่ง</p><p>สอง</p>')).toBe('หนึ่ง สอง')
  })

  it('returns an empty string for nothing at all', () => {
    expect(htmlToPlainText(null)).toBe('')
  })
})

import { describe, it, expect } from 'vitest'
import { containsMath, renderMathInHtml } from './latex'

describe('containsMath', () => {
  it('recognises the two delimiters and nothing else', () => {
    expect(containsMath('\\(v = u + at\\)')).toBe(true)
    expect(containsMath('\\[E = mc^2\\]')).toBe(true)
    expect(containsMath('ราคา $5 ต่อชิ้น')).toBe(false)
    expect(containsMath('<p>ไม่มีสูตร</p>')).toBe(false)
  })
})

describe('renderMathInHtml', () => {
  it('leaves text without math untouched', () => {
    const html = '<p>ปริมาณที่มีแต่ขนาดเรียกว่าอะไร</p>'
    expect(renderMathInHtml(html)).toBe(html)
  })

  it('handles null and undefined', () => {
    expect(renderMathInHtml(null)).toBe('')
    expect(renderMathInHtml(undefined)).toBe('')
  })

  it('renders inline math into KaTeX markup', () => {
    const out = renderMathInHtml('<p>\\(\\theta = 37\\)</p>')
    expect(out).toContain('katex')
    expect(out).not.toContain('\\(')
  })

  it('emits MathML alongside the visual layer, so the formula is readable to assistive tech', () => {
    // The visual span is aria-hidden; without the MathML twin the formula
    // disappears from the accessibility tree entirely.
    expect(renderMathInHtml('\\(x^2\\)')).toContain('<math')
  })

  it('marks display math as display mode', () => {
    expect(renderMathInHtml('\\[v^2 = u^2 + 2as\\]')).toContain('katex-display')
    expect(renderMathInHtml('\\(v\\)')).not.toContain('katex-display')
  })

  it('renders two formulas in one paragraph separately', () => {
    const out = renderMathInHtml('<p>\\(a\\) และ \\(b\\)</p>')
    expect(out).toContain('และ')
    // Non-greedy matching, or the two would be swallowed into one span.
    expect(out.match(/class="katex"/g)?.length).toBe(2)
  })

  it('decodes entities before handing the TeX to KaTeX', () => {
    // Stored HTML escapes these, and KaTeX needs the real characters.
    expect(renderMathInHtml('\\(a &lt; b\\)')).toContain('katex')
    expect(renderMathInHtml('\\(a &lt; b\\)')).not.toContain('&amp;lt;')
  })

  it('keeps going when one formula is malformed', () => {
    const out = renderMathInHtml('<p>\\(\\frac{1\\) และ \\(x\\)</p>')
    expect(out).toContain('และ')
    expect(out).toContain('katex')
  })

  it('leaves an empty span alone rather than emitting an empty formula', () => {
    expect(renderMathInHtml('\\(  \\)')).toBe('\\(  \\)')
  })

  it('does not touch a bare dollar sign', () => {
    const html = '<p>ค่าไฟ $5 ต่อหน่วย</p>'
    expect(renderMathInHtml(html)).toBe(html)
  })
})

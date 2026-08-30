import { describe, it, expect } from 'vitest'
import { parseXml } from './xml'
import { ommlToTex } from './omml'

/** Wraps OOXML math fragments the way Word nests them inside a run. */
function math(inner: string) {
  return ommlToTex(parseXml(`<m:oMath>${inner}</m:oMath>`))
}

const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`

describe('ommlToTex', () => {
  it('turns a square root into TeX rather than losing the radical', () => {
    // The failure this exists to prevent: "15√2" read as characters is "152",
    // a number ten times too large that looks entirely ordinary.
    const result = math(`${run('15')}<m:rad><m:radPr/><m:deg/><m:e>${run('2')}</m:e></m:rad>`)
    expect(result.structured).toBe(true)
    expect(result.value).toBe('15\\sqrt{2}')
  })

  it('keeps an explicit root degree', () => {
    const result = math(`<m:rad><m:deg>${run('3')}</m:deg><m:e>${run('8')}</m:e></m:rad>`)
    expect(result.value).toBe('\\sqrt[3]{8}')
  })

  it('turns a fraction into \\frac', () => {
    // "⅛g" read as characters is "18g".
    const result = math(`<m:f><m:num>${run('1')}</m:num><m:den>${run('8')}</m:den></m:f>${run('g')}`)
    expect(result.structured).toBe(true)
    expect(result.value).toBe('\\frac{1}{8}g')
  })

  it('handles superscripts and subscripts', () => {
    expect(math(`<m:sSup><m:e>${run('v')}</m:e><m:sup>${run('2')}</m:sup></m:sSup>`).value)
      .toBe('{v}^{2}')
    expect(math(`<m:sSub><m:e>${run('m')}</m:e><m:sub>${run('1')}</m:sub></m:sSub>`).value)
      .toBe('{m}_{1}')
    expect(math(`<m:sSubSup><m:e>${run('x')}</m:e><m:sub>${run('a')}</m:sub><m:sup>${run('b')}</m:sup></m:sSubSup>`).value)
      .toBe('{x}_{a}^{b}')
  })

  it('reads delimiters, defaulting to parentheses', () => {
    const result = math(`<m:d><m:e>${run('a+b')}</m:e></m:d>`)
    expect(result.value).toBe('\\left(a+b\\right)')
  })

  it('honours the bracket characters the document asks for', () => {
    const result = math(`<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${run('x')}</m:e></m:d>`)
    expect(result.value).toBe('\\left[x\\right]')
  })

  it('names Greek letters so KaTeX sets them as maths', () => {
    const result = math(`<m:f><m:num>${run('μ')}</m:num><m:den>${run('2')}</m:den></m:f>`)
    expect(result.value).toBe('\\frac{\\mu }{2}')
  })

  it('wraps Thai inside an equation in \\text so it stays readable', () => {
    const result = math(`<m:f><m:num>${run('แรง')}</m:num><m:den>${run('2')}</m:den></m:f>`)
    expect(result.value).toBe('\\frac{\\text{แรง}}{2}')
  })

  it('escapes the characters TeX would otherwise read as instructions', () => {
    // An underscore is not something KaTeX can set on its own, so the run
    // goes through \text — escaped either way, which is the point.
    const result = math(`<m:rad><m:deg/><m:e>${run('a_b')}</m:e></m:rad>`)
    expect(result.value).toBe('\\sqrt{\\text{a\\_b}}')
  })

  it('reports an equation holding only characters as unstructured text', () => {
    // Word wraps ordinary words in an equation often enough that treating
    // every m:oMath as maths italicises plain prose.
    const result = math(run('ความเร่ง'))
    expect(result.structured).toBe(false)
    expect(result.value).toBe('ความเร่ง')
  })

  it('degrades an unrecognised construct to its contents instead of dropping it', () => {
    const result = math(`<m:borderBox><m:e>${run('E=mc')}</m:e></m:borderBox>`)
    expect(result.value).toBe('E=mc')
  })

  it('reads an n-ary operator with its limits', () => {
    const result = math(`<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run('i=1')}</m:sub><m:sup>${run('n')}</m:sup><m:e>${run('x')}</m:e></m:nary>`)
    expect(result.structured).toBe(true)
    expect(result.value).toContain('\\sum')
    expect(result.value).toContain('_{i=1}')
    expect(result.value).toContain('^{n}')
  })

  it('reads a vector accent', () => {
    const result = math(`<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${run('F')}</m:e></m:acc>`)
    expect(result.value).toBe('\\vec{F}')
  })
})

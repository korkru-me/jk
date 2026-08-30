import { describe, it, expect } from 'vitest'
import {
  parseXml, XmlError, decodeEntities,
  firstChild, childrenNamed, firstDescendant, descendants, textContent,
} from './xml'

describe('decodeEntities', () => {
  it('decodes the named entities XML defines', () => {
    expect(decodeEntities('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;'))
      .toBe(`a & b < c > d "e" 'f'`)
  })

  it('decodes decimal and hex character references', () => {
    expect(decodeEntities('&#3585;&#x0E02;')).toBe('กข')
  })

  it('leaves anything it does not recognise alone', () => {
    expect(decodeEntities('50 &euro; &notanentity;')).toBe('50 &euro; &notanentity;')
  })

  it('leaves an out-of-range character reference as written', () => {
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;')
  })
})

describe('parseXml', () => {
  it('reads elements, attributes and text', () => {
    const root = parseXml('<w:p w:rsidR="00A"><w:r><w:t>สวัสดี</w:t></w:r></w:p>')
    expect(root.name).toBe('w:p')
    expect(root.attrs['w:rsidR']).toBe('00A')
    expect(textContent(root)).toBe('สวัสดี')
  })

  it('handles self-closing elements', () => {
    const root = parseXml('<w:rPr><w:b/><w:u w:val="single"/></w:rPr>')
    expect(root.children.map(c => c.name)).toEqual(['w:b', 'w:u'])
    expect(firstChild(root, 'w:u')?.attrs['w:val']).toBe('single')
  })

  it('accepts single-quoted attribute values', () => {
    const root = parseXml("<a b='1' c=\"2\"/>")
    expect(root.attrs).toEqual({ b: '1', c: '2' })
  })

  it('skips the declaration, comments and doctype', () => {
    const root = parseXml('<?xml version="1.0"?><!-- note --><a><!-- x --><b>1</b></a>')
    expect(root.name).toBe('a')
    expect(textContent(root)).toBe('1')
  })

  it('keeps CDATA verbatim', () => {
    const root = parseXml('<a><![CDATA[<not> & markup]]></a>')
    expect(textContent(root)).toBe('<not> & markup')
  })

  it('preserves significant whitespace inside text', () => {
    const root = parseXml('<w:t xml:space="preserve"> ตาม </w:t>')
    expect(root.text).toBe(' ตาม ')
  })

  it('rejects a mismatched closing tag rather than guessing', () => {
    expect(() => parseXml('<a><b></a></b>')).toThrow(XmlError)
  })

  it('rejects an unquoted attribute value', () => {
    expect(() => parseXml('<a b=1/>')).toThrow(XmlError)
  })

  it('rejects input with no element in it', () => {
    expect(() => parseXml('<!-- only a comment -->')).toThrow(XmlError)
  })
})

describe('lookup helpers', () => {
  const root = parseXml(`
    <w:body>
      <w:p><w:r><w:t>one</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>three</w:t></w:r></w:p>
    </w:body>
  `)

  it('firstChild looks at direct children only', () => {
    expect(firstChild(root, 'w:p')).not.toBeNull()
    expect(firstChild(root, 'w:r')).toBeNull()
  })

  it('childrenNamed returns every direct match', () => {
    expect(childrenNamed(root, 'w:p')).toHaveLength(2)
  })

  it('descendants finds nested matches in document order', () => {
    expect(descendants(root, 'w:t').map(node => node.text)).toEqual(['one', 'two', 'three'])
  })

  it('firstDescendant reaches through intermediate elements', () => {
    expect(firstDescendant(root, 'w:tc')).not.toBeNull()
    expect(textContent(firstDescendant(root, 'w:tbl')!)).toContain('two')
  })
})

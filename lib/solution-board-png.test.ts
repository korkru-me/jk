import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { emptyScratchpadScene, type ScratchpadScene } from '@/lib/scratchpad'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import {
  crc32,
  embedSolutionBoardScene,
  extractSolutionBoardScene,
  MAX_SOLUTION_BOARD_SCENE_BYTES,
  readPngText,
  SOLUTION_BOARD_SCENE_KEYWORD,
  validateSolutionBoardScene,
  writePngText,
} from '@/lib/solution-board-png'

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(Array.from(type, character => character.charCodeAt(0)), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/** A real 1×1 RGBA PNG, built the long way so the test owns every byte. */
function tinyPng(): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, 1)
  view.setUint32(4, 1)
  header.set([8, 6, 0, 0, 0], 8)
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(Uint8Array.of(0, 255, 255, 255, 255)))),
    chunk('IEND', new Uint8Array()),
  ]
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

function scene(): ScratchpadScene {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [],
    appState: { viewBackgroundColor: 'transparent' },
    files: {},
    background: 'grid',
  }
}

describe('solution board PNG', () => {
  it('matches the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
  })

  it('carries the scene through the picture and back', async () => {
    const withScene = await embedSolutionBoardScene(tinyPng(), scene())
    expect(Array.from(withScene.subarray(-12))).toEqual(Array.from(tinyPng().subarray(-12))) // still ends at IEND
    expect(await extractSolutionBoardScene(withScene)).toEqual(scene())
  })

  it('keeps Thai text written on the board', async () => {
    const written = { ...scene(), appState: { ...scene().appState, name: 'เฉลยข้อ ๑ — ความเร่ง' } }
    const withScene = await embedSolutionBoardScene(tinyPng(), written)
    expect(await extractSolutionBoardScene(withScene)).toEqual(written)
  })

  it('replaces the scene on a second save rather than stacking them', async () => {
    const first = await embedSolutionBoardScene(tinyPng(), scene())
    const second = await embedSolutionBoardScene(first, { ...scene(), background: 'dots' })
    const keyword = new TextEncoder().encode(SOLUTION_BOARD_SCENE_KEYWORD)
    const occurrences = Array.from(second).filter((_, index) => (
      keyword.every((byte, offset) => second[index + offset] === byte)
    )).length
    expect(occurrences).toBe(1)
    expect(await extractSolutionBoardScene(second)).toMatchObject({ background: 'dots' })
  })

  it('reads an uncompressed scene, as a browser without CompressionStream writes it', async () => {
    const json = new TextEncoder().encode(JSON.stringify(scene()))
    const png = writePngText(tinyPng(), SOLUTION_BOARD_SCENE_KEYWORD, json, false)
    expect(readPngText(png, SOLUTION_BOARD_SCENE_KEYWORD)?.compressed).toBe(false)
    expect(await extractSolutionBoardScene(png)).toEqual(scene())
  })

  it('finds nothing in a plain picture, a damaged chunk or a file that is not a PNG', async () => {
    expect(await extractSolutionBoardScene(tinyPng())).toBeNull()

    const withScene = await embedSolutionBoardScene(tinyPng(), scene())
    const damaged = withScene.slice()
    damaged[damaged.length - 20] ^= 0xff // inside the scene chunk, before IEND
    expect(await extractSolutionBoardScene(damaged)).toBeNull()

    expect(await extractSolutionBoardScene(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
    expect(() => writePngText(new Uint8Array(16), SOLUTION_BOARD_SCENE_KEYWORD, new Uint8Array(), false)).toThrow()
  })

  it('refuses to inflate past the scene ceiling', async () => {
    const huge = new Uint8Array(deflateSync(new Uint8Array(MAX_SOLUTION_BOARD_SCENE_BYTES + 1).fill(0x20)))
    const png = writePngText(tinyPng(), SOLUTION_BOARD_SCENE_KEYWORD, huge, true)
    expect(await extractSolutionBoardScene(png)).toBeNull()
  })

  it('validates like a stored กระดานสอน, but refuses any picture', () => {
    expect(validateSolutionBoardScene(emptyScratchpadScene()).ok).toBe(true)
    const withImage = {
      ...scene(),
      elements: [{
        id: 'image-1',
        type: 'image',
        fileId: 'file-1',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        isDeleted: false,
      }],
      files: {
        'file-1': { id: 'file-1', mimeType: 'image/png', dataURL: 'data:image/png;base64,iVBORw0KGgo=', created: 1 },
      },
    }
    expect(validateSolutionBoardScene(withImage).ok).toBe(false)
  })
})

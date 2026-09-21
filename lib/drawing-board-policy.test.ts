import { describe, expect, it } from 'vitest'
import {
  createLegacyTeacherImageSnapshot,
  isDrawingBoardCommandAllowed,
  isDrawingBoardToolAllowed,
  isIncompleteTransientDrawingElement,
  isSerializedDrawingClipboardText,
  recoveryDrawingScene,
  referencedDrawingFiles,
  snapshotDrawingScene,
  shouldBlockDrawingBoardShortcut,
  validateDrawingScene,
  type DrawingBoardCommand,
} from '@/lib/drawing-board-policy'
import { CURRENT_WORK_FORMAT_VERSION, MAX_WORK_ELEMENTS } from '@/lib/math-work'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function element(type = 'freedraw', overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    id: `element-${type}`,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    strokeColor: '#172554',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 2,
    index: null,
    isDeleted: false,
    link: null,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    locked: false,
  }
  if (type === 'freedraw') Object.assign(base, {
    points: [[0, 0], [1, 1]], pressures: [0, 0], simulatePressure: true,
    lastCommittedPoint: null,
  })
  if (type === 'line' || type === 'arrow') Object.assign(base, {
    points: [[0, 0], [1, 1]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
    ...(type === 'arrow' ? { elbowed: false } : {}),
  })
  if (type === 'text') Object.assign(base, {
    text: 'ข้อความ', originalText: 'ข้อความ', fontSize: 20, fontFamily: 1,
    textAlign: 'left', verticalAlign: 'top', containerId: null,
    autoResize: true, lineHeight: 1.25,
  })
  if (type === 'image') Object.assign(base, {
    fileId: 'file-1', status: 'saved', scale: [1, 1], crop: null,
  })
  if (type === 'frame') Object.assign(base, { name: null })
  return { ...base, ...overrides }
}

function scene(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [],
    appState: {},
    files: {},
    background: 'lined',
    ...overrides,
  }
}

function teacherImageScene(overrides: { dataURL?: string; claim?: string; elementId?: string; fileId?: string } = {}) {
  const fileId = overrides.fileId ?? 'file-1'
  const elementId = overrides.elementId ?? 'image-1'
  return scene({
    elements: [element('image', { id: elementId, fileId })],
    files: {
      [fileId]: {
        id: fileId,
        dataURL: overrides.dataURL ?? PNG,
        mimeType: 'image/png',
        created: 1,
        ...(overrides.claim
          ? { korkruQuestionImage: { version: 1, claim: overrides.claim } }
          : {}),
      },
    },
  })
}

describe('drawing board command policy', () => {
  const common: DrawingBoardCommand[] = [
    'select', 'edit', 'delete', 'erase-object', 'undo', 'redo', 'pan', 'zoom',
    'fit', 'change-tool', 'paste-literal-text',
  ]
  const teacherOnly: DrawingBoardCommand[] = [
    'frame-app', 'laser-app', 'grid-app', 'library-session', 'trusted-question-image',
  ]
  const denied: DrawingBoardCommand[] = [
    'copy-elements', 'cut-elements', 'paste-elements', 'duplicate-elements',
    'group', 'align', 'change-order', 'hyperlink', 'embed', 'clear-native',
    'export-native', 'help-native', 'frame-native', 'grid-native', 'library-native',
    'generic-image', 'native-lock',
  ]

  it('allows only the shared commands for students', () => {
    for (const command of common) expect(isDrawingBoardCommandAllowed('student', command)).toBe(true)
    for (const command of [...teacherOnly, ...denied]) {
      expect(isDrawingBoardCommandAllowed('student', command)).toBe(false)
    }
  })

  it('adds only app-owned teacher commands', () => {
    for (const command of [...common, ...teacherOnly]) {
      expect(isDrawingBoardCommandAllowed('teacher', command)).toBe(true)
    }
    for (const command of denied) expect(isDrawingBoardCommandAllowed('teacher', command)).toBe(false)
  })

  it('uses the same role policy for runtime tools', () => {
    expect(isDrawingBoardToolAllowed('student', 'freedraw')).toBe(true)
    expect(isDrawingBoardToolAllowed('student', 'frame')).toBe(false)
    expect(isDrawingBoardToolAllowed('student', 'laser')).toBe(false)
    expect(isDrawingBoardToolAllowed('teacher', 'frame')).toBe(true)
    expect(isDrawingBoardToolAllowed('teacher', 'laser')).toBe(true)
    expect(isDrawingBoardToolAllowed('teacher', 'embeddable')).toBe(false)
  })
})

describe('drawing scene content policy', () => {
  it.each(['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text'])(
    'accepts student %s elements, including deleted history',
    type => {
      const result = validateDrawingScene(scene({
        elements: [element(type, { isDeleted: true })],
      }), { role: 'student' })
      expect(result.ok).toBe(true)
    },
  )

  it.each(['image', 'frame', 'selection', 'magicframe', 'iframe', 'embeddable', 'unknown'])(
    'rejects student %s elements',
    type => {
      const result = validateDrawingScene(scene({ elements: [element(type)] }), { role: 'student' })
      expect(result).toMatchObject({ ok: false, kind: 'unsupported', code: 'unsupported-element' })
    },
  )

  it.each([
    ['link', { link: 'https://example.test' }, 'element-link'],
    ['custom generation data', { customData: { generated: true } }, 'element-custom-data'],
    ['groups', { groupIds: ['group-1'] }, 'element-group'],
    ['native lock', { locked: true }, 'element-lock'],
  ])('rejects %s', (_name, elementPatch, code) => {
    const result = validateDrawingScene(scene({
      elements: [element('text', elementPatch as Record<string, unknown>)],
    }), { role: 'student' })
    expect(result).toMatchObject({ ok: false, code })
  })

  it('rejects unknown and transient app state', () => {
    expect(validateDrawingScene(scene({ appState: { openDialog: { name: 'help' } } }), { role: 'student' }))
      .toMatchObject({ ok: false, code: 'unsupported-app-state' })
    expect(validateDrawingScene(scene({ appState: { scrollX: 1, penMode: true } }), { role: 'student' }).ok)
      .toBe(true)
  })

  it.each([
    ['missing coordinates', { x: undefined }],
    ['non-array groups', { groupIds: 'group-1' }],
    ['non-boolean lock', { locked: 'false' }],
    ['non-object custom data', { customData: 'payload' }],
    ['malformed text', { text: null }],
  ])('rejects structurally malformed elements: %s', (_name, patch) => {
    const result = validateDrawingScene(scene({
      elements: [element('text', patch)],
    }), { role: 'student' })
    expect(result.ok).toBe(false)
  })

  it.each([
    ['extreme x', { x: 1e308 }],
    ['extreme width', { width: -1e308 }],
    ['extreme point', { points: [[0, 0], [1e308, 1]] }],
    ['extreme font size', { fontSize: 1e308 }],
    ['negative opacity', { opacity: -1 }],
    ['fractional version', { version: 1.5 }],
  ])('rejects unsafe numeric element values: %s', (_name, patch) => {
    const type = Object.prototype.hasOwnProperty.call(patch, 'fontSize') ? 'text' : 'freedraw'
    expect(validateDrawingScene(scene({
      elements: [element(type, patch)],
    }), { role: 'student' }).ok).toBe(false)
  })

  it('rejects unknown element and nested relation fields', () => {
    expect(validateDrawingScene(scene({
      elements: [element('text', { injected: true })],
    }), { role: 'student' })).toMatchObject({ ok: false, code: 'invalid-element' })
    expect(validateDrawingScene(scene({
      elements: [
        element('rectangle', {
          id: 'box',
          boundElements: [{ id: 'label', type: 'text', injected: true }],
        }),
        element('text', { id: 'label', containerId: 'box' }),
      ],
    }), { role: 'student' })).toMatchObject({ ok: false, code: 'invalid-element' })
  })

  it('accepts reciprocal bound text and arrow relations', () => {
    const value = scene({
      elements: [
        element('rectangle', {
          id: 'box',
          boundElements: [{ id: 'label', type: 'text' }, { id: 'arrow-1', type: 'arrow' }],
        }),
        element('text', { id: 'label', containerId: 'box' }),
        element('arrow', {
          id: 'arrow-1',
          startBinding: { elementId: 'box', focus: 0, gap: 1 },
        }),
      ],
    })
    expect(validateDrawingScene(value, { role: 'student' }).ok).toBe(true)
  })

  it.each([
    ['dangling text container', [element('text', { containerId: 'missing' })]],
    ['missing reciprocal text relation', [
      element('rectangle', { id: 'box' }),
      element('text', { id: 'label', containerId: 'box' }),
    ]],
    ['dangling arrow binding', [
      element('arrow', { startBinding: { elementId: 'missing', focus: 0, gap: 1 } }),
    ]],
    ['missing reciprocal arrow relation', [
      element('rectangle', { id: 'box' }),
      element('arrow', { id: 'arrow-1', startBinding: { elementId: 'box', focus: 0, gap: 1 } }),
    ]],
    ['orphaned bound element', [
      element('rectangle', { id: 'box', boundElements: [{ id: 'missing', type: 'text' }] }),
    ]],
  ])('rejects malformed element relations: %s', (_name, elements) => {
    expect(validateDrawingScene(scene({ elements }), { role: 'student' }))
      .toMatchObject({ ok: false, code: 'invalid-element-relation' })
  })

  it('treats stale relations on deleted undo-history nodes as inert', () => {
    const value = scene({
      elements: [
        element('rectangle', { id: 'box', boundElements: null }),
        element('arrow', {
          id: 'deleted-arrow',
          isDeleted: true,
          startBinding: { elementId: 'box', focus: 0, gap: 1 },
        }),
        element('text', {
          id: 'deleted-label',
          isDeleted: true,
          containerId: 'box',
        }),
      ],
    })
    expect(validateDrawingScene(value, { role: 'student' }).ok).toBe(true)
  })

  it('accepts stale eraser relations that terminate at deleted history', () => {
    expect(validateDrawingScene(scene({
      elements: [
        element('rectangle', { id: 'box', isDeleted: true }),
        element('arrow', {
          id: 'arrow-1',
          startBinding: { elementId: 'box', focus: 0, gap: 1 },
        }),
      ],
    }), { role: 'student' }).ok).toBe(true)

    expect(validateDrawingScene(scene({
      elements: [
        element('rectangle', {
          id: 'box',
          boundElements: [
            { id: 'arrow-1', type: 'arrow' },
            { id: 'label', type: 'text' },
          ],
        }),
        element('arrow', {
          id: 'arrow-1',
          isDeleted: true,
          startBinding: { elementId: 'box', focus: 0, gap: 1 },
        }),
        element('text', { id: 'label', isDeleted: true, containerId: 'box' }),
      ],
    }), { role: 'student' }).ok).toBe(true)
  })

  it('rejects malformed elbow-arrow fields and unsupported enums', () => {
    expect(validateDrawingScene(scene({
      elements: [element('arrow', { elbowed: true, fixedSegments: null })],
    }), { role: 'student' }).ok).toBe(false)
    expect(validateDrawingScene(scene({
      elements: [element('text', { textAlign: 'justify' })],
    }), { role: 'student' }).ok).toBe(false)
  })

  it('accepts validated elbow metadata retained by an arrow-type toggle', () => {
    const retained = element('arrow', {
      elbowed: false,
      fixedSegments: [{ start: [0, 0], end: [1, 1], index: 0 }],
      startIsSpecial: false,
      endIsSpecial: null,
    })
    expect(validateDrawingScene(scene({ elements: [retained] }), { role: 'student' }).ok).toBe(true)

    expect(validateDrawingScene(scene({
      elements: [element('arrow', { elbowed: false, fixedSegments: [{ injected: true }] })],
    }), { role: 'student' }).ok).toBe(false)
  })

  it('allows only the active live linear/free-draw element to be structurally incomplete', () => {
    const onePointLine = scene({ elements: [element('line', { id: 'drawing-line', points: [[0, 0]] })] })
    expect(validateDrawingScene(onePointLine, { role: 'student' }).ok).toBe(false)
    expect(validateDrawingScene(onePointLine, {
      role: 'student', mode: 'live', transientElementId: 'drawing-line',
    }).ok).toBe(true)
    expect(validateDrawingScene(onePointLine, {
      role: 'student', mode: 'live', transientElementId: 'other',
    }).ok).toBe(false)

    const emptyFreeDraw = scene({
      elements: [element('freedraw', { id: 'drawing-free', points: [], pressures: [] })],
    })
    expect(validateDrawingScene(emptyFreeDraw, { role: 'student' }).ok).toBe(false)
    expect(validateDrawingScene(emptyFreeDraw, {
      role: 'student', mode: 'live', transientElementId: 'drawing-free',
    }).ok).toBe(true)

    expect(isIncompleteTransientDrawingElement(
      onePointLine.elements,
      'drawing-line',
    )).toBe(true)
    expect(isIncompleteTransientDrawingElement(
      [element('line', { id: 'editing-line' })],
      'editing-line',
    )).toBe(false)
  })

  it('detaches recovery snapshots from later in-place editor mutations', () => {
    const live = scene({ elements: [element('line')] })
    const validated = validateDrawingScene(live, { role: 'student' })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const snapshot = snapshotDrawingScene(validated.scene)

    const liveElement = (live.elements as Array<Record<string, unknown>>)[0]
    liveElement.x = 999
    ;(liveElement.points as number[][])[1][0] = 999

    expect((snapshot.elements[0] as Record<string, unknown>).x).toBe(0)
    expect((snapshot.elements[0] as Record<string, unknown>).points).toEqual([[0, 0], [1, 1]])
  })

  it('never recovers a last-good scene from another editor revision', () => {
    const accepted = scene({ elements: [element('rectangle', { id: 'board-a' })] })
    const validated = validateDrawingScene(accepted, { role: 'student' })
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const snapshot = { editorRevision: 7, scene: validated.scene }

    expect(recoveryDrawingScene(snapshot, 7, 'grid').elements).toHaveLength(1)
    expect(recoveryDrawingScene(snapshot, 8, 'grid')).toEqual({
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      elements: [],
      appState: {},
      files: {},
      background: 'grid',
    })
  })

  it.each([
    { zoom: null },
    { zoom: { value: Number.NaN } },
    { zoom: { value: 1e308 } },
    { zoom: { value: 1, injected: true } },
    { scrollY: -1e308 },
    { scrollX: '0' },
    { penMode: 'true' },
  ])('rejects malformed stable app state values', appState => {
    expect(validateDrawingScene(scene({ appState }), { role: 'student' }))
      .toMatchObject({ ok: false, code: 'unsupported-app-state' })
  })

  it('distinguishes malformed content, unsupported version and limits', () => {
    expect(validateDrawingScene(null, { role: 'student' }))
      .toMatchObject({ ok: false, kind: 'invalid', code: 'not-an-object' })
    expect(validateDrawingScene(scene({ formatVersion: 2 }), { role: 'student' }))
      .toMatchObject({ ok: false, kind: 'unsupported', code: 'unsupported-version' })
    expect(validateDrawingScene(scene({ elements: Array.from({ length: MAX_WORK_ELEMENTS + 1 }) }), { role: 'student' }))
      .toMatchObject({ ok: false, code: 'too-many-elements' })
    expect(validateDrawingScene(scene({ elements: [element('text', { text: 'x'.repeat(2_100_000) })] }), { role: 'student' }))
      .toMatchObject({ ok: false, code: 'scene-too-large' })
  })

  it('rejects unknown scene envelope fields instead of silently dropping them', () => {
    expect(validateDrawingScene(scene({ injected: { command: 'export' } }), { role: 'student' }))
      .toMatchObject({ ok: false, kind: 'invalid', code: 'invalid-envelope' })
  })

  it('accepts a structurally valid trusted teacher image and frame', () => {
    const value = teacherImageScene({ claim: 'signed-claim-with-enough-characters' })
    ;(value.elements as Array<Record<string, unknown>>).push(element('frame', { id: 'frame-1' }))
    const result = validateDrawingScene(value, {
      role: 'teacher',
      verifyTeacherImage: ({ claim }) => claim ? 'valid' : 'invalid',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects untrusted, orphaned, missing and mismatched teacher files', () => {
    expect(validateDrawingScene(teacherImageScene(), { role: 'teacher' }))
      .toMatchObject({ ok: false, code: 'untrusted-image' })
    expect(validateDrawingScene(scene({ files: { orphan: { id: 'orphan' } } }), { role: 'teacher' }))
      .toMatchObject({ ok: false, code: 'invalid-image-relation' })
    expect(validateDrawingScene(scene({ elements: [element('image', { fileId: 'missing' })] }), { role: 'teacher' }))
      .toMatchObject({ ok: false, code: 'invalid-image-relation' })
    const mismatch = teacherImageScene({ claim: 'signed-claim-with-enough-characters' })
    ;(mismatch.files as Record<string, Record<string, unknown>>)['file-1'].mimeType = 'image/jpeg'
    expect(validateDrawingScene(mismatch, {
      role: 'teacher',
      verifyTeacherImage: () => 'valid',
    })).toMatchObject({ ok: false, code: 'invalid-image-file' })

    const extraField = teacherImageScene({ claim: 'signed-claim-with-enough-characters' })
    ;(extraField.files as Record<string, Record<string, unknown>>)['file-1'].injected = true
    expect(validateDrawingScene(extraField, {
      role: 'teacher',
      verifyTeacherImage: () => 'valid',
    })).toMatchObject({ ok: false, code: 'invalid-image-relation' })
  })

  it('prunes Excalidraw file-map orphans without removing referenced image history', () => {
    const files = {
      keep: { id: 'keep' },
      orphan: { id: 'orphan' },
    }
    expect(referencedDrawingFiles([
      element('image', { fileId: 'keep', isDeleted: true }),
    ], files)).toEqual({ keep: files.keep })
    expect(referencedDrawingFiles([], files)).toEqual({})
  })

  it('allows only exact legacy image bytes and element/file relations', () => {
    const previous = validateDrawingScene(teacherImageScene(), {
      role: 'teacher',
      allowUnsignedTeacherImages: true,
    })
    expect(previous.ok).toBe(true)
    if (!previous.ok) return
    const snapshot = createLegacyTeacherImageSnapshot(previous.scene)
    expect(validateDrawingScene(teacherImageScene(), {
      role: 'teacher', legacyTeacherImages: snapshot,
    }).ok).toBe(true)
    expect(validateDrawingScene(teacherImageScene({ dataURL: PNG.replace('A8AA', 'A8AB') }), {
      role: 'teacher', legacyTeacherImages: snapshot,
    }).ok).toBe(false)
    expect(validateDrawingScene(teacherImageScene({ elementId: 'new-image-id' }), {
      role: 'teacher', legacyTeacherImages: snapshot,
    }).ok).toBe(false)
  })

  it('allows an authentic expired claim only for an exact previous image', () => {
    const value = teacherImageScene({ claim: 'expired-authentic-claim-token' })
    const classified = validateDrawingScene(value, {
      role: 'teacher', verifyTeacherImage: () => 'valid',
    })
    expect(classified.ok).toBe(true)
    if (!classified.ok) return
    const snapshot = createLegacyTeacherImageSnapshot(classified.scene)
    expect(validateDrawingScene(value, {
      role: 'teacher',
      verifyTeacherImage: () => 'expired-authentic',
      legacyTeacherImages: snapshot,
    }).ok).toBe(true)
    expect(validateDrawingScene(teacherImageScene({ claim: 'expired-authentic-claim-token', elementId: 'other' }), {
      role: 'teacher',
      verifyTeacherImage: () => 'expired-authentic',
      legacyTeacherImages: snapshot,
    })).toMatchObject({ ok: false, code: 'expired-image-claim' })
  })

  it('keeps an exact stored claim recoverable after key rotation but rejects claim tampering', () => {
    const value = teacherImageScene({ claim: 'claim-signed-by-the-previous-key' })
    const classified = validateDrawingScene(value, {
      role: 'teacher', verifyTeacherImage: () => 'valid',
    })
    expect(classified.ok).toBe(true)
    if (!classified.ok) return
    const snapshot = createLegacyTeacherImageSnapshot(classified.scene)
    expect(validateDrawingScene(value, {
      role: 'teacher',
      verifyTeacherImage: () => 'invalid',
      legacyTeacherImages: snapshot,
    }).ok).toBe(true)
    expect(validateDrawingScene(teacherImageScene({ claim: 'tampered-claim-with-enough-characters' }), {
      role: 'teacher',
      verifyTeacherImage: () => 'invalid',
      legacyTeacherImages: snapshot,
    }).ok).toBe(false)
  })
})

describe('native entry point decisions', () => {
  it.each(['f', 'F', 'k', 'q', '?', '9'])("blocks the '%s' shortcut", key => {
    expect(shouldBlockDrawingBoardShortcut({ key })).toBe(true)
  })

  it('blocks the physical native image-tool shortcut outside text editing', () => {
    expect(shouldBlockDrawingBoardShortcut({ key: '๙', code: 'Digit9' })).toBe(true)
    expect(shouldBlockDrawingBoardShortcut({ key: '9', code: 'Digit9', textEditing: true })).toBe(false)
  })

  it.each(['c', 'x', 'd', 'g', 'k', '/', '[', ']', 'Delete', 'Backspace'])(
    'blocks Ctrl/Meta + %s',
    key => {
      expect(shouldBlockDrawingBoardShortcut({ key, ctrlKey: true })).toBe(true)
      expect(shouldBlockDrawingBoardShortcut({ key, metaKey: true })).toBe(true)
    },
  )

  it('lets Ctrl/Meta+V reach the capture-phase paste policy', () => {
    expect(shouldBlockDrawingBoardShortcut({ key: 'v', ctrlKey: true })).toBe(false)
    expect(shouldBlockDrawingBoardShortcut({ key: 'v', metaKey: true })).toBe(false)
  })

  it('does not steal shortcuts while editing literal text', () => {
    expect(shouldBlockDrawingBoardShortcut({ key: 'v', metaKey: true, textEditing: true })).toBe(false)
  })

  it.each(['s', 'o', 'p'])('blocks browser Ctrl/Meta + %s even while editing text', key => {
    expect(shouldBlockDrawingBoardShortcut({ key, ctrlKey: true, textEditing: true })).toBe(true)
    expect(shouldBlockDrawingBoardShortcut({ key, metaKey: true, textEditing: true })).toBe(true)
  })

  it.each([
    ['KeyS', true],
    ['KeyO', true],
    ['KeyP', true],
    ['KeyF', false],
    ['KeyK', false],
    ['KeyQ', false],
  ])('uses physical %s when a non-Latin keyboard changes event.key', (code, modifier) => {
    expect(shouldBlockDrawingBoardShortcut({
      key: 'ห',
      code,
      ctrlKey: modifier,
      textEditing: modifier,
    })).toBe(true)
  })

  it('blocks the physical help key on a non-Latin layout', () => {
    expect(shouldBlockDrawingBoardShortcut({ key: 'ฦ', code: 'Slash', shiftKey: true })).toBe(true)
  })

  it('recognizes serialized drawing clipboards but not literal text', () => {
    expect(isSerializedDrawingClipboardText('{"type":"excalidraw/clipboard","elements":[]}')).toBe(true)
    expect(isSerializedDrawingClipboardText('{"elements":[]}')).toBe(true)
    expect(isSerializedDrawingClipboardText('graph TD; A-->B')).toBe(false)
    expect(isSerializedDrawingClipboardText('ข้อความไทย')).toBe(false)
  })
})

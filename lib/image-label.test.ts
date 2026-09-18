import { describe, it, expect } from 'vitest'
import {
  IMAGE_LABEL_PREFIX,
  imageLabelCorrectAnswer, imageLabelKey, imageLabelMarkerCount,
  isImageLabelMarkerCorrect, parseImageLabelAnswer, parseImageLabelKey,
} from './image-label'
import type { ImageLabelConfig, ImageLabelMarker } from '@/lib/types'

const marker = (over: Partial<ImageLabelMarker> = {}): ImageLabelMarker => ({
  id: 'm',
  point: { x: 50, y: 50 },
  answers: ['หลอดลม'],
  case_sensitive: false,
  ...over,
})

/** The worksheet this type was built for: one diagram, boxes pointing into it,
 *  and a word bank holding more words than there are boxes. */
const breathing: ImageLabelConfig = {
  image_url: '/samples/breathing.png',
  answer_mode: 'drag',
  bank: ['จมูก', 'โพรงจมูก', 'ท่อลม', 'หลอดลม', 'ปอด', 'กระบังลม', 'กระดูกซี่โครง'],
  markers: [
    marker({ id: 'm1', point: { x: 30, y: 12 }, answers: ['จมูก'] }),
    marker({ id: 'm2', point: { x: 46, y: 10 }, answers: ['โพรงจมูก'] }),
    marker({ id: 'm3', point: { x: 44, y: 38 }, answers: ['ท่อลม'] }),
    marker({ id: 'm4', point: { x: 56, y: 47 }, answers: ['หลอดลม'] }),
    marker({ id: 'm5', point: { x: 33, y: 60 }, answers: ['ปอด'] }),
  ],
}

describe('imageLabelKey', () => {
  it('gives one entry per point, in the points own order', () => {
    expect(imageLabelKey(breathing).map(m => m.answers)).toEqual([
      ['จมูก'], ['โพรงจมูก'], ['ท่อลม'], ['หลอดลม'], ['ปอด'],
    ])
  })

  it('keeps an entry for a point the teacher never keyed rather than dropping it', () => {
    // The student's browser sends one answer per marker in marker order.
    // Dropping the unkeyed entry here would slide every later answer one place
    // to the left and grade each of them against the wrong point.
    const config: ImageLabelConfig = {
      ...breathing,
      markers: [marker({ id: 'a', answers: [] }), marker({ id: 'b', answers: ['ปอด'] })],
    }
    expect(imageLabelKey(config)).toEqual([
      { answers: [], exact: true },
      { answers: ['ปอด'], exact: true },
    ])
  })

  it('unkeys a point whose answer is not in the word bank', () => {
    // What a teacher who edits the bank afterwards leaves behind, or a file
    // import written by hand. Nobody could drag a chip that does not exist, so
    // the point must not be worth a mark.
    const config: ImageLabelConfig = {
      ...breathing,
      markers: [marker({ answers: ['ถุงลม'] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual([])
  })

  it('keeps a point keyed on the answers that are still reachable', () => {
    const config: ImageLabelConfig = {
      ...breathing,
      markers: [marker({ answers: ['ถุงลม', 'ปอด'] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual(['ปอด'])
  })

  it('does not filter a typed answer against anything', () => {
    // Nothing is offered to pick from, so there is no list to be unreachable in.
    const config: ImageLabelConfig = {
      ...breathing,
      answer_mode: 'typed',
      markers: [marker({ answers: ['ถุงลม'] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual(['ถุงลม'])
  })

  it('checks a dropdown point against its own options when it has them', () => {
    const config: ImageLabelConfig = {
      ...breathing,
      answer_mode: 'dropdown',
      markers: [marker({ answers: ['ปอด'], options: ['หัวใจ', 'ตับ'] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual([])
  })

  it('falls back to the bank for a dropdown point with no options of its own', () => {
    const config: ImageLabelConfig = {
      ...breathing,
      answer_mode: 'dropdown',
      markers: [marker({ answers: ['ปอด'] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual(['ปอด'])
  })

  it('treats an emptied option list as no list rather than as an empty one', () => {
    // A teacher who clears a point's own options should get the bank back, not
    // a point that silently stopped being worth a mark.
    const config: ImageLabelConfig = {
      ...breathing,
      answer_mode: 'dropdown',
      markers: [marker({ answers: ['ปอด'], options: [] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual(['ปอด'])
  })

  it('drops answers that are blank or only whitespace', () => {
    const config: ImageLabelConfig = {
      ...breathing,
      answer_mode: 'typed',
      markers: [marker({ answers: ['  ', '', 'ปอด'] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual(['ปอด'])
  })

  it('collapses an answer the teacher typed twice', () => {
    const config: ImageLabelConfig = {
      ...breathing,
      answer_mode: 'typed',
      markers: [marker({ answers: ['ปอด', 'ปอด '] })],
    }
    expect(imageLabelKey(config)[0].answers).toEqual(['ปอด'])
  })

  it('compares a picked or dragged answer exactly, whatever case_sensitive says', () => {
    // The student did not type it — it is the teacher's own string handed back,
    // so folding case could only ever let a different option through.
    for (const answer_mode of ['drag', 'dropdown'] as const) {
      const config: ImageLabelConfig = {
        ...breathing,
        answer_mode,
        markers: [marker({ answers: ['ปอด'], case_sensitive: false })],
      }
      expect(imageLabelKey(config)[0].exact).toBe(true)
    }
  })

  it('lets a typed point decide for itself whether case matters', () => {
    const typed = (case_sensitive: boolean): ImageLabelConfig => ({
      ...breathing,
      answer_mode: 'typed',
      markers: [marker({ answers: ['Alveolus'], case_sensitive })],
    })
    expect(imageLabelKey(typed(true))[0].exact).toBe(true)
    expect(imageLabelKey(typed(false))[0].exact).toBe(false)
  })

  it('reads an unrecognised mode as typed, which filters nothing out', () => {
    const config = { ...breathing, answer_mode: 'lasso' as never, markers: [marker({ answers: ['ถุงลม'] })] }
    expect(imageLabelKey(config)[0].answers).toEqual(['ถุงลม'])
  })

  it('gives nothing back for data that is not an image-label config', () => {
    expect(imageLabelKey(null)).toEqual([])
    expect(imageLabelKey({})).toEqual([])
    expect(imageLabelKey({ markers: 'ปอด' })).toEqual([])
  })
})

describe('imageLabelMarkerCount', () => {
  it('counts every point the teacher keyed', () => {
    expect(imageLabelMarkerCount(breathing)).toBe(5)
  })

  it('leaves an unkeyed point out of the count', () => {
    const config: ImageLabelConfig = {
      ...breathing,
      markers: [...breathing.markers, marker({ id: 'm6', answers: [] })],
    }
    expect(imageLabelMarkerCount(config)).toBe(5)
  })

  it('leaves out a point whose answer the bank no longer offers', () => {
    // The count is the question's point value. A point nobody can answer
    // correctly must not be one the student is charged for.
    const config: ImageLabelConfig = {
      ...breathing,
      markers: [...breathing.markers, marker({ id: 'm6', answers: ['ถุงลม'] })],
    }
    expect(imageLabelMarkerCount(config)).toBe(5)
  })

  it('counts nothing when there is nothing to count', () => {
    expect(imageLabelMarkerCount(null)).toBe(0)
  })
})

describe('imageLabelCorrectAnswer', () => {
  it('carries the prefix that tells this key apart from every other type', () => {
    expect(imageLabelCorrectAnswer(breathing).startsWith(IMAGE_LABEL_PREFIX)).toBe(true)
  })

  it('survives the trip through storage unchanged', () => {
    const frozen = imageLabelCorrectAnswer(breathing)
    expect(parseImageLabelKey(frozen.slice(IMAGE_LABEL_PREFIX.length))).toEqual(imageLabelKey(breathing))
  })
})

describe('parseImageLabelKey', () => {
  it('degrades a truncated key to nothing rather than throwing', () => {
    // One malformed row must not take down a whole submission's grading pass.
    expect(parseImageLabelKey('[{"answers":["ปอ')).toEqual([])
    expect(parseImageLabelKey('')).toEqual([])
    expect(parseImageLabelKey('{"answers":[]}')).toEqual([])
  })

  it('degrades a junk entry to an unkeyed point', () => {
    expect(parseImageLabelKey('[null,7,{"answers":"ปอด"},{"answers":["ปอด"],"exact":true}]')).toEqual([
      { answers: [], exact: false },
      { answers: [], exact: false },
      { answers: [], exact: false },
      { answers: ['ปอด'], exact: true },
    ])
  })
})

describe('parseImageLabelAnswer', () => {
  it('reads one string per point, in point order', () => {
    expect(parseImageLabelAnswer('["จมูก","","ปอด"]')).toEqual(['จมูก', '', 'ปอด'])
  })

  it('turns anything that is not a string into an unanswered point', () => {
    expect(parseImageLabelAnswer('[1,null,{"a":1},"ปอด"]')).toEqual(['', '', '', 'ปอด'])
  })

  it('degrades unreadable input to nothing rather than throwing', () => {
    expect(parseImageLabelAnswer('["จม')).toEqual([])
    expect(parseImageLabelAnswer('')).toEqual([])
    expect(parseImageLabelAnswer('"ปอด"')).toEqual([])
  })
})

describe('isImageLabelMarkerCorrect', () => {
  it('never credits a point the teacher left unkeyed', () => {
    expect(isImageLabelMarkerCorrect('ปอด', { answers: [], exact: false })).toBe(false)
  })

  it('never credits an empty answer', () => {
    expect(isImageLabelMarkerCorrect('', { answers: ['ปอด'], exact: false })).toBe(false)
    expect(isImageLabelMarkerCorrect('   ', { answers: ['ปอด'], exact: false })).toBe(false)
  })

  it('ignores the spaces around what the student typed', () => {
    expect(isImageLabelMarkerCorrect('  ปอด  ', { answers: ['ปอด'], exact: false })).toBe(true)
  })

  it('accepts any one of the answers the teacher allowed', () => {
    expect(isImageLabelMarkerCorrect('ท่อลม', { answers: ['หลอดลม', 'ท่อลม'], exact: false })).toBe(true)
  })

  it('folds case when the point does not ask for it', () => {
    expect(isImageLabelMarkerCorrect('alveolus', { answers: ['Alveolus'], exact: false })).toBe(true)
  })

  it('holds a case difference against the student when the point asks for it', () => {
    expect(isImageLabelMarkerCorrect('alveolus', { answers: ['Alveolus'], exact: true })).toBe(false)
  })
})

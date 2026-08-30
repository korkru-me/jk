import { describe, it, expect } from 'vitest'
import {
  draftToEntry, changeType, applyFormPayload, validateForImport, liveWarnings, entryToPortable,
  type DraftEntry,
} from './to-question'
import type { DraftQuestion } from './draft'
import type { QuestionFormData } from '@/lib/actions/questions'

function draft(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    id: 'q-1',
    number: 1,
    type: 'mcq',
    title: 'คำถาม',
    html: '<p>คำถาม</p>',
    choices: [
      { id: 'c0', text: 'ก', isCorrect: false },
      { id: 'c1', text: 'ข', isCorrect: true },
    ],
    parts: [],
    imageRelIds: [],
    mentionsPicture: false,
    warnings: [],
    ...overrides,
  }
}

const entry = (overrides: Partial<DraftQuestion> = {}, urls = new Map<string, string>()) =>
  draftToEntry(draft(overrides), urls)

const withQuestion = (base: DraftEntry, patch: Partial<DraftEntry['question']>): DraftEntry =>
  ({ ...base, question: { ...base.question, ...patch } })

describe('draftToEntry', () => {
  it('builds a โจทย์ the authoring forms can open', () => {
    const built = entry().question
    expect(built.question_type).toBe('mcq')
    expect(built.title).toBe('คำถาม')
    expect(built.question_text).toBe('<p>คำถาม</p>')
    expect(built.mcq_options).toEqual([
      { text: 'ก', is_correct: false },
      { text: 'ข', is_correct: true },
    ])
  })

  it('starts every imported โจทย์ private, which is what the import stores', () => {
    expect(entry().question.visibility).toBe('private')
  })

  it('resolves pictures to the URLs they were uploaded to', () => {
    const urls = new Map([['rId4', 'https://example.test/a.png'], ['rId9', 'https://example.test/b.png']])
    expect(entry({ imageRelIds: ['rId4', 'rId9'] }, urls).question.image_urls)
      .toEqual(['https://example.test/a.png', 'https://example.test/b.png'])
  })

  it('drops a picture that never got uploaded rather than storing a dead reference', () => {
    const urls = new Map([['rId4', 'https://example.test/a.png']])
    expect(entry({ imageRelIds: ['rId4', 'rId-missing'] }, urls).question.image_urls)
      .toEqual(['https://example.test/a.png'])
  })

  it('writes sub-questions into the body of a บรรยาย, which has no parts of its own', () => {
    const built = entry({
      type: 'essay',
      choices: [],
      html: '<p>วางวัตถุบนพื้นเอียง</p>',
      parts: [
        { id: 'p0', label: 'ก', html: '<p>ถ้าพื้นลื่น</p>' },
        { id: 'p1', label: 'ข', html: '<p>ถ้าพื้นฝืด</p>' },
      ],
    }).question
    expect(built.question_text).toBe('<p>วางวัตถุบนพื้นเอียง</p><p>ก) ถ้าพื้นลื่น</p><p>ข) ถ้าพื้นฝืด</p>')
    expect(built.answer_parts).toBeNull()
  })

  it('keeps sub-questions apart for an อัตนัย, which grades each one', () => {
    const built = entry({
      type: 'written',
      choices: [],
      parts: [
        { id: 'p0', label: 'ก', html: '<p>ตอนหนึ่ง</p>' },
        { id: 'p1', label: 'ข', html: '<p>ตอนสอง</p>' },
      ],
    }).question
    expect(built.question_text).toBe('<p>คำถาม</p>')
    expect(built.answer_parts).toHaveLength(2)
    expect(built.answer_parts?.[1]).toMatchObject({ sub_text: '<p>ตอนสอง</p>', formula: '' })
  })
})

describe('changeType', () => {
  it('parks the choices when a ปรนัย is switched away, and restores them', () => {
    // A โจทย์ read as ปรนัย and switched by mistake should not lose the four
    // options that were read out of the file.
    const asEssay = changeType(entry(), 'essay')
    expect(asEssay.question.mcq_options).toBeNull()
    expect(asEssay.parkedOptions).toHaveLength(2)

    const backToMcq = changeType(asEssay, 'mcq')
    expect(backToMcq.question.mcq_options).toHaveLength(2)
    expect(backToMcq.question.mcq_options?.[1].is_correct).toBe(true)
  })

  it('clears answers that the new type would never grade', () => {
    const written = withQuestion(changeType(entry(), 'written'), {
      answer_formula: '9.8',
      answer_parts: [{ id: 'p', sub_text: '', formula: '9.8', unit: '', tolerance: 0.1 }],
      is_random: true,
    })
    const asEssay = changeType(written, 'essay')
    expect(asEssay.question.answer_formula).toBe('')
    expect(asEssay.question.answer_parts).toBeNull()
    expect(asEssay.question.is_random).toBe(false)
  })

  it('is a no-op for the type it already is', () => {
    const original = entry()
    expect(changeType(original, 'mcq')).toBe(original)
  })
})

describe('applyFormPayload', () => {
  const payload: QuestionFormData = {
    title: 'ชื่อใหม่',
    subject: 'ฟิสิกส์',
    question_text: '<p>เนื้อใหม่</p>',
    question_type: 'mcq',
    difficulty: 'hard',
    visibility: 'organization',
    category_id: '',
    grade_level: 'ม.4',
    is_random: false,
    variables: [],
    logic_rules: [],
    answer_parts: [],
    answer_formula: '',
    answer_unit: '',
    answer_tolerance: 0,
    mcq_options: [
      { text: 'ก', is_correct: true },
      { text: 'ข', is_correct: false },
    ],
    solution_text: '<p>วิธีทำ</p>',
    solution_image_urls: ['https://example.test/s.png'],
    tags: ['นิวตัน'],
    image_urls: ['https://example.test/a.png'],
  }

  it('takes what the teacher typed and marks the โจทย์ checked', () => {
    const updated = applyFormPayload(entry(), payload)
    expect(updated.reviewed).toBe(true)
    expect(updated.question.title).toBe('ชื่อใหม่')
    expect(updated.question.subject).toBe('ฟิสิกส์')
    expect(updated.question.grade_level).toBe('ม.4')
    expect(updated.question.difficulty).toBe('hard')
    expect(updated.question.tags).toEqual(['นิวตัน'])
    expect(updated.question.solution_text).toBe('<p>วิธีทำ</p>')
    expect(updated.question.image_urls).toEqual(['https://example.test/a.png'])
  })

  it('leaves a field the teacher cleared as null rather than an empty string', () => {
    const updated = applyFormPayload(entry(), { ...payload, subject: '', grade_level: '', tags: [] })
    expect(updated.question.subject).toBeNull()
    expect(updated.question.grade_level).toBeNull()
    expect(updated.question.tags).toBeNull()
  })

  it('ignores the visibility the form reports, because the import stores private', () => {
    // The forms hide their sharing controls in draft mode; this guards the
    // case where a payload carries a value anyway.
    expect(applyFormPayload(entry(), payload).question.visibility).toBe('private')
  })
})

describe('validateForImport', () => {
  it('accepts a complete ปรนัย', () => {
    expect(validateForImport(entry())).toBeNull()
  })

  it('refuses an mcq with nothing marked correct', () => {
    // Stored this way, every attempt freezes an empty correct answer and
    // every student is marked wrong without anyone being told.
    const broken = withQuestion(entry(), {
      mcq_options: [{ text: 'ก', is_correct: false }, { text: 'ข', is_correct: false }],
    })
    expect(validateForImport(broken)).toBe('ยังไม่ได้เลือกข้อที่ถูก')
  })

  it('refuses an mcq with fewer than two choices', () => {
    const broken = withQuestion(entry(), { mcq_options: [{ text: 'ก', is_correct: true }] })
    expect(validateForImport(broken)).toBe('ปรนัยต้องมีตัวเลือกอย่างน้อย 2 ข้อ')
  })

  it('accepts a picture-only choice, which carries no text by design', () => {
    const ok = withQuestion(entry(), {
      mcq_options: [
        { text: '', is_correct: true, image_url: 'https://example.test/a.png' },
        { text: 'ข', is_correct: false },
      ],
    })
    expect(validateForImport(ok)).toBeNull()
  })

  it('refuses an อัตนัย with no answer typed', () => {
    // evaluateFormula('') returns its failure text, which is then stored as
    // the correct answer for the attempt.
    const written = changeType(entry(), 'written')
    expect(validateForImport(written)).toContain('อัตนัย')
  })

  it('refuses an อัตนัย with one sub-question left unanswered', () => {
    const written = withQuestion(changeType(entry(), 'written'), {
      answer_parts: [
        { id: 'p0', sub_text: '<p>ก</p>', formula: '1', unit: '', tolerance: 0.1 },
        { id: 'p1', sub_text: '<p>ข</p>', formula: '', unit: '', tolerance: 0.1 },
      ],
    })
    expect(validateForImport(written)).toContain('อัตนัย')
  })

  it('accepts a บรรยาย with no answer, because the teacher marks it', () => {
    expect(validateForImport(changeType(entry(), 'essay'))).toBeNull()
  })

  it('refuses a โจทย์ with no title', () => {
    expect(validateForImport(withQuestion(entry(), { title: '  ' }))).toBe('ยังไม่มีชื่อโจทย์')
  })

  it('refuses an empty body, unless the โจทย์ is carried by its picture', () => {
    expect(validateForImport(withQuestion(entry(), { question_text: '<p></p>' }))).toBe('เนื้อโจทย์ว่าง')
    expect(validateForImport(withQuestion(entry(), {
      question_text: '<p></p>', image_urls: ['https://example.test/a.png'],
    }))).toBeNull()
  })
})

describe('liveWarnings — pictures', () => {
  const floating = new Set(['https://example.test/floating.png'])

  it('asks about a โจทย์ that talks about a picture it has not got', () => {
    const asked = { ...entry({ mentionsPicture: true }) }
    expect(liveWarnings(asked, floating).map((w: { code: string }) => w.code)).toEqual(['image-expected'])
  })

  it('goes quiet once the picture is moved onto that โจทย์', () => {
    // The point of recomputing rather than freezing: a notice that survives
    // the fix teaches the teacher to ignore the notices.
    const fixed = withQuestion(entry({ mentionsPicture: true }), {
      image_urls: ['https://example.test/floating.png'],
    })
    expect(liveWarnings(fixed, floating)).toEqual([])
  })

  it('asks about a floating picture on a โจทย์ that never mentions one', () => {
    const stray = withQuestion(entry(), { image_urls: ['https://example.test/floating.png'] })
    expect(liveWarnings(stray, floating).map((w: { code: string }) => w.code)).toEqual(['image-unreferenced'])
  })

  it('says nothing about an inline picture, which Word placed deliberately', () => {
    const inline = withQuestion(entry(), { image_urls: ['https://example.test/inline.png'] })
    expect(liveWarnings(inline, floating)).toEqual([])
  })
})

describe('entryToPortable', () => {
  it('hands the โจทย์ to the คลัง in its own import format', () => {
    const portable = entryToPortable(applyFormPayload(entry(), {
      title: 'ชื่อ', subject: 'ฟิสิกส์', question_text: '<p>เนื้อ</p>', question_type: 'mcq',
      difficulty: 'medium', visibility: 'private', category_id: '', grade_level: '',
      is_random: false, variables: [], logic_rules: [], answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [{ text: 'ก', is_correct: true }, { text: 'ข', is_correct: false }],
      solution_text: '', solution_image_urls: [], tags: ['นิวตัน'], image_urls: [],
    }), 'ฟิสิกส์')

    expect(portable.question_type).toBe('mcq')
    expect(portable.title).toBe('ชื่อ')
    // Stamped from the file-level field, not from whatever the โจทย์ carried.
    expect(portable.subject).toBe('ฟิสิกส์')
    expect(portable.tags).toEqual(['นิวตัน'])
    // Resolved server-side by name; a Word file names no category.
    expect(portable.category_name).toBeNull()
  })
})

describe('entryToPortable subject', () => {
  it('stamps the file-level วิชา over whatever the draft carried', () => {
    const stale = withQuestion(entry(), { subject: 'เคมี' })
    expect(entryToPortable(stale, 'ฟิสิกส์').subject).toBe('ฟิสิกส์')
  })

  it('stores a blank วิชา as null rather than an empty string', () => {
    expect(entryToPortable(entry(), '   ').subject).toBeNull()
  })
})

describe('liveWarnings — the answer key', () => {
  const none = new Set<string>()
  const codes = (base: DraftEntry) => liveWarnings(base, none).map((w: { code: string }) => w.code)

  it('asks for an answer while no choice is ticked', () => {
    const unmarked = withQuestion(entry(), {
      mcq_options: [{ text: 'ก', is_correct: false }, { text: 'ข', is_correct: false }],
    })
    expect(codes(unmarked)).toContain('no-correct-choice')
  })

  it('goes quiet the moment the teacher ticks one', () => {
    // Frozen at parse time this stayed on screen after the fix, which is how a
    // teacher learns to stop reading the warnings.
    expect(codes(entry())).not.toContain('no-correct-choice')
  })

  it('says which answer counts when several are ticked', () => {
    const many = withQuestion(entry(), {
      mcq_options: [{ text: 'ก', is_correct: true }, { text: 'ข', is_correct: true }],
    })
    expect(codes(many)).toContain('multiple-correct-choices')
  })

  it('says nothing about an answer key for a type that has none', () => {
    expect(codes(changeType(entry(), 'essay'))).toEqual([])
  })
})

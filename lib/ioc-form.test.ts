import { describe, expect, it } from 'vitest'
import {
  buildIocDocumentTitle,
  buildIocInstructionText,
  buildIocItemDrafts,
  checkIocItemsReady,
  emptyIocHeader,
  formatStandardLabel,
  normalizeIocHeader,
  validateIocHeader,
  type IocSourceQuestion,
} from '@/lib/ioc-form'

const HEADER = {
  ...emptyIocHeader(),
  exam_title: 'แบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2',
  subject_name: 'คณิตศาสตร์พื้นฐาน 6',
  subject_code: 'ค 33102',
  grade_level: 'มัธยมศึกษาปีที่ 6',
  school_name: 'โรงเรียนราชประชานุเคราะห์ 15',
  author_name: 'นางสาววัชราภรณ์ ต๊ะพรมมา',
}

function question(overrides: Partial<IocSourceQuestion> & { id: string }): IocSourceQuestion {
  return {
    question_text: '',
    mcq_options: null,
    image_urls: [],
    solution_text: null,
    group_id: null,
    order_in_group: null,
    ...overrides,
  }
}

describe('validateIocHeader', () => {
  it('requires only the exam title and the author', () => {
    expect(validateIocHeader(HEADER).valid).toBe(true)

    const bare = { ...emptyIocHeader(), exam_title: 'ข้อสอบกลางภาค', author_name: 'ครูสมชาย' }
    expect(validateIocHeader(bare).valid).toBe(true)
  })

  it('names the missing field in Thai', () => {
    const { valid, errors } = validateIocHeader(emptyIocHeader())
    expect(valid).toBe(false)
    expect(errors.exam_title).toBe('กรอกชื่อแบบทดสอบและช่วงสอบ')
    expect(errors.author_name).toBe('กรอกชื่อผู้ออกข้อสอบ')
  })

  it('rejects an academic year that is not four digits, but allows none', () => {
    expect(validateIocHeader({ ...HEADER, academic_year: '69' }).errors.academic_year)
      .toBe('ปีการศึกษาเป็นตัวเลข 4 หลัก เช่น 2569')
    expect(validateIocHeader({ ...HEADER, academic_year: '2569' }).valid).toBe(true)
    expect(validateIocHeader({ ...HEADER, academic_year: '' }).valid).toBe(true)
  })

  it('ignores the non-header fields a form payload carries alongside it', () => {
    // The create action hands the whole payload over — threshold is a number,
    // show_solutions a boolean — and reading every key it was given both
    // crashed on the first non-string and leaked them into the header.
    const payload = {
      ...HEADER,
      threshold: 0.5,
      show_solutions: false,
      classroom_id: null,
      instruction_text: 'คำชี้แจง',
    }
    const header = normalizeIocHeader(payload)
    expect(header.exam_title).toBe(HEADER.exam_title)
    expect(Object.keys(header).sort()).toEqual(Object.keys(emptyIocHeader()).sort())
    expect(validateIocHeader(payload).valid).toBe(true)
  })

  it('treats whitespace as empty rather than as a value', () => {
    expect(validateIocHeader({ ...HEADER, author_name: '   ' }).valid).toBe(false)
    expect(normalizeIocHeader({ ...HEADER, subject_code: '  ค   33102 ' }).subject_code).toBe('ค 33102')
  })
})

describe('buildIocDocumentTitle', () => {
  it('builds the three centred lines of the source document', () => {
    expect(buildIocDocumentTitle(HEADER)).toEqual([
      'การหาค่าความสอดคล้อง (IOC) ของมาตรฐานตัวชี้วัด/ผลการเรียนรู้ กับแบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2',
      'รายวิชาคณิตศาสตร์พื้นฐาน 6 รหัสวิชา ค 33102 ชั้นมัธยมศึกษาปีที่ 6',
      'โรงเรียนราชประชานุเคราะห์ 15',
    ])
  })

  it('prints no title at all while the exam has no name yet', () => {
    // The preview is on screen from the first keystroke, and a line ending on
    // a dangling "กับ" looks like a bug rather than an empty field.
    expect(buildIocDocumentTitle(emptyIocHeader())).toEqual([])
    const partial = buildIocDocumentTitle({ ...emptyIocHeader(), subject_code: 'ค 33102' })
    expect(partial).toEqual(['รหัสวิชา ค 33102'])
  })

  it('drops a line rather than printing an empty label', () => {
    const lines = buildIocDocumentTitle({
      ...emptyIocHeader(),
      exam_title: 'ข้อสอบปลายภาค',
      author_name: 'ครูสมชาย',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('ข้อสอบปลายภาค')
  })

  it('keeps a subject line that has only some of its parts', () => {
    const lines = buildIocDocumentTitle({ ...emptyIocHeader(), exam_title: 'ข้อสอบ', subject_code: 'ว 23102' })
    expect(lines[1]).toBe('รหัสวิชา ว 23102')
  })

  it('names the exam generically in the instruction until it has a title', () => {
    expect(buildIocInstructionText(emptyIocHeader())).toContain('แบบทดสอบฉบับนี้')
  })
})

describe('buildIocInstructionText', () => {
  it('names the exam the experts are being asked about', () => {
    const text = buildIocInstructionText(HEADER)
    expect(text).toContain('แบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2')
    expect(text).toContain('รายวิชาคณิตศาสตร์พื้นฐาน 6')
    expect(text).toContain('✓')
  })
})

describe('buildIocItemDrafts', () => {
  it('numbers items in the order given and labels the choices in Thai', () => {
    const drafts = buildIocItemDrafts([
      question({
        id: 'q1',
        question_text: 'ความถี่สะสมสัมพัทธ์ของอันตรภาคชั้น 100-199 มีค่าร้อยละเท่าใด',
        mcq_options: [
          { text: '4', is_correct: false },
          { text: '8', is_correct: true },
          { text: '12', is_correct: false },
          { text: '22', is_correct: false },
        ],
      }),
      question({ id: 'q2', question_text: 'นักเรียนมียอดเงินอยู่ในอันตรภาคชั้นใดมากที่สุด' }),
    ])

    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ order_index: 1, item_label: '1', source_question_id: 'q1' })
    expect(drafts[0].choices).toEqual(['ก. 4', 'ข. 8', 'ค. 12', 'ง. 22'])
    expect(drafts[1].item_label).toBe('2')
  })

  it('falls back to numbers past the fifth choice', () => {
    const drafts = buildIocItemDrafts([
      question({
        id: 'q1',
        question_text: 'โจทย์',
        mcq_options: Array.from({ length: 6 }, (_, index) => ({ text: `ตัวเลือก ${index}`, is_correct: false })),
      }),
    ])
    expect(drafts[0].choices[4]).toBe('จ. ตัวเลือก 4')
    expect(drafts[0].choices[5]).toBe('6. ตัวเลือก 5')
  })

  it('turns a group stem into the intro above its first question, not an item', () => {
    const drafts = buildIocItemDrafts([
      question({ id: 'stem', question_text: 'ตารางแจกแจงความถี่ … จงตอบคำถาม 2 ข้อ', group_id: 'g1', order_in_group: 0 }),
      question({ id: 'q1', question_text: 'ข้อแรกของกลุ่ม', group_id: 'g1', order_in_group: 1 }),
      question({ id: 'q2', question_text: 'ข้อที่สองของกลุ่ม', group_id: 'g1', order_in_group: 2 }),
    ])

    expect(drafts.map(draft => draft.source_question_id)).toEqual(['q1', 'q2'])
    expect(drafts[0].group_intro).toContain('ตารางแจกแจงความถี่')
    // Printed once, above the first question that shares it.
    expect(drafts[1].group_intro).toBe('')
    expect(drafts[0].item_label).toBe('1')
  })

  it('prints a section heading once, when the section changes', () => {
    const drafts = buildIocItemDrafts(
      [question({ id: 'q1', question_text: 'ก' }), question({ id: 'q2', question_text: 'ข' }), question({ id: 'q3', question_text: 'ค' })],
      {
        sectionTitleByQuestionId: {
          q1: 'ตอนที่ 1 ข้อสอบปรนัย 4 ตัวเลือก',
          q2: 'ตอนที่ 1 ข้อสอบปรนัย 4 ตัวเลือก',
          q3: 'ตอนที่ 2 ข้อสอบอัตนัย',
        },
      },
    )

    expect(drafts[0].section_label).toBe('ตอนที่ 1 ข้อสอบปรนัย 4 ตัวเลือก')
    expect(drafts[1].section_label).toBe('')
    expect(drafts[2].section_label).toBe('ตอนที่ 2 ข้อสอบอัตนัย')
  })

  it('can continue the printed numbering from where another form stopped', () => {
    const drafts = buildIocItemDrafts(
      [question({ id: 'q1', question_text: 'ก' }), question({ id: 'q2', question_text: 'ข' })],
      { startNumber: 12 },
    )
    expect(drafts.map(draft => draft.item_label)).toEqual(['12', '13'])
    expect(drafts.map(draft => draft.order_index)).toEqual([1, 2])
  })

  it('carries the solution across but leaves showing it to the form', () => {
    const drafts = buildIocItemDrafts([
      question({ id: 'q1', question_text: 'โจทย์', solution_text: 'แนวคำตอบ' }),
    ])
    expect(drafts[0].solution).toBe('แนวคำตอบ')
  })
})

describe('checkIocItemsReady', () => {
  it('lists the printed numbers of items with no indicator', () => {
    const result = checkIocItemsReady([
      { item_label: '1', standard_id: 'std-1' },
      { item_label: '2', standard_id: null },
      { item_label: '11', standard_id: null },
    ])
    expect(result.ready).toBe(false)
    expect(result.missingLabels).toEqual(['2', '11'])
  })

  it('is not ready when the form has no items at all', () => {
    expect(checkIocItemsReady([])).toEqual({ ready: false, missingLabels: [] })
  })

  it('is ready when every item is matched', () => {
    expect(checkIocItemsReady([{ item_label: '1', standard_id: 'std-1' }]).ready).toBe(true)
  })
})

describe('formatStandardLabel', () => {
  it('shows the code alone in a picker and both parts when asked', () => {
    const standard = { code: 'ค 3.1 ม.6/1', description: 'เข้าใจและใช้ความรู้ทางสถิติ' }
    expect(formatStandardLabel(standard)).toBe('ค 3.1 ม.6/1')
    expect(formatStandardLabel(standard, { withDescription: true }))
      .toBe('ค 3.1 ม.6/1 — เข้าใจและใช้ความรู้ทางสถิติ')
  })

  it('falls back to the description for a school-written outcome with no code', () => {
    const outcome = { code: '', description: 'อธิบายผลของการเปลี่ยนแปลงทางเคมี' }
    expect(formatStandardLabel(outcome)).toBe('อธิบายผลของการเปลี่ยนแปลงทางเคมี')
    expect(formatStandardLabel(outcome, { withDescription: true })).toBe('อธิบายผลของการเปลี่ยนแปลงทางเคมี')
  })
})

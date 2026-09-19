import { describe, expect, it } from 'vitest'
import { toSafeExamAnswer } from './exam-safe'

function rawAnswer(questionType: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'answer-1',
    question_id: 'question-1',
    random_values: { x: 4 },
    correct_answer: 'TOP_LEVEL_SECRET',
    is_correct: true,
    score: 99,
    max_score: 99,
    student_answer: 'saved answer',
    work_images: null,
    option_order: null,
    questions: {
      title: 'โจทย์ทดสอบ',
      question_text: 'ข้อความโจทย์',
      question_type: questionType,
      answer_unit: 'm',
      answer_formula: 'QUESTION_FORMULA_SECRET',
      solution_text: 'SOLUTION_SECRET',
      mcq_options: null,
      variables: [{
        name: 'x', unit: 'm', type: 'value', min: 1, max: 10,
        formula: 'VARIABLE_FORMULA_SECRET', values: [4],
      }],
      answer_parts: [{
        id: 'part-1', sub_text: 'หาค่า', unit: 'm', tolerance: 0.01,
        formula: 'PART_FORMULA_SECRET', equation_text: 'EQUATION_SECRET',
      }],
      extra_data: {},
      image_urls: null,
      ...overrides,
    },
  } as unknown as Parameters<typeof toSafeExamAnswer>[0]
}

function serializedSafe(questionType: string, overrides: Record<string, unknown> = {}) {
  const safe = toSafeExamAnswer(rawAnswer(questionType, overrides), () => 0)
  expect(safe).not.toBeNull()
  return { safe: safe!, json: JSON.stringify(safe) }
}

describe('toSafeExamAnswer', () => {
  // The matching layout is presentation, not an answer, so it has to survive
  // the sanitiser — a question saved as โยงเส้น that reaches the exam without
  // answer_mode silently falls back to the drag-into-slots layout instead.
  it('carries the matching layout through, and defaults to slots', () => {
    const lines = serializedSafe('matching', {
      extra_data: { answer_mode: 'lines' },
      mcq_options: [{ left_text: 'แรง', right_text: 'นิวตัน' }, { left_text: 'งาน', right_text: 'จูล' }],
    })
    expect(lines.safe.questions.extra_data).toEqual({ answer_mode: 'lines' })

    const slots = serializedSafe('matching', {
      extra_data: {},
      mcq_options: [{ left_text: 'แรง', right_text: 'นิวตัน' }, { left_text: 'งาน', right_text: 'จูล' }],
    })
    expect(slots.safe.questions.extra_data).toEqual({})
  })

  it('does not let an unknown matching mode through', () => {
    const { safe } = serializedSafe('matching', {
      extra_data: { answer_mode: 'something-else', secret: 'LEAK' },
      mcq_options: [{ left_text: 'แรง', right_text: 'นิวตัน' }],
    })
    expect(safe.questions.extra_data).toEqual({})
  })

  it('uses an explicit allowlist for answer rows, variables and numeric answer parts', () => {
    const { safe, json } = serializedSafe('written')

    expect(safe).toMatchObject({
      id: 'answer-1',
      question_id: 'question-1',
      student_answer: 'saved answer',
      questions: {
        variables: [{ name: 'x', unit: 'm', type: 'value' }],
        answer_parts: [{ id: 'part-1', sub_text: 'หาค่า', unit: 'm' }],
      },
    })
    for (const secret of [
      'TOP_LEVEL_SECRET', 'QUESTION_FORMULA_SECRET', 'SOLUTION_SECRET',
      'VARIABLE_FORMULA_SECRET', 'PART_FORMULA_SECRET', 'EQUATION_SECRET',
    ]) {
      expect(json).not.toContain(secret)
    }
    expect(json).not.toContain('correct_answer')
    expect(json).not.toContain('is_correct')
    expect(json).not.toContain('max_score')
  })

  it('passes only valid DEG/RAD metadata to the in-progress client', () => {
    const row = rawAnswer('written') as any
    row.math_input_modes = { main: 'rad', 'part:part-1': 'deg' }
    expect(toSafeExamAnswer(row)?.math_input_modes).toEqual({ main: 'rad', 'part:part-1': 'deg' })

    row.math_input_modes = { main: 'not-a-mode' }
    expect(toSafeExamAnswer(row)?.math_input_modes).toEqual({})
  })

  it('strips correct flags from MCQ and splits matching pairs into separate columns', () => {
    const mcq = serializedSafe('mcq', {
      mcq_options: [
        { text: 'ตัวลวง', is_correct: false },
        { text: 'MCQ_SECRET', is_correct: true },
      ],
    }).safe
    expect(mcq.questions.mcq_options).toEqual([
      { text: 'ตัวลวง', image_url: undefined, index: 0 },
      { text: 'MCQ_SECRET', image_url: undefined, index: 1 },
    ])
    expect(JSON.stringify(mcq)).not.toContain('is_correct')

    const matching = serializedSafe('matching', {
      mcq_options: [
        { left_text: 'แรง', right_text: 'นิวตัน' },
        { left_text: 'งาน', right_text: 'จูล' },
      ],
      answer_parts: null,
    }).safe
    expect(matching.questions.mcq_options).toEqual([
      { left_text: 'แรง', left_image: undefined },
      { left_text: 'งาน', left_image: undefined },
    ])
    expect(matching.questions.matching_options).toEqual([
      { right_text: 'นิวตัน', right_image: undefined },
      { right_text: 'จูล', right_image: undefined },
    ])
  })

  it('offers the จับคู่ distractors as ordinary choices, and never says which they are', () => {
    // A ตัวเลือกลวง only works while it looks like every other choice. It has
    // to reach the student (or the โจทย์ is easier than the paper it came
    // from) while `extra_data` must not carry the list that names them.
    const { safe, json } = serializedSafe('matching', {
      mcq_options: [
        { left_text: 'แรง', right_text: 'นิวตัน' },
        { left_text: 'งาน', right_text: 'จูล' },
      ],
      extra_data: { answer_mode: 'slots', distractors: [{ text: 'วัตต์' }, { text: 'โอห์ม' }] },
      answer_parts: null,
    })

    expect(safe.questions.matching_options?.map(option => option.right_text))
      .toEqual(['นิวตัน', 'จูล', 'วัตต์', 'โอห์ม'])
    // 'slots' is the default, so the sanitizer says nothing at all — and what
    // it says nothing about includes which choices were decoys.
    expect(safe.questions.extra_data).toEqual({})
    expect(json).not.toContain('distractors')
  })

  it('reads the shuffled order against the choices, distractors included', () => {
    const row = rawAnswer('matching', {
      mcq_options: [
        { left_text: 'แรง', right_text: 'นิวตัน' },
        { left_text: 'งาน', right_text: 'จูล' },
      ],
      extra_data: { answer_mode: 'slots', distractors: [{ text: 'วัตต์' }] },
      answer_parts: null,
    }) as unknown as { option_order: number[] }
    row.option_order = [2, 0, 1]

    const safe = toSafeExamAnswer(row as unknown as Parameters<typeof toSafeExamAnswer>[0], () => 0)
    expect(safe?.questions.matching_options?.map(option => option.right_text))
      .toEqual(['วัตต์', 'นิวตัน', 'จูล'])
    // The prompts are never shuffled — only the column the student picks from.
    expect(safe?.questions.mcq_options).toEqual([
      { left_text: 'แรง', left_image: undefined },
      { left_text: 'งาน', left_image: undefined },
    ])
  })

  it('carries the ถูก-ผิด lead-in to the student, without its answers', () => {
    // The situation the statements are judged against is the โจทย์, not the
    // key: a student who cannot read "โดยไม่คิดแรงต้านอากาศ" is answering a
    // different question from the one the teacher set.
    const tf = serializedSafe('true_false', {
      extra_data: {
        prompt: '<p>พิจารณาการปล่อยวัตถุในแนวดิ่ง โดยไม่คิดแรงต้านอากาศ</p>',
        correct_answer: true,
        explanation_mode: 'none',
        score_answer: 0.25,
        score_explanation: 0,
        statements: [{ id: 's1', text: 'ข้อความ', correct_answer: false }],
      },
    })

    expect(tf.safe.questions.extra_data).toMatchObject({
      prompt: '<p>พิจารณาการปล่อยวัตถุในแนวดิ่ง โดยไม่คิดแรงต้านอากาศ</p>',
    })
    expect(tf.json).not.toContain('correct_answer')
  })

  it('leaves a ถูก-ผิด โจทย์ without a lead-in exactly as it was', () => {
    const tf = serializedSafe('true_false', {
      extra_data: {
        correct_answer: true,
        explanation_mode: 'none',
        score_answer: 1,
        score_explanation: 0,
      },
    })

    expect(tf.json).not.toContain('prompt')
  })

  it('removes nested true/false and fill-blank answer keys', () => {
    const tf = serializedSafe('true_false', {
      extra_data: {
        correct_answer: true,
        explanation_mode: 'always',
        score_answer: 1,
        score_explanation: 1,
        statements: [{ id: 's1', text: 'ข้อความ', correct_answer: false }],
      },
    })
    expect(tf.safe.questions.extra_data).toMatchObject({
      statements: [{ id: 's1', text: 'ข้อความ' }],
    })
    expect(tf.json).not.toContain('correct_answer')

    const fill = serializedSafe('fill_blank', {
      extra_data: {
        blanks: [{
          id: 1,
          type: 'dropdown',
          answer: 'BLANK_SECRET',
          answers: ['BLANK_SECRET'],
          case_sensitive: false,
          options: ['ก', 'ข'],
        }],
      },
    })
    expect(fill.safe.questions.extra_data).toMatchObject({
      blanks: [{ id: 1, type: 'dropdown', case_sensitive: false, options: ['ก', 'ข'] }],
    })
    expect(fill.json).not.toContain('BLANK_SECRET')
  })

  it('hands a ตารางจำแนก to the student with no cell key in it', () => {
    // Unlike ปรนัย, where the key is an is_correct flag beside an option, a
    // classify question keeps its entire key inside the rows. If answers
    // survived the sanitiser the student would receive the finished worksheet.
    const classify = serializedSafe('classify', {
      extra_data: {
        columns: [
          { id: 'origin', title: 'จำแนกตามแหล่งกำเนิด', options: ['พอลิเมอร์ธรรมชาติ', 'พอลิเมอร์สังเคราะห์'] },
          { id: 'monomer', title: 'จำแนกตามชนิดของมอนอเมอร์', options: ['โฮโมพอลิเมอร์', 'โคพอลิเมอร์'] },
        ],
        rows: [
          { id: 'r1', text: 'เนื้อหมู', image_urls: ['https://example.test/pork.png'], answers: { origin: 0, monomer: 1 } },
          { id: 'r2', text: 'ยางรัดของ', answers: { origin: 1, monomer: 0 }, CLASSIFY_ROW_SECRET: 'leak' },
        ],
        row_label_style: 'number',
        CLASSIFY_CONFIG_SECRET: 'leak',
      },
    })

    expect(classify.json).not.toContain('answers')
    expect(classify.json).not.toContain('CLASSIFY_ROW_SECRET')
    expect(classify.json).not.toContain('CLASSIFY_CONFIG_SECRET')

    const config = classify.safe.questions.extra_data as {
      columns: Array<{ id: string; title: string; options: string[] }>
      rows: Array<Record<string, unknown>>
      row_label_style?: string
    }
    // Everything the student needs to answer still arrives, in the order the
    // frozen key was built from — a shuffle here would misalign every cell.
    expect(config.columns.map(column => column.id)).toEqual(['origin', 'monomer'])
    expect(config.columns[1].options).toEqual(['โฮโมพอลิเมอร์', 'โคพอลิเมอร์'])
    expect(config.rows.map(row => row.text)).toEqual(['เนื้อหมู', 'ยางรัดของ'])
    expect(config.rows[0].image_urls).toEqual(['https://example.test/pork.png'])
    expect(config.row_label_style).toBe('number')
    for (const row of config.rows) expect(Object.keys(row)).not.toContain('answers')
  })

  it('keeps a malformed ตารางจำแนก from reaching the browser as junk', () => {
    const classify = serializedSafe('classify', {
      extra_data: {
        columns: [{ id: 7, title: null, options: 'not-an-array' }, 'not-an-object'],
        rows: 'not-an-array',
      },
    })
    const config = classify.safe.questions.extra_data as {
      columns: Array<{ id: string; title: string; options: string[] }>
      rows: unknown[]
    }
    expect(config.columns).toEqual([
      { id: '', title: '', options: [] },
      { id: '', title: '', options: [] },
    ])
    expect(config.rows).toEqual([])
  })

  it('hands a ใบงานติดป้ายบนรูป to the student with no answer key in it', () => {
    // Two different leaks in one type. `answers` is the key outright. `label`
    // is the teacher's private name for a point, and a teacher naming the point
    // over the trachea names it "หลอดลม" — the answer under a field name that
    // does not admit to being one.
    const labelled = serializedSafe('image_label', {
      extra_data: {
        image_url: 'https://example.test/breathing.png',
        answer_mode: 'drag',
        bank: ['จมูก', 'ปอด', 'กระบังลม'],
        markers: [
          {
            id: 'm1', label: 'MARKER_LABEL_SECRET',
            point: { x: 30, y: 12 }, box: { x: 4, y: 10 },
            answers: ['IMAGE_ANSWER_SECRET'], case_sensitive: true,
          },
          {
            id: 'm2', point: { x: 33, y: 60 },
            answers: ['ปอด'], case_sensitive: false,
            MARKER_EXTRA_SECRET: 'leak',
          },
        ],
        IMAGE_CONFIG_SECRET: 'leak',
      },
    })

    expect(labelled.json).not.toContain('MARKER_LABEL_SECRET')
    expect(labelled.json).not.toContain('IMAGE_ANSWER_SECRET')
    expect(labelled.json).not.toContain('MARKER_EXTRA_SECRET')
    expect(labelled.json).not.toContain('IMAGE_CONFIG_SECRET')
    expect(labelled.json).not.toContain('case_sensitive')

    const config = labelled.safe.questions.extra_data as {
      image_url: string
      answer_mode: string
      bank?: string[]
      markers: Array<Record<string, unknown>>
    }
    // Everything the student needs to answer still arrives, in the order the
    // frozen key was built from — a shuffle here would misalign every point.
    expect(config.image_url).toBe('https://example.test/breathing.png')
    expect(config.answer_mode).toBe('drag')
    expect(config.bank).toEqual(['จมูก', 'ปอด', 'กระบังลม'])
    expect(config.markers.map(marker => marker.id)).toEqual(['m1', 'm2'])
    expect(config.markers[0].point).toEqual({ x: 30, y: 12 })
    expect(config.markers[0].box).toEqual({ x: 4, y: 10 })
    expect(config.markers[1].box).toBeUndefined()
    for (const marker of config.markers) {
      expect(Object.keys(marker)).not.toContain('answers')
      expect(Object.keys(marker)).not.toContain('label')
    }
  })

  it('never hands the word bank to a question that asks the student to write the words', () => {
    // The same array is the thing you drag from in one mode and the whole
    // answer vocabulary in another. A teacher who builds a drag question and
    // then switches it to พิมพ์เอง leaves the bank behind in extra_data.
    const typed = serializedSafe('image_label', {
      extra_data: {
        image_url: 'https://example.test/x.png',
        answer_mode: 'typed',
        bank: ['BANK_WORD_SECRET', 'ปอด'],
        markers: [{ id: 'm1', point: { x: 10, y: 10 }, answers: ['ปอด'], case_sensitive: false }],
      },
    })
    expect(typed.json).not.toContain('BANK_WORD_SECRET')
    expect((typed.safe.questions.extra_data as { bank?: string[] }).bank).toBeUndefined()
  })

  it('gives a dropdown its bank only where a point actually falls back to it', () => {
    const base = {
      image_url: 'https://example.test/x.png',
      answer_mode: 'dropdown',
      bank: ['BANK_WORD_SECRET', 'ปอด'],
    }

    // Every point brought its own list, so nothing renders the bank; shipping
    // it would be answer vocabulary for no one.
    const selfSufficient = serializedSafe('image_label', {
      extra_data: {
        ...base,
        markers: [{ id: 'm1', point: { x: 10, y: 10 }, options: ['หัวใจ', 'ตับ'], answers: ['ตับ'], case_sensitive: false }],
      },
    })
    expect(selfSufficient.json).not.toContain('BANK_WORD_SECRET')
    expect((selfSufficient.safe.questions.extra_data as { bank?: string[] }).bank).toBeUndefined()

    // One point has no list of its own, so the bank is what it offers.
    const fallsBack = serializedSafe('image_label', {
      extra_data: {
        ...base,
        markers: [
          { id: 'm1', point: { x: 10, y: 10 }, options: ['หัวใจ', 'ตับ'], answers: ['ตับ'], case_sensitive: false },
          { id: 'm2', point: { x: 20, y: 20 }, answers: ['ปอด'], case_sensitive: false },
        ],
      },
    })
    const config = fallsBack.safe.questions.extra_data as { bank?: string[]; markers: Array<Record<string, unknown>> }
    expect(config.bank).toEqual(['BANK_WORD_SECRET', 'ปอด'])
    expect(config.markers[0].options).toEqual(['หัวใจ', 'ตับ'])
    expect(config.markers[1].options).toBeUndefined()
  })

  it('strips a point option list from a mode that shows no lists', () => {
    // A leftover two-item list on a typed question narrows writing an answer
    // down to a coin flip for anyone who reads the payload.
    for (const answer_mode of ['typed', 'drag']) {
      const stale = serializedSafe('image_label', {
        extra_data: {
          image_url: 'https://example.test/x.png',
          answer_mode,
          bank: ['ปอด', 'ตับ'],
          markers: [{
            id: 'm1', point: { x: 10, y: 10 },
            options: ['STALE_OPTION_SECRET', 'ปอด'],
            answers: ['ปอด'], case_sensitive: false,
          }],
        },
      })
      expect(stale.json).not.toContain('STALE_OPTION_SECRET')
    }
  })

  it('keeps a point the teacher never keyed, rather than sliding the rest along', () => {
    // The student's answer is one string per point in the points' own order.
    // Dropping the unkeyed one here would grade every later answer against the
    // wrong point.
    const partial = serializedSafe('image_label', {
      extra_data: {
        image_url: 'https://example.test/x.png',
        answer_mode: 'typed',
        markers: [
          { id: 'm1', point: { x: 10, y: 10 }, answers: [], case_sensitive: false },
          { id: 'm2', point: { x: 20, y: 20 }, answers: ['ปอด'], case_sensitive: false },
        ],
      },
    })
    expect((partial.safe.questions.extra_data as { markers: unknown[] }).markers).toHaveLength(2)
  })

  it('keeps a malformed ใบงานติดป้ายบนรูป from reaching the browser as junk', () => {
    const junk = serializedSafe('image_label', {
      extra_data: {
        image_url: 42,
        answer_mode: 'lasso',
        bank: 'not-an-array',
        markers: [
          { id: 7, point: 'not-a-point', box: { x: 'a', y: 2 } },
          'not-an-object',
          // Outside the picture: a box drawn at 140% is one the student cannot
          // reach. Imports and older forms can both produce it.
          { id: 'm3', point: { x: 140, y: -20 } },
        ],
      },
    })
    const config = junk.safe.questions.extra_data as {
      image_url: string
      answer_mode: string
      bank?: string[]
      markers: Array<Record<string, unknown>>
    }
    expect(config.image_url).toBe('')
    // An unreadable mode reads as typed — the same fallback lib/image-label.ts
    // keys by, so the student is never offered a list the grader ignores.
    expect(config.answer_mode).toBe('typed')
    expect(config.bank).toBeUndefined()
    expect(config.markers).toEqual([
      { id: '', point: { x: 50, y: 50 } },
      { id: '', point: { x: 50, y: 50 } },
      { id: 'm3', point: { x: 100, y: 0 } },
    ])
  })

  it('shuffles ordering prompts and strips every composite answer key', () => {
    const ordering = serializedSafe('ordering', {
      extra_data: {
        items: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ],
      },
    }).safe
    expect(ordering.questions.extra_data).toMatchObject({
      items: [{ id: 'b' }, { id: 'c' }, { id: 'a' }],
    })

    const composite = serializedSafe('composite', {
      extra_data: {
        parts: [
          { id: 'tf', type: 'true_false', text: 'TF', score: 1, correct_answer: true },
          {
            id: 'group', type: 'true_false', text: 'Group', score: 1,
            choices: [{ id: 'choice', text: 'Choice', correct_answer: true }],
          },
          {
            id: 'blank', type: 'fill_blank', text: '[คำตอบ]', score: 1,
            blanks: [{ id: 1, type: 'fixed', answer: 'COMP_BLANK_SECRET', answers: ['COMP_BLANK_SECRET'] }],
          },
          {
            id: 'mcq', type: 'mcq', text: 'MCQ', score: 1,
            options: [{ text: 'Option', is_correct: true }],
          },
        ],
      },
    })
    expect(composite.json).not.toContain('correct_answer')
    expect(composite.json).not.toContain('is_correct')
    expect(composite.json).not.toContain('COMP_BLANK_SECRET')
  })
})

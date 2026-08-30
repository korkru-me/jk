import { describe, it, expect } from 'vitest'
import {
  buildExportFile, exportFileBatches, parseExportFile, IMPORT_BATCH_SIZE,
  type PortableQuestion,
} from './question-portable'

function question(title: string): PortableQuestion {
  return {
    question_type: 'essay',
    title,
    question_text: `<p>${title}</p>`,
    difficulty: 'medium',
    grade_level: null,
    subject: null,
    category_name: null,
    is_random: false,
    variables: [],
    logic_rules: [],
    answer_formula: '',
    answer_unit: null,
    answer_tolerance: 0,
    answer_parts: null,
    mcq_options: null,
    extra_data: {},
    solution_text: null,
    solution_image_urls: [],
    tags: null,
    image_urls: [],
    requires_work_image: false,
  }
}

const many = (count: number) => Array.from({ length: count }, (_, i) => question(`ข้อ ${i + 1}`))

describe('exportFileBatches', () => {
  it('keeps a small file in one piece', () => {
    const batches = exportFileBatches(buildExportFile(many(3)))
    expect(batches).toHaveLength(1)
  })

  it('splits a large file into batches that each parse on their own', () => {
    const batches = exportFileBatches(buildExportFile(many(IMPORT_BATCH_SIZE * 2 + 7)))
    expect(batches).toHaveLength(3)

    for (const batch of batches) {
      const parsed = parseExportFile(batch)
      expect('error' in parsed).toBe(false)
    }
  })

  it('covers every โจทย์ exactly once, in order', () => {
    const total = IMPORT_BATCH_SIZE + 5
    const batches = exportFileBatches(buildExportFile(many(total)))
    const titles = batches.flatMap(batch => {
      const parsed = parseExportFile(batch)
      return 'error' in parsed ? [] : parsed.data.questions.map(q => q.title)
    })
    expect(titles).toEqual(many(total).map(q => q.title))
  })

  it('puts the แฟ้ม descriptor on the last batch only', () => {
    // The แฟ้ม lists the โจทย์ under it, so it can only be created once every
    // one of them has been inserted.
    const file = buildExportFile(many(IMPORT_BATCH_SIZE + 1), { title: 'แฟ้ม', description: null, tags: [] })
    const kinds = exportFileBatches(file).map(batch => {
      const parsed = parseExportFile(batch)
      return 'error' in parsed ? 'error' : parsed.data.kind
    })
    expect(kinds).toEqual(['questions', 'question_set'])
  })

  it('returns nothing for a file with no โจทย์ in it', () => {
    expect(exportFileBatches(buildExportFile([]))).toEqual([])
  })
})

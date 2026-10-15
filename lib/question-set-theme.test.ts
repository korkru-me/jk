import { describe, expect, it } from 'vitest'
import { buildExportFile, exportFileBatches, parseExportFile, type PortableQuestion } from './question-portable'
import {
  composeQuestionSetDescription, isQuestionSetTheme, parseQuestionSetDescription,
  questionSetTheme, QUESTION_SET_THEMES, randomQuestionSetTheme,
} from './question-set-theme'

describe('question set theme persistence', () => {
  it('keeps legacy descriptions, JSON-like text and null readable', () => {
    for (const description of ['คำอธิบายเดิม\nบรรทัดที่สอง', '{"theme":"red"}', '[korkru:set-theme:v1:invalid]\nข้อความ']) {
      expect(parseQuestionSetDescription(description)).toEqual({ description })
    }
    expect(parseQuestionSetDescription(null)).toEqual({ description: '' })
  })

  it('round-trips every colour without losing multiline Thai descriptions', () => {
    for (const theme of QUESTION_SET_THEMES) {
      const stored = composeQuestionSetDescription('คำอธิบาย\nบรรทัดที่สอง', theme)
      expect(parseQuestionSetDescription(stored)).toEqual({ theme, description: 'คำอธิบาย\nบรรทัดที่สอง' })
      expect(composeQuestionSetDescription(stored, theme)).toBe(stored)
      expect(questionSetTheme('other-id', stored)).toBe(theme)
    }
  })

  it('keeps empty descriptions and colour-only edits', () => {
    expect(parseQuestionSetDescription(composeQuestionSetDescription('', 'mint'))).toEqual({ description: '', theme: 'mint' })
    expect(parseQuestionSetDescription(composeQuestionSetDescription(composeQuestionSetDescription('เนื้อหาเดิม', 'red'), 'blue'))).toEqual({ description: 'เนื้อหาเดิม', theme: 'blue' })
  })

  it('varies old folders while keeping their colour stable across reads', () => {
    const themes = Array.from({ length: 30 }, (_, i) => questionSetTheme(`legacy-${i}`))
    expect(new Set(themes).size).toBeGreaterThan(5)
    expect(questionSetTheme('same-id')).toBe(questionSetTheme('same-id'))
    expect(isQuestionSetTheme('bg-red-500')).toBe(false)
  })

  it('samples the full palette and clamps boundaries', () => {
    expect(QUESTION_SET_THEMES.map((_, i) => randomQuestionSetTheme(() => (i + 0.5) / QUESTION_SET_THEMES.length))).toEqual([...QUESTION_SET_THEMES])
    expect(randomQuestionSetTheme(() => 0)).toBe('blue')
    expect(randomQuestionSetTheme(() => 1)).toBe('slate')
  })

  it('preserves the colour through the existing portable file and batch format', () => {
    const question: PortableQuestion = {
      question_type: 'essay', title: 'ข้อทดสอบ', question_text: '<p>ทดสอบ</p>', difficulty: 'medium',
      grade_level: null, subject: null, category_name: null, is_random: false, variables: [], logic_rules: [],
      answer_formula: '', answer_unit: null, answer_tolerance: 0, answer_parts: null, mcq_options: null,
      extra_data: {}, solution_text: null, solution_image_urls: [], tags: null, image_urls: [], requires_work_image: false,
    }
    const description = composeQuestionSetDescription('', 'orange')
    const batches = exportFileBatches(buildExportFile([question], { title: 'แฟ้มสีส้ม', description, tags: [] }))
    const parsed = parseExportFile(batches[0])
    expect(parsed).toHaveProperty('data')
    if ('data' in parsed) expect(parseQuestionSetDescription(parsed.data.set?.description)).toEqual({ description: '', theme: 'orange' })
  })
})

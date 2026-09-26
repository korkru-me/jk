import { describe, expect, it } from 'vitest'
import {
  buildQuestionSolution,
  hasSolution,
  hasSolutionText,
  type SolutionStepRow,
} from '@/lib/question-solution'

const FILE = 'https://project.supabase.co/storage/v1/object/public/question-images/user-1/solution_1_abc.webp'

describe('question solution', () => {
  it('counts typed text only when a reader would see something', () => {
    expect(hasSolutionText(null)).toBe(false)
    expect(hasSolutionText('')).toBe(false)
    // A box typed into and cleared again, as the editor hands it back.
    expect(hasSolutionText('<p></p><p></p>')).toBe(false)
    expect(hasSolutionText('<p>&nbsp; </p>')).toBe(false)
    expect(hasSolutionText('<p>F = ma</p>')).toBe(true)
    expect(hasSolutionText('แทนค่า v = u + at')).toBe(true)
    expect(hasSolutionText(String.raw`\(x^2\)`)).toBe(true)
    // A picture placed in the text with no words around it is still a เฉลย.
    expect(hasSolutionText(`<p><img src="${FILE}"></p>`)).toBe(true)
  })

  it('finds a เฉลย in either column', () => {
    expect(hasSolution({ solution_text: null, solution_image_urls: [] })).toBe(false)
    expect(hasSolution({ solution_text: '<p></p>', solution_image_urls: null })).toBe(false)
    expect(hasSolution({ solution_text: '<p>ข้อ ก</p>', solution_image_urls: [] })).toBe(true)
    expect(hasSolution({ solution_text: null, solution_image_urls: [FILE] })).toBe(true)
  })

  it('shows a single โจทย์ as its own row, even when the เฉลย is gone', () => {
    expect(buildQuestionSolution(
      { id: 'q1', title: 'แรงลัพธ์', solution_text: '<p>ใช้ F = ma</p>', solution_image_urls: [FILE] },
      [],
    )).toEqual({
      title: 'แรงลัพธ์',
      parts: [{ id: 'q1', label: null, excerpt: null, text: '<p>ใช้ F = ma</p>', files: [FILE] }],
    })

    // Deleted between the page loading and the click: one empty part, which
    // the dialog reads as "ยังไม่ได้แนบเฉลย" rather than an empty window.
    expect(buildQuestionSolution(
      { id: 'q1', title: 'แรงลัพธ์', solution_text: '<p></p>', solution_image_urls: null },
      [],
    ).parts).toEqual([{ id: 'q1', label: null, excerpt: null, text: null, files: [] }])
  })

  it('lists every step of a โจทย์หลายขั้นตอน in order, with or without a เฉลย', () => {
    const steps: SolutionStepRow[] = [
      { id: 's2', order_in_group: 2, question_text: '<p>หา<b>ความเร่ง</b></p>', solution_text: null, solution_image_urls: [] },
      { id: 's1', order_in_group: 1, question_text: '<p>หาแรงลัพธ์</p>', solution_text: '<p>รวมแรง</p>', solution_image_urls: [] },
      { id: 's3', order_in_group: 3, question_text: '', solution_text: null, solution_image_urls: [FILE] },
    ]
    const solution = buildQuestionSolution(
      { id: 'parent', title: 'รถลากกล่อง', solution_text: null, solution_image_urls: [] },
      steps,
    )

    // The listed row holds only the shared context, so it takes no block.
    expect(solution.parts).toEqual([
      { id: 's1', label: 'ข้อย่อยที่ 1', excerpt: 'หาแรงลัพธ์', text: '<p>รวมแรง</p>', files: [] },
      { id: 's2', label: 'ข้อย่อยที่ 2', excerpt: 'หา ความเร่ง', text: null, files: [] },
      { id: 's3', label: 'ข้อย่อยที่ 3', excerpt: null, text: null, files: [FILE] },
    ])
  })

  it('keeps a เฉลย an older group row carries on itself', () => {
    const solution = buildQuestionSolution(
      { id: 'parent', title: 'รถลากกล่อง', solution_text: '<p>ภาพรวม</p>', solution_image_urls: [] },
      [{ id: 's1', order_in_group: 1, question_text: 'หาแรง', solution_text: null, solution_image_urls: [] }],
    )
    expect(solution.parts.map(part => part.label)).toEqual([null, 'ข้อย่อยที่ 1'])
  })
})

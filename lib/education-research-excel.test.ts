import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildEducationResearchScoreWorkbook,
  EducationResearchWorkbookError,
  parseEducationResearchScoreWorkbook,
  type BuildEducationResearchWorkbookInput,
} from '@/lib/education-research-excel'

const input: BuildEducationResearchWorkbookInput = {
  project: {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'โครงการทดสอบ',
    topic: 'หัวข้อทดสอบ',
    classroom_name: 'ม.4/1',
  },
  template: { id: '22222222-2222-4222-8222-222222222222', version: 2 },
  pretest: { source_type: 'excel', max_score: 20 },
  posttest: { source_type: 'excel', max_score: 20 },
  rows: [
    { row_token: '30000000-0000-4000-8000-000000000001', roster_order: 1, student_code: '001', full_name: 'นักเรียน หนึ่ง', current_pretest: 0, current_posttest: null },
    { row_token: '30000000-0000-4000-8000-000000000002', roster_order: 2, student_code: null, full_name: 'นักเรียน สอง', current_pretest: null, current_posttest: 12.5 },
  ],
  generated_at: new Date('2026-08-24T00:00:00.000Z'),
}

describe('education research Excel workbook', () => {
  it('round-trips project-bound rows and keeps zero distinct from blank', async () => {
    const buffer = await buildEducationResearchScoreWorkbook(input)
    const parsed = await parseEducationResearchScoreWorkbook(buffer)

    expect(parsed.project_id).toBe(input.project.id)
    expect(parsed.template_id).toBe(input.template.id)
    expect(parsed.template_version).toBe(2)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({ student_code: '001', pretest: 0, posttest: null, parse_errors: [] })
    expect(parsed.rows[1]).toMatchObject({ student_code: null, pretest: null, posttest: 12.5, parse_errors: [] })
  })

  it('rejects formulas in score cells without evaluating them', async () => {
    const buffer = await buildEducationResearchScoreWorkbook(input)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    workbook.getWorksheet('กรอกคะแนน')!.getCell('E9').value = { formula: '10+5', result: 15 }
    const edited = Buffer.from(await workbook.xlsx.writeBuffer())

    const parsed = await parseEducationResearchScoreWorkbook(edited)
    expect(parsed.rows[0].pretest).toBeNull()
    expect(parsed.rows[0].parse_errors[0]).toContain('ห้ามใช้สูตร')
  })

  it('keeps an optional note with the normalized preview row', async () => {
    const buffer = await buildEducationResearchScoreWorkbook(input)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    workbook.getWorksheet('กรอกคะแนน')!.getCell('G9').value = 'ขาดเรียนรอบแรก'
    const edited = Buffer.from(await workbook.xlsx.writeBuffer())

    const parsed = await parseEducationResearchScoreWorkbook(edited)
    expect(parsed.rows[0].note).toBe('ขาดเรียนรอบแรก')
  })

  it('ignores a locked non-Excel score column', async () => {
    const buffer = await buildEducationResearchScoreWorkbook({ ...input, pretest: { source_type: 'korkru_exam', max_score: 20 } })
    const parsed = await parseEducationResearchScoreWorkbook(buffer)

    expect(parsed.rows[0].pretest).toBeNull()
    expect(parsed.rows[0].parse_errors).toEqual([])
  })

  it('rejects an unrelated workbook', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Sheet1').getCell('A1').value = 'not a KorKru template'
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    await expect(parseEducationResearchScoreWorkbook(buffer)).rejects.toBeInstanceOf(EducationResearchWorkbookError)
  })
})

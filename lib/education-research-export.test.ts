import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  anonymizeEducationResearchRows,
  buildEducationResearchDataExportWorkbook,
  educationResearchDataExportFileName,
  EducationResearchExportError,
  type BuildEducationResearchDataExportInput,
  type EducationResearchExportRow,
} from './education-research-export'

const rows: EducationResearchExportRow[] = [
  {
    order: 1,
    studentCode: '=STU-001',
    fullName: 'นักเรียนหนึ่ง',
    pretest: 10,
    posttest: 18,
    includedPaired: true,
    includedCriterion: true,
    passedCriterion: true,
    exclusionReason: null,
  },
  {
    order: 2,
    studentCode: 'STU-002',
    fullName: 'นักเรียนสอง',
    pretest: null,
    posttest: 14,
    includedPaired: false,
    includedCriterion: true,
    passedCriterion: false,
    exclusionReason: 'ไม่มีคะแนนก่อนเรียน',
  },
]

function input(
  mode: BuildEducationResearchDataExportInput['mode'],
  exportRows: EducationResearchExportRow[],
): BuildEducationResearchDataExportInput {
  return {
    mode,
    project: {
      title: 'การพัฒนาผลสัมฤทธิ์',
      topic: 'การเคลื่อนที่แบบโพรเจกไทล์',
      classroomName: 'ม.4/1',
      thresholdPercent: 70,
    },
    pretestMaxScore: 20,
    posttestMaxScore: 20,
    rows: exportRows,
    generatedAt: new Date('2026-09-04T07:30:00.000Z'),
  }
}

async function loadWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  return workbook
}

describe('education research individual-data export', () => {
  it('shuffles away roster order and assigns per-file participant codes', () => {
    const anonymous = anonymizeEducationResearchRows(rows, () => 0)
    expect(anonymous.map(row => row.anonymousCode)).toEqual(['P001', 'P002'])
    expect(anonymous.map(row => row.posttest)).toEqual([14, 18])
    expect(anonymous.every(row => row.fullName === '' && row.studentCode === null)).toBe(true)
  })

  it('builds an anonymous workbook without student identity or roster order', async () => {
    const anonymous = anonymizeEducationResearchRows(rows, () => 0)
    const workbook = await loadWorkbook(await buildEducationResearchDataExportWorkbook(
      input('anonymous', anonymous),
    ))
    const dataSheet = workbook.getWorksheet('ข้อมูลไม่ระบุตัวตน')!
    expect(dataSheet.getRow(7).values).toEqual([
      ,
      'รหัสผู้เข้าร่วม',
      'ก่อนเรียน (เต็ม 20)',
      'หลังเรียน (เต็ม 20)',
      'ใช้วิเคราะห์ก่อน–หลัง',
      'ใช้วิเคราะห์เทียบเกณฑ์',
      'ผลเทียบเกณฑ์',
      'เหตุผลที่ไม่รวม',
    ])
    expect(dataSheet.getCell('A8').value).toBe('P001')
    expect(dataSheet.getCell('A9').value).toBe('P002')

    const allText: string[] = []
    workbook.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => {
      allText.push(String(cell.value ?? ''))
      expect(typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value).toBe(false)
    })))
    expect(allText.join('\n')).not.toContain('นักเรียนหนึ่ง')
    expect(allText.join('\n')).not.toContain('นักเรียนสอง')
    expect(allText.join('\n')).not.toContain('STU-001')
    expect(allText.join('\n')).not.toContain('STU-002')
  })

  it('includes only the approved direct identifiers in an identified workbook', async () => {
    const workbook = await loadWorkbook(await buildEducationResearchDataExportWorkbook(
      input('identified', rows),
    ))
    const dataSheet = workbook.getWorksheet('ข้อมูลมีชื่อและรหัส')!
    expect(dataSheet.getCell('A8').value).toBe(1)
    expect(dataSheet.getCell('B8').value).toBe('=STU-001')
    expect(dataSheet.getCell('C8').value).toBe('นักเรียนหนึ่ง')
    expect(dataSheet.getCell('D8').value).toBe(10)
    expect(dataSheet.getCell('E8').value).toBe(18)
    expect(dataSheet.getCell('F8').value).toBe('ใช้')
    expect(dataSheet.getCell('H8').value).toBe('ผ่าน')
    expect(dataSheet.getCell('I9').value).toBe('ไม่มีคะแนนก่อนเรียน')
    expect(typeof dataSheet.getCell('B8').value).toBe('string')
  })

  it('rejects an out-of-range score instead of exporting inconsistent data', async () => {
    await expect(buildEducationResearchDataExportWorkbook(input('identified', [
      { ...rows[0], posttest: 21 },
    ]))).rejects.toBeInstanceOf(EducationResearchExportError)
  })

  it('uses a sanitized mode-specific filename', () => {
    expect(educationResearchDataExportFileName(' หน่วย/แรง: ม.4 ', 'anonymous'))
      .toBe('KorKru-ข้อมูลวิจัย-ไม่ระบุตัวตน-หน่วย-แรง-ม.4.xlsx')
    expect(educationResearchDataExportFileName('โครงงาน', 'identified'))
      .toBe('KorKru-ข้อมูลวิจัย-มีชื่อและรหัส-โครงงาน.xlsx')
  })
})

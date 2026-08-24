import type {
  EducationResearchMeasurementType,
  EducationResearchSourceType,
} from '@/lib/types'

export interface ResearchScoreCell {
  participant_id: string
  measurement_id: string
  raw_score: number
}

export interface ResearchScoreMeasurementConfig {
  id: string
  measurement_type: EducationResearchMeasurementType
  source_type: EducationResearchSourceType | null
  max_score: number | null
}

export function parseResearchScoreInput(
  value: string,
  maxScore: number | null,
): { value: number | null; error: string | null } {
  const trimmed = value.trim()
  if (trimmed === '') return { value: null, error: null }
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return { value: null, error: 'กรุณากรอกเป็นตัวเลข' }
  if (numeric < 0) return { value: null, error: 'คะแนนต้องไม่ติดลบ' }
  if (maxScore === null || maxScore <= 0) return { value: null, error: 'ยังไม่ได้กำหนดคะแนนเต็ม' }
  if (numeric > maxScore) return { value: null, error: `คะแนนต้องไม่เกิน ${formatResearchScore(maxScore)}` }
  return { value: numeric, error: null }
}

export function formatResearchScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const numeric = Number(value)
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function researchScoreSourceLabel(source: EducationResearchSourceType | null): string {
  if (source === 'korkru_exam') return 'ข้อสอบ KorKru'
  if (source === 'manual') return 'กรอกบนเว็บ'
  if (source === 'excel') return 'Excel'
  return 'ยังไม่กำหนด'
}

export function researchScoreAction(
  current: number | null,
  incoming: number | null,
): 'add' | 'update' | 'unchanged' | 'blank' {
  if (incoming === null) return 'blank'
  if (current === null) return 'add'
  return current === incoming ? 'unchanged' : 'update'
}

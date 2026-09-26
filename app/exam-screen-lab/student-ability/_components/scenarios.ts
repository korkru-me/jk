// Plain module (no 'use client'): the server page reads this list to parse
// `?scenario=`, and a value exported from a client file would reach it only
// as a client reference.
export type LabScenario = 'default' | 'many' | 'edge' | 'empty'

export const LAB_SCENARIOS: { key: LabScenario; label: string }[] = [
  { key: 'default', label: 'ห้องปกติ 58 คน' },
  { key: 'many', label: 'งานเยอะ 18 งาน' },
  { key: 'edge', label: 'กรณีขอบ' },
  { key: 'empty', label: 'ยังไม่มีงาน' },
]

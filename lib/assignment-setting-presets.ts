import { z } from 'zod'
import type { AssignmentType } from '@/lib/types'
import { newAssignmentTypeDefaults } from '@/lib/assignment-creation'
import { STREAK_TARGET_DEFAULT, defaultQuestionCap } from '@/lib/streak-completion'

export const ASSIGNMENT_PRESET_LIMIT = 3
export const ASSIGNMENT_PRESET_SCHEMA_VERSION = 1
export const DEFAULT_QUESTIONS_PER_PAGE = 5
export const assignmentPresetTypeSchema = z.enum(['exercise', 'exam'])
const positiveNumber = z.number().finite().gt(0).max(1_000_000)
const integer = (max: number) => z.number().int().min(1).max(max)

// This is a settings allowlist, NOT an Assignment serializer. Adding a field
// requires the database validator and tests to change together. No content,
// recipient, schedule, password, seed, CK or BEK can cross this boundary.
export const assignmentPresetSettingsSchema = z.object({
  duration_minutes: integer(525600).nullable(),
  shuffle_questions: z.boolean(),
  shuffle_options: z.boolean(),
  shared_random_values: z.boolean(),
  show_results: z.enum(['immediate', 'score_only', 'after_due', 'never']),
  show_solutions: z.boolean(),
  max_attempts: integer(10000).nullable(),
  score_strategy: z.enum(['best', 'average', 'latest']),
  retry_scope: z.enum(['all', 'wrong_only']),
  questions_per_page: integer(50),
  instant_check: z.boolean(),
  instant_check_answer_key: z.boolean(),
  calculator_enabled: z.boolean(),
  scratchpad_enabled: z.boolean(),
  proctoring_enabled: z.boolean(),
  fullscreen_required: z.boolean(),
  block_clipboard: z.boolean(),
  exam_watermark_enabled: z.boolean(),
  secure_browser_mode: z.enum(['browser', 'seb_required']),
  android_exam_mode: z.enum(['blocked', 'monitored']),
  completion_rule: z.enum(['fixed', 'streak']),
  streak_target: z.number().int().min(2).max(20),
  streak_question_cap: integer(200).nullable(),
  streak_recycle_pool: z.boolean(),
  passing_type: z.enum(['score', 'percent']).nullable(),
  passing_value: positiveNumber.nullable(),
  random_question_count: integer(10000).nullable(),
  display_max_score: positiveNumber.nullable(),
  show_question_sections: z.boolean(),
  require_work_image: z.boolean(),
}).strict().superRefine((settings, ctx) => {
  if ((settings.passing_type === null) !== (settings.passing_value === null)) {
    ctx.addIssue({ code: 'custom', path: ['passing_value'], message: 'กรุณาระบุเกณฑ์ผ่านให้ครบ หรือปิดเกณฑ์ผ่าน' })
  }
  if (settings.passing_type === 'percent' && (settings.passing_value ?? 0) > 100) {
    ctx.addIssue({ code: 'custom', path: ['passing_value'], message: 'เปอร์เซ็นต์ผ่านต้องไม่เกิน 100' })
  }
})

export type AssignmentPresetSettings = z.infer<typeof assignmentPresetSettingsSchema>
export const assignmentPresetNameSchema = z.string().trim().min(1, 'กรุณาตั้งชื่อชุดการตั้งค่า').max(60, 'ชื่อชุดต้องไม่เกิน 60 ตัวอักษร')

export const assignmentSettingPresetSchema = z.object({
  id: z.string().uuid(),
  assignment_type: assignmentPresetTypeSchema,
  slot: integer(ASSIGNMENT_PRESET_LIMIT),
  name: assignmentPresetNameSchema,
  settings: assignmentPresetSettingsSchema,
  revision: integer(2147483646),
  updated_at: z.string().datetime({ offset: true }),
}).strict()

export type AssignmentSettingPreset = z.infer<typeof assignmentSettingPresetSchema>
export type AssignmentPresetBootstrap = {
  presets: AssignmentSettingPreset[]
  defaultPresetId: string | null
  error: string | null
}
export type AssignmentPresetActionResult = { data: AssignmentPresetBootstrap } | { error: string }
export type SaveAssignmentSettingPresetInput = {
  type: AssignmentType
  id?: string
  expectedRevision?: number
  name: string
  settings: AssignmentPresetSettings
}

export function assignmentPresetDefaults(type: AssignmentType): AssignmentPresetSettings {
  const defaults = newAssignmentTypeDefaults(type)
  return {
    duration_minutes: null, shuffle_questions: false, shuffle_options: true,
    shared_random_values: false, show_results: 'immediate', show_solutions: false,
    max_attempts: Number(defaults.maxAttempts), score_strategy: 'best', retry_scope: defaults.retryScope,
    questions_per_page: DEFAULT_QUESTIONS_PER_PAGE, instant_check: true, instant_check_answer_key: false,
    calculator_enabled: defaults.calculatorEnabled, scratchpad_enabled: defaults.scratchpadEnabled,
    proctoring_enabled: false, fullscreen_required: false, block_clipboard: false,
    exam_watermark_enabled: false, secure_browser_mode: 'browser', android_exam_mode: 'blocked',
    completion_rule: 'fixed', streak_target: STREAK_TARGET_DEFAULT,
    streak_question_cap: defaultQuestionCap(STREAK_TARGET_DEFAULT), streak_recycle_pool: true,
    passing_type: null, passing_value: null, random_question_count: null,
    display_max_score: null, show_question_sections: true, require_work_image: false,
  }
}

export function assignmentPresetError(code: string | undefined): string {
  switch (code) {
    case '23505': return 'มีชื่อชุดนี้แล้ว กรุณาใช้ชื่ออื่น'
    case 'P0001': return 'เก็บได้สูงสุด 3 ชุดต่อประเภท กรุณาลบชุดที่ไม่ใช้ก่อน'
    case 'PT409':
    case '40001': return 'ชุดนี้ถูกแก้ไขจากอีกหน้าต่างแล้ว กรุณาโหลดใหม่ก่อนบันทึก'
    case '42501': return 'ไม่พบชุดการตั้งค่านี้ หรือคุณไม่มีสิทธิ์จัดการ'
    case '22023': case '23514': return 'การตั้งค่าบางรายการไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
    default: return 'ยังบันทึกการตั้งค่าไม่ได้ กรุณาลองอีกครั้ง'
  }
}

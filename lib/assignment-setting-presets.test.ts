import { describe, expect, it } from 'vitest'
import {
  assignmentPresetDefaults, assignmentPresetSettingsSchema,
  assignmentPresetNameSchema, assignmentSettingPresetSchema, assignmentPresetError,
} from './assignment-setting-presets'

describe('private assignment settings allowlist', () => {
  it.each(['exercise', 'exam'] as const)('round trips system defaults for %s', type => {
    const values = assignmentPresetDefaults(type)
    expect(assignmentPresetSettingsSchema.parse(JSON.parse(JSON.stringify(values)))).toEqual(values)
    expect(values.max_attempts).toBe(1)
    expect(values.scratchpad_enabled).toBe(type === 'exercise')
    expect(values.instant_check_answer_key).toBe(false)
    expect(values.shuffle_options).toBe(true)
    expect(values.questions_per_page).toBe(5)
  })

  it.each(['question_ids', 'question_points', 'classroom_ids', 'group_ids', 'title', 'description',
    'start_at', 'end_at', 'access_code', 'seb_quit_password', 'shared_random_seed', 'config_key', 'browser_exam_keys'])
  ('rejects extra content or secret field %s instead of quietly persisting it', field => {
    expect(assignmentPresetSettingsSchema.safeParse({ ...assignmentPresetDefaults('exam'), [field]: 'never persist' }).success).toBe(false)
  })

  it('keeps requested draw and settings separate from the selected question pool', () => {
    const settings = { ...assignmentPresetDefaults('exercise'), random_question_count: 25, shared_random_values: true }
    expect(assignmentPresetSettingsSchema.parse(settings)).toEqual(settings)
    expect(Object.keys(settings).some(key => key.includes('seed'))).toBe(false)
  })

  it.each([
    { duration_minutes: 0 }, { questions_per_page: 51 }, { max_attempts: 0 },
    { streak_target: 1 }, { streak_question_cap: 201 }, { random_question_count: -1 },
    { display_max_score: Infinity }, { show_results: 'unknown' }, { instant_check: 'true' },
    { passing_type: 'percent', passing_value: 101 }, { passing_type: 'score', passing_value: null },
  ])('rejects malformed config %j', patch => {
    expect(assignmentPresetSettingsSchema.safeParse({ ...assignmentPresetDefaults('exercise'), ...patch }).success).toBe(false)
  })

  it('allows unlimited time, attempts and streak cap without replacing their meaning', () => {
    const values = { ...assignmentPresetDefaults('exercise'), duration_minutes: null, max_attempts: null, streak_question_cap: null }
    expect(assignmentPresetSettingsSchema.parse(values)).toEqual(values)
  })
  it('validates normalized names and slots without accepting unknown schema fields', () => {
    expect(assignmentPresetNameSchema.parse('  ฝึกซ้ำ  ')).toBe('ฝึกซ้ำ')
    expect(assignmentPresetNameSchema.safeParse(' ').success).toBe(false)
    expect(assignmentPresetNameSchema.safeParse('x'.repeat(61)).success).toBe(false)
    const row = {
      id: '90000000-0000-4000-8000-000000000001', assignment_type: 'exercise', slot: 3,
      name: 'ฝึกซ้ำ', settings: assignmentPresetDefaults('exercise'), revision: 1,
      updated_at: '2026-10-06T00:00:00+00:00',
    }
    expect(assignmentSettingPresetSchema.safeParse(row).success).toBe(true)
    expect(assignmentSettingPresetSchema.safeParse({ ...row, slot: 4 }).success).toBe(false)
    expect(assignmentSettingPresetSchema.safeParse({ ...row, owner_id: 'other' }).success).toBe(false)
  })
  it('maps SQL errors to fixed, secret-safe messages', () => {
    expect(assignmentPresetError('40001')).toContain('อีกหน้าต่าง')
    expect(assignmentPresetError('PT409')).toContain('อีกหน้าต่าง')
    expect(assignmentPresetError('P0001')).toContain('3 ชุด')
    expect(assignmentPresetError('XX000')).not.toContain('XX000')
  })
})

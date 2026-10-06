'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  assignmentPresetTypeSchema, assignmentPresetNameSchema, assignmentPresetSettingsSchema,
  assignmentSettingPresetSchema, assignmentPresetError, ASSIGNMENT_PRESET_SCHEMA_VERSION,
  type AssignmentPresetActionResult, type SaveAssignmentSettingPresetInput,
} from '@/lib/assignment-setting-presets'
import type { AssignmentType } from '@/lib/types'

const identitySchema = z.object({
  type: assignmentPresetTypeSchema,
  id: z.string().uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
}).strict()
const saveSchema = z.object({
  type: assignmentPresetTypeSchema, id: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(1).max(2147483646).optional(),
  name: assignmentPresetNameSchema, settings: assignmentPresetSettingsSchema,
}).strict().refine(input => (!!input.id) === (input.expectedRevision !== undefined), {
  message: 'กรุณาโหลดชุดการตั้งค่าใหม่ก่อนบันทึก',
})
const LOAD_ERROR = 'ยังโหลดชุดการตั้งค่าไม่ได้ กรุณาลองใหม่ งานที่กำลังกรอกยังอยู่เหมือนเดิม'

async function presetSession() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: 'กรุณาเข้าสู่ระบบก่อนใช้ชุดการตั้งค่า' } as const
  const { data: profile, error: profileError } = await supabase.from('users')
    .select('role, status').eq('id', user.id).maybeSingle()
  if (profileError || !profile || profile.status !== 'active'
    || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    return { error: 'เฉพาะบัญชีครูที่ใช้งานอยู่เท่านั้นที่ใช้ชุดการตั้งค่าได้' } as const
  }
  return { supabase, user } as const
}

async function loadForSession(
  session: Exclude<Awaited<ReturnType<typeof presetSession>>, { error: string }>,
  type: AssignmentType,
): Promise<AssignmentPresetActionResult> {
  // Reads remain session-bound and explicitly scoped even with RLS enabled.
  const [presets, preference] = await Promise.all([
    session.supabase.from('assignment_setting_presets')
      .select('id, assignment_type, slot, name, settings, revision, updated_at, schema_version')
      .eq('owner_id', session.user.id).eq('assignment_type', type).order('slot'),
    session.supabase.from('assignment_setting_preset_preferences')
      .select('default_preset_id').eq('owner_id', session.user.id)
      .eq('assignment_type', type).maybeSingle(),
  ])
  if (presets.error || preference.error || !presets.data || presets.data.length > 3) return { error: LOAD_ERROR }
  const rows = []
  for (const row of presets.data) {
    const { schema_version, ...safeRow } = row
    if (schema_version !== ASSIGNMENT_PRESET_SCHEMA_VERSION) return { error: LOAD_ERROR }
    const parsed = assignmentSettingPresetSchema.safeParse(safeRow)
    if (!parsed.success || parsed.data.assignment_type !== type) return { error: LOAD_ERROR }
    rows.push(parsed.data)
  }
  const defaultPresetId = preference.data?.default_preset_id ?? null
  if (defaultPresetId !== null && !rows.some(row => row.id === defaultPresetId)) return { error: LOAD_ERROR }
  return { data: { presets: rows, defaultPresetId, error: null } }
}

export async function loadAssignmentSettingPresets(type: AssignmentType): Promise<AssignmentPresetActionResult> {
  if (!assignmentPresetTypeSchema.safeParse(type).success) return { error: LOAD_ERROR }
  try {
    const session = await presetSession()
    if ('error' in session) return { error: session.error ?? LOAD_ERROR }
    return await loadForSession(session, type)
  } catch { return { error: LOAD_ERROR } }
}

async function mutate(input: {
  type: AssignmentType; action: string; id?: string | null; name?: string;
  settings?: SaveAssignmentSettingPresetInput['settings']; expectedRevision?: number;
}): Promise<AssignmentPresetActionResult> {
  try {
    const session = await presetSession()
    if ('error' in session) return { error: session.error ?? LOAD_ERROR }
    const { data, error } = await session.supabase.rpc('mutate_assignment_setting_preset', {
      p_type: input.type, p_action: input.action, p_id: input.id ?? null,
      p_name: input.name ?? null, p_settings: input.settings ?? null,
      p_expected_revision: input.expectedRevision ?? null,
    })
    if (error) return { error: assignmentPresetError(error.code) }
    // A transport/proxy response is not proof of a successful write. Every
    // mutation returns the exact preset UUID; clearing a default returns null.
    const responseValid = input.action === 'clear_default'
      ? data === null
      : z.string().uuid().safeParse(data).success && (!input.id || data === input.id)
    if (!responseValid) return { error: 'ผลการบันทึกยังไม่ยืนยัน กรุณาโหลดรายการใหม่ก่อนลองซ้ำ' }
    const refreshed = await loadForSession(session, input.type)
    if ('error' in refreshed) return { error: 'บันทึกคำสั่งแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ กรุณากดโหลดใหม่ก่อนลองบันทึกซ้ำ' }
    return refreshed
  } catch { return { error: 'ติดต่อระบบไม่ได้ ผลการบันทึกยังไม่ยืนยัน กรุณาโหลดรายการใหม่ก่อนลองซ้ำ' } }
}

export async function saveAssignmentSettingPreset(input: SaveAssignmentSettingPresetInput): Promise<AssignmentPresetActionResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'กรุณาตรวจการตั้งค่าอีกครั้ง' }
  return mutate({ ...parsed.data, action: parsed.data.id ? 'update' : 'create' })
}

export async function renameAssignmentSettingPreset(input: z.infer<typeof identitySchema> & { name: string }): Promise<AssignmentPresetActionResult> {
  const parsed = identitySchema.extend({ name: assignmentPresetNameSchema }).safeParse(input)
  if (!parsed.success) return { error: 'ชื่อชุดหรือข้อมูลอ้างอิงไม่ถูกต้อง' }
  return mutate({ ...parsed.data, action: 'rename' })
}

export async function deleteAssignmentSettingPreset(input: z.infer<typeof identitySchema>): Promise<AssignmentPresetActionResult> {
  const parsed = identitySchema.safeParse(input)
  if (!parsed.success) return { error: 'กรุณาโหลดชุดการตั้งค่าใหม่ก่อนลบ' }
  return mutate({ ...parsed.data, action: 'delete' })
}

export async function setDefaultAssignmentSettingPreset(input: {
  type: AssignmentType; id: string | null; expectedRevision?: number;
}): Promise<AssignmentPresetActionResult> {
  const schema = z.object({
    type: assignmentPresetTypeSchema, id: z.string().uuid().nullable(),
    expectedRevision: z.number().int().min(1).max(2147483646).optional(),
  }).strict().refine(value => value.id === null || value.expectedRevision !== undefined)
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: 'กรุณาโหลดชุดการตั้งค่าใหม่ก่อนตั้งค่าเริ่มต้น' }
  return mutate({ ...parsed.data, action: parsed.data.id === null ? 'clear_default' : 'default' })
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignmentPresetDefaults } from './assignment-setting-presets'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
import {
  loadAssignmentSettingPresets, saveAssignmentSettingPreset,
  deleteAssignmentSettingPreset, setDefaultAssignmentSettingPreset,
} from './actions/assignment-setting-presets'

const OWNER = '90000000-0000-4000-8000-000000000001'
const PRESET = '90000000-0000-4000-8000-000000000002'
const queryCalls: Array<{ table: string; field: string; value: unknown }> = []
let profile: { role: string; status: string } | null
let readFailure = false
let rows: unknown[] = []
let defaultId: string | null = null

beforeEach(() => {
  vi.resetAllMocks()
  profile = { role: 'teacher', status: 'active' }
  rows = []
  defaultId = null
  readFailure = false
  queryCalls.length = 0
  mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null })
  mocks.rpc.mockResolvedValue({ data: PRESET, error: null })
  mocks.from.mockImplementation((table: string) => {
    const result = () => ({
      data: table === 'users' ? profile : table === 'assignment_setting_presets' ? rows : defaultId ? { default_preset_id: defaultId } : null,
      error: table !== 'users' && readFailure ? { code: 'XX000', message: 'private SQL detail' } : null,
    })
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((field: string, value: unknown) => { queryCalls.push({ table, field, value }); return builder }),
      order: vi.fn(() => builder), maybeSingle: vi.fn(async () => result()),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return builder
  })
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc })
})

describe('session-bound preset actions', () => {
  it('reads only exact owner and requested type', async () => {
    expect(await loadAssignmentSettingPresets('exercise')).toEqual({ data: { presets: [], defaultPresetId: null, error: null } })
    for (const table of ['assignment_setting_presets', 'assignment_setting_preset_preferences']) {
      expect(queryCalls).toContainEqual({ table, field: 'owner_id', value: OWNER })
      expect(queryCalls).toContainEqual({ table, field: 'assignment_type', value: 'exercise' })
    }
  })
  it.each(['student', 'super_admin'])('rejects role %s before reading or mutating presets', async role => {
    profile = { role, status: 'active' }
    expect(await saveAssignmentSettingPreset({ type: 'exam', name: 'ชุด', settings: assignmentPresetDefaults('exam') })).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
  it('rejects a logged-out or inactive account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await loadAssignmentSettingPresets('exercise')).toHaveProperty('error')
    expect(mocks.from).not.toHaveBeenCalled()
    mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null })
    profile = { role: 'teacher', status: 'suspended' }
    expect(await loadAssignmentSettingPresets('exercise')).toHaveProperty('error')
  })
  it('never accepts owner, passwords, or content from untrusted action input', async () => {
    const unsafe = { type: 'exercise', name: 'ชุด', settings: { ...assignmentPresetDefaults('exercise'), access_code: 'secret' } }
    expect(await saveAssignmentSettingPreset(unsafe as Parameters<typeof saveAssignmentSettingPreset>[0])).toHaveProperty('error')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('passes only allowlisted arguments and trimmed name to RPC', async () => {
    await saveAssignmentSettingPreset({ type: 'exercise', name: '  ฝึก  ', settings: assignmentPresetDefaults('exercise') })
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_assignment_setting_preset', {
      p_type: 'exercise', p_action: 'create', p_id: null, p_name: 'ฝึก',
      p_settings: assignmentPresetDefaults('exercise'), p_expected_revision: null,
    })
  })
  it('requires CAS for saved-set edits, deletion, and default selection', async () => {
    expect(await saveAssignmentSettingPreset({ type: 'exam', id: PRESET, name: 'ชุด', settings: assignmentPresetDefaults('exam') })).toHaveProperty('error')
    expect(await deleteAssignmentSettingPreset({ type: 'exam', id: PRESET } as Parameters<typeof deleteAssignmentSettingPreset>[0])).toHaveProperty('error')
    expect(await setDefaultAssignmentSettingPreset({ type: 'exam', id: PRESET })).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('exposes read/schema errors explicitly instead of returning an empty list', async () => {
    readFailure = true
    const failed = await loadAssignmentSettingPresets('exam')
    expect(failed).toHaveProperty('error')
    expect(JSON.stringify(failed)).not.toContain('private SQL detail')
    readFailure = false
    rows = [{ schema_version: 99 }]
    expect(await loadAssignmentSettingPresets('exam')).toHaveProperty('error')
  })
  it('does not imply a failed mutation when the write succeeded but refresh failed', async () => {
    readFailure = true
    const result = await saveAssignmentSettingPreset({ type: 'exam', name: 'ชุด', settings: assignmentPresetDefaults('exam') })
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).toContain('บันทึกคำสั่งแล้ว')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('returns fixed SQL error messages without reflecting database detail', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '40001', message: 'private query' } })
    const result = await saveAssignmentSettingPreset({ type: 'exam', id: PRESET, expectedRevision: 1, name: 'ชุด', settings: assignmentPresetDefaults('exam') })
    expect(JSON.stringify(result)).toContain('อีกหน้าต่าง')
    expect(JSON.stringify(result)).not.toContain('private query')
  })
})

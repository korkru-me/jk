import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSebPasswordOwner, SebPasswordError, type SebPasswordOwnerContext } from '@/lib/seb-password-policy'
import { assertSebPasswordAssignmentId, parseSebPasswordSettingsSummary, type SebPasswordWrite } from '@/lib/seb-password-service'
import { loadSebPasswordVault, sebPasswordDraftsEnabled } from '@/lib/seb-password-config'
import type { SebPasswordSettingsView } from '@/lib/seb-password-settings'

export async function authorizeSebPasswordAssignment(assignmentId: string) {
  assertSebPasswordAssignmentId(assignmentId)
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new SebPasswordError('SEB_PASSWORD_AUTH_REQUIRED')
  const [profileResult, assignmentResult] = await Promise.all([
    supabase.from('users').select('id,role,status').eq('id', user.id).maybeSingle(),
    supabase.from('assignments').select('id,org_id,created_by,type,mode,secure_browser_mode,title')
      .eq('id', assignmentId).eq('created_by', user.id).maybeSingle(),
  ])
  const assignment = assignmentResult.data
  const actor = profileResult.data
  if (profileResult.error || assignmentResult.error) throw new SebPasswordError('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  if (!assignment || !actor) throw new SebPasswordError('SEB_PASSWORD_ACCESS_DENIED')
  const membership = await supabase.from('organization_members').select('org_id')
    .eq('user_id', user.id).eq('org_id', assignment.org_id).maybeSingle()
  if (membership.error) throw new SebPasswordError('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  const context: SebPasswordOwnerContext = {
    actor, assignment, memberOrgIds: membership.data ? [membership.data.org_id] : [],
  }
  assertSebPasswordOwner(context)
  return { ...context, title: String(assignment.title) }
}

function throwStorageError(error: { code?: string; message?: string }): never {
  if (error.code === '42501') throw new SebPasswordError('SEB_PASSWORD_ACCESS_DENIED')
  if (error.code === '40001') throw new SebPasswordError('SEB_PASSWORD_REVISION_CONFLICT')
  if (error.code === 'P0001' && error.message === 'SEB_PASSWORD_RATE_LIMITED') {
    throw new SebPasswordError('SEB_PASSWORD_RATE_LIMITED')
  }
  // SQL details may contain function parameters. Do not log/return/cause them.
  throw new SebPasswordError('SEB_PASSWORD_STORAGE_UNAVAILABLE')
}

async function readDraft(context: SebPasswordOwnerContext): Promise<unknown> {
  assertSebPasswordOwner(context)
  const admin = createAdminClient() // Called only after fresh user/RLS authorization.
  const { data, error } = await admin.rpc('read_exam_seb_password_draft', {
    p_assignment_id: context.assignment.id, p_actor_id: context.actor.id,
  })
  if (error) throwStorageError(error)
  return data
}

async function writeDraft(context: SebPasswordOwnerContext, command: SebPasswordWrite): Promise<unknown> {
  assertSebPasswordOwner(context)
  if (command.assignmentId !== context.assignment.id || command.actorId !== context.actor.id) {
    throw new SebPasswordError('SEB_PASSWORD_ACCESS_DENIED')
  }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('write_exam_seb_password_draft', {
    p_assignment_id: context.assignment.id, p_actor_id: context.actor.id,
    p_expected_revision: command.expectedRevision, p_revision_id: command.revisionId, p_secret: command.secret,
  })
  if (error) throwStorageError(error)
  return data
}

export const sebPasswordServicePorts = {
  authorize: authorizeSebPasswordAssignment,
  enabled: sebPasswordDraftsEnabled,
  vault: loadSebPasswordVault,
  read: readDraft,
  write: writeDraft,
}

export async function getSebPasswordSettings(assignmentId: string): Promise<{ title: string; view: SebPasswordSettingsView }> {
  const context = await authorizeSebPasswordAssignment(assignmentId)
  if (!sebPasswordDraftsEnabled()) return {
    title: context.title,
    view: { kind: 'unavailable', reason: 'ผู้ดูแลระบบยังไม่เปิดการบันทึกรหัสรายข้อสอบ ไฟล์ SEB เดิมยังไม่เปลี่ยนแปลง' },
  }
  try {
    // No key is disclosed by this readiness check; no native/server readiness
    // can be inferred from either key provisioning or a working draft table.
    loadSebPasswordVault()
    const summary = parseSebPasswordSettingsSummary(await readDraft(context))
    return { title: context.title, view: { kind: 'available', summary } }
  } catch (error) {
    if (error instanceof SebPasswordError && error.code === 'SEB_PASSWORD_ACCESS_DENIED') throw error
    return { title: context.title, view: {
      kind: 'unavailable', reason: 'อ่านร่างรหัสไม่ได้ หรือระบบจัดเก็บยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแลระบบก่อนใช้งาน',
    } }
  }
}

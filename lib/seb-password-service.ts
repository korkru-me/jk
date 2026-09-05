import 'server-only'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { assertSebDraftPassword, assertSebPasswordOwner, nextSebPasswordRevision, SebPasswordError,
  type SebPasswordOwnerContext } from '@/lib/seb-password-policy'
import { prepareSebPasswordDraft, type SebPasswordVault, type SebPasswordEnvelope } from '@/lib/seb-password-vault'
import type { SebPasswordSettingsSummary } from '@/lib/seb-password-settings'

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
const revision = z.number().int().min(1).max(2147483647)
const state = z.enum(['saved', 'discarded', 'expired'])
const timestamp = z.string().max(40).datetime({ offset: true })
const summarySchema = z.object({
  draft: z.object({ revision, state, updatedAt: timestamp, expiresAt: timestamp.nullable() }).nullable(),
  events: z.array(z.object({ revision, action: state, createdAt: timestamp })).max(10),
})
const commandSchema = z.object({
  assignmentId: uuid, expectedRevision: z.number().int().min(0).max(2147483646),
  operation: z.enum(['save', 'discard']), password: z.unknown().optional(), confirmation: z.unknown().optional(),
}).strict()

export interface SebPasswordWrite {
  assignmentId: string
  actorId: string
  expectedRevision: number
  revisionId: string
  secret: SebPasswordEnvelope | null
}
export interface SebPasswordServicePorts {
  // Must authenticate and resolve fresh session/RLS context on every call.
  authorize: (assignmentId: string) => Promise<SebPasswordOwnerContext>
  enabled: () => boolean
  vault: () => SebPasswordVault
  read: (context: SebPasswordOwnerContext) => Promise<unknown>
  write: (context: SebPasswordOwnerContext, command: SebPasswordWrite) => Promise<unknown>
}

export function parseSebPasswordSettingsSummary(value: unknown): SebPasswordSettingsSummary {
  const parsed = summarySchema.safeParse(value)
  if (!parsed.success) throw new SebPasswordError('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  const result = parsed.data
  if (result.draft?.state === 'saved' && (!result.draft.expiresAt ||
      Date.parse(result.draft.expiresAt) <= Date.parse(result.draft.updatedAt))) {
    throw new SebPasswordError('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  }
  // Zod strips extra fields at every level. Never spread a raw RPC/DB row.
  return result
}

export function assertSebPasswordAssignmentId(value: unknown): asserts value is string {
  if (!uuid.safeParse(value).success) throw new SebPasswordError('SEB_PASSWORD_CONTEXT_INVALID')
}

export async function changeSebPasswordDraft(input: unknown, ports: SebPasswordServicePorts): Promise<SebPasswordSettingsSummary> {
  const parsed = commandSchema.safeParse(input)
  if (!parsed.success) throw new SebPasswordError('SEB_PASSWORD_CONTEXT_INVALID')
  const command = parsed.data
  const context = await ports.authorize(command.assignmentId)
  assertSebPasswordOwner(context)
  if (context.assignment.id !== command.assignmentId) throw new SebPasswordError('SEB_PASSWORD_ACCESS_DENIED')
  if (!ports.enabled()) throw new SebPasswordError('SEB_PASSWORD_DISABLED')
  if (command.operation === 'save') {
    assertSebDraftPassword(command.password)
    if (command.password !== command.confirmation) throw new SebPasswordError('SEB_PASSWORD_CONFIRMATION_MISMATCH')
  } else if (command.password !== undefined || command.confirmation !== undefined) {
    throw new SebPasswordError('SEB_PASSWORD_CONTEXT_INVALID')
  }
  const current = parseSebPasswordSettingsSummary(await ports.read(context))
  const expectedNext = nextSebPasswordRevision(current.draft?.revision ?? 0, command.expectedRevision)
  if (command.operation === 'discard' && !current.draft) throw new SebPasswordError('SEB_PASSWORD_REVISION_CONFLICT')
  let secret: SebPasswordEnvelope | null = null
  let revisionId: string = randomUUID()
  if (command.operation === 'save') {
    const draft = prepareSebPasswordDraft(context, command.password as string,
      current.draft?.revision ?? 0, command.expectedRevision, ports.vault())
    secret = draft.secret
    revisionId = draft.binding.revisionId
  }
  const result = parseSebPasswordSettingsSummary(await ports.write(context, {
    assignmentId: command.assignmentId, actorId: context.actor.id,
    expectedRevision: command.expectedRevision, revisionId, secret,
  }))
  if (result.draft?.revision !== expectedNext ||
      result.draft.state !== (command.operation === 'save' ? 'saved' : 'discarded')) {
    // The write may have committed: callers must ask for a reload, not retry
    // with a new revision or announce either success or guaranteed failure.
    throw new SebPasswordError('SEB_PASSWORD_STORAGE_UNAVAILABLE')
  }
  return result
}

export function sebPasswordErrorMessage(error: unknown): { message: string; reloadRequired: boolean } {
  const code = error instanceof SebPasswordError ? error.code : 'SEB_PASSWORD_STORAGE_UNAVAILABLE'
  switch (code) {
    case 'SEB_PASSWORD_AUTH_REQUIRED': return { message: 'กรุณาเข้าสู่ระบบอีกครั้ง', reloadRequired: true }
    case 'SEB_PASSWORD_ACCESS_DENIED': return { message: 'เฉพาะครูเจ้าของข้อสอบ SEB นี้เท่านั้นที่จัดการรหัสได้', reloadRequired: true }
    case 'SEB_PASSWORD_INVALID': return { message: 'ใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์ 12–64 ตัว โดยไม่มีช่องว่าง', reloadRequired: false }
    case 'SEB_PASSWORD_CONFIRMATION_MISMATCH': return { message: 'รหัสทั้งสองช่องไม่ตรงกัน กรุณากรอกใหม่', reloadRequired: false }
    case 'SEB_PASSWORD_REVISION_CONFLICT': return { message: 'ข้อมูลเปลี่ยนจากอีกแท็บแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง', reloadRequired: true }
    case 'SEB_PASSWORD_RATE_LIMITED': return { message: 'เพิ่งบันทึกรหัสไป กรุณารอ 10 วินาทีแล้วลองอีกครั้ง', reloadRequired: false }
    case 'SEB_PASSWORD_DISABLED': return { message: 'ผู้ดูแลระบบยังไม่เปิดการบันทึกรหัสรายข้อสอบ', reloadRequired: false }
    case 'SEB_PASSWORD_KEYRING_INVALID': return { message: 'ระบบจัดเก็บรหัสยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ', reloadRequired: true }
    case 'SEB_PASSWORD_CONTEXT_INVALID': return { message: 'ข้อมูลคำขอไม่ถูกต้อง กรุณาโหลดหน้านี้ใหม่', reloadRequired: true }
    default: return { message: 'ยังยืนยันผลการบันทึกไม่ได้ กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง', reloadRequired: true }
  }
}

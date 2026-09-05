import 'server-only'

import { createCipheriv, createDecipheriv, createSecretKey, randomBytes, randomUUID, type KeyObject } from 'node:crypto'
import {
  assertSebDraftPassword, assertSebPasswordOwner, nextSebPasswordRevision,
  parseSebPasswordBinding, SebPasswordError,
  type SebPasswordBinding, type SebPasswordOwnerContext,
} from '@/lib/seb-password-policy'

const KEY_ID = /^[a-zA-Z0-9_-]{1,32}$/
const ALGORITHM = 'AES-256-GCM'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

export interface SebPasswordEnvelope {
  readonly version: 1
  readonly algorithm: typeof ALGORITHM
  readonly keyId: string
  readonly iv: string
  readonly tag: string
  readonly ciphertext: string
}

export interface SebPasswordDraft {
  readonly status: 'draft'
  readonly expectedPreviousRevision: number
  readonly binding: SebPasswordBinding
  readonly secret: SebPasswordEnvelope
}

function base64(value: unknown, min: number, max: number): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('invalid encoding')
  const result = Buffer.from(value, 'base64')
  if (result.length < min || result.length > max || result.toString('base64') !== value) {
    throw new Error('invalid size')
  }
  return result
}

function aad(binding: SebPasswordBinding, keyId: string): Buffer {
  // Fixed ordering, version and purpose separate this secret from all other
  // records and from CK/BEK/session-signing keys. No caller-supplied AAD string.
  return Buffer.from(JSON.stringify([
    'korkru:seb-quit-password', 1, ALGORITHM, keyId,
    binding.orgId, binding.teacherId, binding.assignmentId, binding.revisionId, binding.revision,
  ]), 'utf8')
}

/** Key material is supplied explicitly by trusted server code. This class
 * never reads env, writes storage, authenticates a teacher or contacts SEB.
 * Future key management must use a dedicated encryption key, not CK/BEK,
 * SEB_SESSION_SECRET, admin/quit password or a Supabase credential. */
export class SebPasswordVault {
  readonly #keys = new Map<string, KeyObject>()
  readonly #activeKeyId: string

  constructor(activeKeyId: string, keys: Readonly<Record<string, string>>) {
    try {
      if (!KEY_ID.test(activeKeyId) || !keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('keyring')
      const entries = Object.entries(keys)
      if (entries.length < 1 || entries.length > 5) throw new Error('keyring')
      for (const [id, encoded] of entries) {
        if (!KEY_ID.test(id)) throw new Error('keyring')
        const key = base64(encoded, KEY_BYTES, KEY_BYTES)
        try { this.#keys.set(id, createSecretKey(key)) } finally { key.fill(0) }
      }
      if (!this.#keys.has(activeKeyId)) throw new Error('keyring')
      this.#activeKeyId = activeKeyId
    } catch {
      throw new SebPasswordError('SEB_PASSWORD_KEYRING_INVALID')
    }
  }

  seal(password: string, inputBinding: SebPasswordBinding): SebPasswordEnvelope {
    assertSebDraftPassword(password)
    const binding = parseSebPasswordBinding(inputBinding)
    const iv = randomBytes(IV_BYTES)
    const plaintext = Buffer.from(password, 'utf8')
    try {
      const cipher = createCipheriv('aes-256-gcm', this.#keys.get(this.#activeKeyId)!, iv, { authTagLength: TAG_BYTES })
      cipher.setAAD(aad(binding, this.#activeKeyId))
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
      return Object.freeze({
        version: 1, algorithm: ALGORITHM, keyId: this.#activeKeyId,
        iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      })
    } catch {
      throw new SebPasswordError('SEB_PASSWORD_SECRET_UNAVAILABLE')
    } finally {
      plaintext.fill(0)
    }
  }

  /** The expected binding must come from the authorized, versioned record,
   * never from the envelope/client. Returns plaintext only after GCM final()
   * authenticates the tag. Do not return this value to a browser or log it. */
  open(envelope: unknown, expectedBinding: SebPasswordBinding): string {
    let partial: Buffer | undefined
    let final: Buffer | undefined
    try {
      const binding = parseSebPasswordBinding(expectedBinding)
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('envelope')
      const value = envelope as Record<string, unknown>
      if (value.version !== 1 || value.algorithm !== ALGORITHM ||
          typeof value.keyId !== 'string' || !KEY_ID.test(value.keyId)) throw new Error('envelope')
      const key = this.#keys.get(value.keyId)
      if (!key) throw new Error('key unavailable')
      const iv = base64(value.iv, IV_BYTES, IV_BYTES)
      const tag = base64(value.tag, TAG_BYTES, TAG_BYTES)
      const ciphertext = base64(value.ciphertext, 12, 64)
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
      decipher.setAAD(aad(binding, value.keyId))
      decipher.setAuthTag(tag)
      partial = decipher.update(ciphertext)
      final = decipher.final()
      const password = partial.toString('utf8') + final.toString('utf8')
      assertSebDraftPassword(password)
      return password
    } catch {
      // Same sanitized result for wrong teacher/tenant/revision, missing key,
      // corruption or invalid data; no raw crypto error, input or cause.
      throw new SebPasswordError('SEB_PASSWORD_SECRET_UNAVAILABLE')
    } finally {
      partial?.fill(0)
      final?.fill(0)
    }
  }
}

export function prepareSebPasswordDraft(
  context: SebPasswordOwnerContext,
  password: string,
  currentRevision: number,
  expectedPreviousRevision: number,
  vault: SebPasswordVault,
): SebPasswordDraft {
  assertSebPasswordOwner(context)
  const revision = nextSebPasswordRevision(currentRevision, expectedPreviousRevision)
  const binding = parseSebPasswordBinding({
    orgId: context.assignment.org_id, teacherId: context.assignment.created_by,
    assignmentId: context.assignment.id, revisionId: randomUUID(), revision,
  })
  return Object.freeze({
    status: 'draft', expectedPreviousRevision, binding, secret: vault.seal(password, binding),
  })
}

/** A display projection, not persistence acknowledgement or a readiness gate.
 * The private draft/envelope MUST NOT be sent to client components. */
export function sebPasswordDraftSummary(draft: SebPasswordDraft) {
  const binding = parseSebPasswordBinding(draft.binding)
  return Object.freeze({
    revision: binding.revision,
    status: 'draft' as const,
    appliedToSeb: false as const,
    existingSessionsUpdated: false as const,
    requiresNewConfigFile: true as const,
  })
}

import 'server-only'

import { SebPasswordError } from '@/lib/seb-password-policy'
import { SebPasswordVault } from '@/lib/seb-password-vault'

type SebPasswordEnvironment = Readonly<Record<string, string | undefined>>

export function sebPasswordDraftsEnabled(env: SebPasswordEnvironment = process.env): boolean {
  return env.SEB_PASSWORD_DRAFTS_ENABLED === 'true'
}

/** Dedicated deployment secrets only; no reuse of the global SEB/session keys.
 * Read at request time, so disabled/misconfigured deployments build normally. */
export function loadSebPasswordVault(env: SebPasswordEnvironment = process.env): SebPasswordVault {
  try {
    const encoded = env.SEB_PASSWORD_KEYRING
    const active = env.SEB_PASSWORD_ACTIVE_KEY_ID
    if (!encoded || encoded.length > 1024 || !active || active.length > 32) throw new Error('missing')
    const keys: unknown = JSON.parse(encoded)
    if (!keys || typeof keys !== 'object' || Array.isArray(keys) ||
        !Object.values(keys).every(value => typeof value === 'string')) throw new Error('invalid')
    return new SebPasswordVault(active, keys as Record<string, string>)
  } catch {
    throw new SebPasswordError('SEB_PASSWORD_KEYRING_INVALID')
  }
}

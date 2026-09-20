import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

/** 32 bytes of randomness, base64url so it survives a URL and a LINE message. */
const IOC_TOKEN_BYTES = 32

export function generateIocToken(): string {
  return randomBytes(IOC_TOKEN_BYTES).toString('base64url')
}

/** Lowercase hex, matching the `^[0-9a-f]{64}$` check on the column. */
export function hashIocToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex')
}

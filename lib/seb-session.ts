import 'server-only'

import { cookies } from 'next/headers'
import {
  createSebChallengeClaims,
  readSebSessionSecret,
  signSebClaims,
  verifySebClaims,
  type SebChallengePurpose,
  type SebSessionClaims,
} from '@/lib/seb'

export function sebSessionCookieName(assignmentId: string) {
  return `korkru-seb-${assignmentId}`
}

export function createSebChallenge(
  userId: string,
  assignmentId: string,
  configRevision: string,
  assignmentConfigRevision: number,
  purpose: SebChallengePurpose = 'take',
) {
  const sessionSecret = readSebSessionSecret()
  if (!sessionSecret) return null
  return signSebClaims(
    createSebChallengeClaims(
      userId,
      assignmentId,
      configRevision,
      assignmentConfigRevision,
      purpose,
    ),
    sessionSecret,
  )
}

export function validateSebChallenge(
  token: string | undefined,
  userId: string,
  assignmentId: string,
  configRevision: string,
  assignmentConfigRevision: number,
  purpose: SebChallengePurpose = 'take',
) {
  if (!token) return null
  const sessionSecret = readSebSessionSecret()
  if (!sessionSecret) return null
  const claims = verifySebClaims(token, sessionSecret)
  if (
    claims?.kind !== 'seb_challenge'
    || claims.userId !== userId
    || claims.assignmentId !== assignmentId
    || claims.configRevision !== configRevision
    || claims.assignmentConfigRevision !== assignmentConfigRevision
    || claims.purpose !== purpose
  ) return null
  return claims
}

export async function getSebSession(
  userId: string,
  assignmentId: string,
  configRevision: string,
  assignmentConfigRevision: number,
): Promise<SebSessionClaims | null> {
  const sessionSecret = readSebSessionSecret()
  if (!sessionSecret) return null

  const token = (await cookies()).get(sebSessionCookieName(assignmentId))?.value
  if (!token) return null
  const claims = verifySebClaims(token, sessionSecret)

  if (
    claims?.kind !== 'seb_session'
    || claims.userId !== userId
    || claims.assignmentId !== assignmentId
    || claims.configRevision !== configRevision
    || claims.assignmentConfigRevision !== assignmentConfigRevision
  ) return null

  return claims
}

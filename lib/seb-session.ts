import 'server-only'

import { cookies } from 'next/headers'
import {
  createSebChallengeClaims,
  readSebEnvironment,
  signSebClaims,
  verifySebClaims,
  type SebSessionClaims,
} from '@/lib/seb'

export function sebSessionCookieName(assignmentId: string) {
  return `korkru-seb-${assignmentId}`
}

export function createSebChallenge(userId: string, assignmentId: string) {
  const environment = readSebEnvironment()
  if (!environment) return null
  return signSebClaims(
    createSebChallengeClaims(userId, assignmentId),
    environment.sessionSecret,
  )
}

export function validateSebChallenge(
  token: string | undefined,
  userId: string,
  assignmentId: string,
) {
  if (!token) return null
  const environment = readSebEnvironment()
  if (!environment) return null
  const claims = verifySebClaims(token, environment.sessionSecret)
  if (
    claims?.kind !== 'seb_challenge'
    || claims.userId !== userId
    || claims.assignmentId !== assignmentId
  ) return null
  return claims
}

export async function getSebSession(
  userId: string,
  assignmentId: string,
): Promise<SebSessionClaims | null> {
  const environment = readSebEnvironment()
  if (!environment) return null

  const token = (await cookies()).get(sebSessionCookieName(assignmentId))?.value
  if (!token) return null
  const claims = verifySebClaims(token, environment.sessionSecret)

  if (
    claims?.kind !== 'seb_session'
    || claims.userId !== userId
    || claims.assignmentId !== assignmentId
  ) return null

  return claims
}

/**
 * Shape of every invite-link token the database hands out: two random UUIDs
 * with the dashes removed (the column default on classroom_invitations and
 * org_invitations). Anything else cannot match a row, so the server actions
 * turn it away before asking the database.
 */
export function isInviteToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

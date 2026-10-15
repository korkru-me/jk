import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { getManagedProctorAssignment } from './exam-proctor-access.server'
import type { createClient } from './supabase/server'

const assignmentId = '10000000-0000-4000-8000-000000000001'
function client(owner: string, ids: string[] = [], superAdmin = false, error: unknown = null) {
  const builder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: { id: assignmentId, created_by: owner }, error })) }
  const rpc = vi.fn(async (name: string) => ({ data: name === 'is_super_admin' ? superAdmin : ids, error: null }))
  return { builder, rpc, db: { from: vi.fn(() => builder), rpc } as unknown as Awaited<ReturnType<typeof createClient>> }
}

describe('live-room evidence authorization', () => {
  it('rejects a readable assignment when the user cannot manage that exact exam', async () => {
    const { db } = client('other-owner', ['another-exam'])
    expect(await getManagedProctorAssignment(db, 'student', assignmentId)).toBeNull()
  })
  it('allows its owner, exact manage co-teacher and configured super admin', async () => {
    expect(await getManagedProctorAssignment(client('owner').db, 'owner', assignmentId)).not.toBeNull()
    expect(await getManagedProctorAssignment(client('owner', [assignmentId]).db, 'co-teacher', assignmentId)).not.toBeNull()
    expect(await getManagedProctorAssignment(client('owner', [], true).db, 'super-admin', assignmentId)).not.toBeNull()
  })
  it('fails closed on assignment query errors', async () => {
    const { db, rpc } = client('owner', [], false, { code: '42501' })
    expect(await getManagedProctorAssignment(db, 'owner', assignmentId)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})

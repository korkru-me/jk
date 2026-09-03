import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { runMathWorkOrphanCleanup } from '@/lib/math-work-cleanup-server'

const STUDENT_ID = '11111111-1111-4111-8111-111111111111'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
const ANSWER_ID = '33333333-3333-4333-8333-333333333333'
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'
const QUESTION_ID = '66666666-6666-4666-8666-666666666666'
const studentPreview = `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/preview.webp`
const teacherScene = `teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/5/${UPLOAD_ID}/scene.json`
const old = '2026-08-01T00:00:00.000Z'
const now = Date.parse('2026-09-03T12:00:00.000Z')

interface StoredFixture {
  path: string
  size: number
  createdAt: string | null
}

function adminFixture({
  files,
  referenced = new Set<string>(),
  failReferences = false,
  failReferenceQueryAt,
}: {
  files: StoredFixture[]
  referenced?: Set<string>
  failReferences?: boolean
  failReferenceQueryAt?: number
}) {
  const remove = vi.fn(async () => ({ data: [], error: null }))
  const referenceQueries: Array<{ table: string; column: string; paths: string[] }> = []

  const list = vi.fn(async (folder: string, options: { offset?: number; limit?: number }) => {
    const prefix = `${folder}/`
    const children = new Map<string, StoredFixture | null>()
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue
      const rest = file.path.slice(prefix.length)
      const [name, ...tail] = rest.split('/')
      if (!name) continue
      children.set(name, tail.length === 0 ? file : null)
    }
    const entries = [...children.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, file]) => (
      file
        ? { id: `object:${file.path}`, name, metadata: { size: file.size }, created_at: file.createdAt, updated_at: file.createdAt }
        : { id: null, name, metadata: null, created_at: null, updated_at: null }
    ))
    const offset = options.offset ?? 0
    const limit = options.limit ?? 100
    return { data: entries.slice(offset, offset + limit), error: null }
  })

  const admin = {
    storage: { from: vi.fn(() => ({ list, remove })) },
    from: vi.fn((table: string) => ({
      select: (column: string) => ({
        in: async (_column: string, paths: string[]) => {
          referenceQueries.push({ table, column, paths })
          if (failReferences || referenceQueries.length === failReferenceQueryAt) {
            return { data: null, error: { message: 'fixture failure' } }
          }
          return {
            data: paths.filter(path => referenced.has(path)).map(path => ({ [column]: path })),
            error: null,
          }
        },
      }),
    })),
  }
  return { admin, list, remove, referenceQueries }
}

describe('scheduled math-work cleanup', () => {
  beforeEach(() => mocks.createAdminClient.mockReset())

  it('reports old unreferenced objects without deleting in dry-run mode', async () => {
    const fixture = adminFixture({ files: [{ path: studentPreview, size: 123, createdAt: old }] })
    mocks.createAdminClient.mockReturnValue(fixture.admin)

    const result = await runMathWorkOrphanCleanup({ dryRun: true, now })

    expect(result).toMatchObject({ dryRun: true, scannedObjects: 1, eligibleAfterGrace: 1, deleted: 0 })
    expect(fixture.referenceQueries).toHaveLength(4)
    expect(fixture.remove).not.toHaveBeenCalled()
  })

  it('rechecks both reference tables immediately before deleting', async () => {
    const fixture = adminFixture({
      files: [
        { path: studentPreview, size: 123, createdAt: old },
        { path: teacherScene, size: 456, createdAt: old },
      ],
      referenced: new Set([teacherScene]),
    })
    mocks.createAdminClient.mockReturnValue(fixture.admin)

    const result = await runMathWorkOrphanCleanup({ now })

    expect(result).toMatchObject({ eligibleAfterGrace: 1, keptReferenced: 1, deleted: 1, deletedBytes: 123 })
    expect(fixture.referenceQueries).toHaveLength(8)
    expect(fixture.remove).toHaveBeenCalledWith([studentPreview])
  })

  it('fails closed before deletion when any reference query is incomplete', async () => {
    const fixture = adminFixture({
      files: [{ path: studentPreview, size: 123, createdAt: old }],
      failReferences: true,
    })
    mocks.createAdminClient.mockReturnValue(fixture.admin)

    await expect(runMathWorkOrphanCleanup({ now })).rejects.toMatchObject({
      code: 'reference_scan_failed',
    })
    expect(fixture.remove).not.toHaveBeenCalled()
  })

  it('finishes the second full reference scan before the first delete', async () => {
    const fixture = adminFixture({
      files: [{ path: studentPreview, size: 123, createdAt: old }],
      failReferenceQueryAt: 5,
    })
    mocks.createAdminClient.mockReturnValue(fixture.admin)

    await expect(runMathWorkOrphanCleanup({ now })).rejects.toMatchObject({
      code: 'reference_scan_failed',
    })
    expect(fixture.referenceQueries).toHaveLength(5)
    expect(fixture.remove).not.toHaveBeenCalled()
  })
})

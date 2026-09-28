import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../supabase/migrations/20260922005743_gate_exam_attachment_writes.sql', import.meta.url),
  'utf8',
)
const cleanupAction = readFileSync(
  new URL('./actions/storage-cleanup.ts', import.meta.url),
  'utf8',
)

describe('exam attachment write-policy migration', () => {
  it('removes direct writes only from the two legacy exam buckets', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "work_images_owner_insert"')
    expect(sql).toContain('DROP POLICY IF EXISTS "work_images_owner_delete"')
    expect(sql).toContain('DROP POLICY IF EXISTS "submission_files_owner_insert"')
    expect(sql).toContain('DROP POLICY IF EXISTS "submission_files_owner_delete"')
    expect(sql).not.toContain('student_work_artifacts')
    expect(sql).not.toMatch(/DROP POLICY[^;]+SELECT/i)
  })

  it('keeps authenticated orphan cleanup working through the server role', () => {
    expect(cleanupAction).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(cleanupAction).toContain('listFolder(admin, bucket, user.id)')
    expect(cleanupAction).toContain('admin.storage.from(bucket).remove')
  })
})

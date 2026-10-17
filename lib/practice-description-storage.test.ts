import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sanitizeRichTextForStorage } from './rich-text-sanitize'

const cleanupAction = readFileSync(
  new URL('./actions/storage-cleanup.ts', import.meta.url),
  'utf8',
)

describe('practice library rich description storage', () => {
  it('removes active content before a practice description is persisted', () => {
    const clean = sanitizeRichTextForStorage(
      '<p><strong>อ่านก่อนฝึก</strong><script>alert(1)</script><img src="x" onerror="alert(2)"></p>',
    )

    expect(clean).toContain('<strong>อ่านก่อนฝึก</strong>')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('src="x"')
  })

  it('keeps practice announcement images in the fail-closed orphan reference scan', () => {
    expect(cleanupAction).toContain(".from('practice_libraries')")
    expect(cleanupAction).toContain(".like('description', `%question-images/${ownerId}/%`)")
  })
})

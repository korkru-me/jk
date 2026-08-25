/**
 * The stored form of a question's content fingerprint.
 *
 * `questionFingerprint()` already produces a stable string standing for one
 * question's content. That string embeds the whole question body, which is fine
 * to hold in memory for a moment and far too big to index, so what the database
 * keeps is a hash of it.
 *
 * Why this lives in TypeScript rather than in a trigger: the canonical form
 * sorts object keys, drops the `id` fields the browser mints for choices, and
 * collapses empty string/array/object/null into a single "not set". Restating
 * those rules in plpgsql would give the project two definitions of "the same
 * question" that drift apart the first time either side is touched. The write
 * paths call this instead, and `scripts/backfill-content-fingerprint.mjs`
 * catches up anything written before the column existed.
 */
import { createHash } from 'node:crypto'

import { questionFingerprint, type FingerprintableContent } from '@/lib/question-content-match'

/** The hash stored in `questions.content_fingerprint`. */
export function contentFingerprint(content: FingerprintableContent): string {
  return createHash('sha256').update(questionFingerprint(content)).digest('hex')
}

/**
 * Stamps a question row being inserted or updated with its fingerprint.
 *
 * Written as a wrapper around the payload rather than a separate assignment so
 * that a new write path cannot set the content and forget the fingerprint: the
 * two travel together or not at all.
 */
export function withContentFingerprint<T extends FingerprintableContent>(
  payload: T,
): T & { content_fingerprint: string } {
  return { ...payload, content_fingerprint: contentFingerprint(payload) }
}

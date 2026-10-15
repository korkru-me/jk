import 'server-only'
import type { Question } from '@/lib/types'
import { buildPracticeQuestionVariant, practiceQuestionRevision, practiceVariantChangesOnRefresh } from '@/lib/practice-question-variant.server'
import { createPracticeVariantNonce, derivePracticeVariantSeed, practiceVariantSecret, signPracticeVariantReceipt } from '@/lib/practice-variant.server'
import type { PracticeRunQuestion } from '@/lib/practice-run'
import type { StudentPracticeLibrary } from '@/lib/practice-question-access.server'
import { sameRandomValues, type RandomValues } from '@/lib/math/fresh-random-values'
import { drawsRandomValues } from '@/lib/math/shared-random'

/** Caller verifies actor, exact question access and the access-code session before invoking. */
export function preparePracticeRunQuestion(actorId: string, library: StudentPracticeLibrary, question: Question, previousValues?: RandomValues): PracticeRunQuestion | null {
  const secret = practiceVariantSecret(process.env)
  if (!secret) return null
  const identity = { actorId, libraryId: library.id, questionId: question.id, questionRevision: practiceQuestionRevision(question, library.shuffleOptions) }
  for (let attempt = 0; attempt < (previousValues ? 128 : 12); attempt += 1) {
    const nonce = createPracticeVariantNonce()
    const seed = derivePracticeVariantSeed(identity, nonce, secret)
    try {
      const variant = buildPracticeQuestionVariant(question, seed, library.shuffleOptions)
      if (previousValues && drawsRandomValues(question) && sameRandomValues(previousValues, variant.safeQuestion.random_values)) continue
      return {
        question: variant.safeQuestion,
        variantReceipt: signPracticeVariantReceipt(identity, nonce, secret),
        changesOnRefresh: practiceVariantChangesOnRefresh(question, library.shuffleOptions),
        calculatorEnabled: library.calculatorEnabled,
        scratchpadEnabled: library.scratchpadEnabled,
      }
    } catch { /* Invalid formula draws are retried without rendering or signing them. */ }
  }
  return null
}

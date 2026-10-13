'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { buildAnswerFeedback } from '@/lib/answer-feedback'
import { gradeAnswer } from '@/lib/assignment-attempt'
import { parseMathInputModes } from '@/lib/math/input-mode'
import {
  parseRecordPracticeAnswerAttemptInput,
  toRecordPracticeAnswerAttemptRpcArgs,
} from '@/lib/practice-library-contracts'
import {
  isPracticeLibraryEnabled,
  toPracticeFeedback,
  validatedPracticeAnswer,
  type PracticeFeedback,
} from '@/lib/practice-question'
import {
  loadPracticeQuestionForStudent,
  PRACTICE_STORAGE,
} from '@/lib/practice-question-access.server'
import { hasPracticeAccessSession } from '@/lib/practice-access-session.server'
import {
  buildPracticeQuestionVariant,
  practiceQuestionRevision,
} from '@/lib/practice-question-variant.server'
import {
  practiceVariantSecret,
  verifyPracticeVariantReceipt,
} from '@/lib/practice-variant.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const checkSchema = z.object({
  libraryId: z.string().uuid(),
  questionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  variantReceipt: z.string().min(1).max(4096),
  answer: z.string().max(64 * 1024),
  mathInputModes: z.unknown(),
}).strict()

export type PracticeAnswerResult =
  | { ok: true; feedback: PracticeFeedback }
  | { ok: false; error: string; retryable?: boolean; refreshRequired?: boolean }

const GENERIC_ERROR = 'ยังตรวจคำตอบไม่ได้ กรุณาลองอีกครั้ง'

function safeAdminClient(): ReturnType<typeof createAdminClient> | null {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null
    }
    return createAdminClient()
  } catch {
    return null
  }
}

/**
 * Grades one ephemeral practice answer in memory. The only write contains
 * actor/library/question/idempotency metadata; the answer, verdict, and score
 * are deliberately absent from both the RPC arguments and durable storage.
 */
export async function checkPracticeAnswer(input: unknown): Promise<PracticeAnswerResult> {
  if (!isPracticeLibraryEnabled(process.env)) return { ok: false, error: GENERIC_ERROR }
  const parsed = checkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'ข้อมูลคำตอบไม่ถูกต้อง กรุณาลองกรอกใหม่' }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { ok: false, error: 'กรุณาเข้าสู่ระบบอีกครั้ง' }

    const secret = practiceVariantSecret(process.env)
    if (!secret) return { ok: false, error: GENERIC_ERROR, retryable: true }
    const access = await loadPracticeQuestionForStudent(
      user.id,
      parsed.data.libraryId,
      parsed.data.questionId,
    )
    if (access.status !== 'ready') return { ok: false, error: GENERIC_ERROR }
    if (access.library.requiresAccessCode
      && !await hasPracticeAccessSession(user.id, parsed.data.libraryId)) {
      return { ok: false, error: 'กรุณากรอกรหัสผ่านเข้าคลังฝึกอีกครั้ง', refreshRequired: true }
    }

    const receipt = verifyPracticeVariantReceipt(
      parsed.data.variantReceipt,
      {
        actorId: user.id,
        libraryId: parsed.data.libraryId,
        questionId: parsed.data.questionId,
        questionRevision: practiceQuestionRevision(access.question, access.library.shuffleOptions),
      },
      secret,
    )
    if (!receipt) {
      return {
        ok: false,
        error: 'โจทย์ชุดนี้หมดอายุแล้ว กรุณาโหลดโจทย์ใหม่',
        retryable: false,
        refreshRequired: true,
      }
    }

    const answer = validatedPracticeAnswer(access.question, parsed.data.answer)
    if (answer === null) return { ok: false, error: 'กรุณาตอบอย่างน้อยหนึ่งช่องก่อนตรวจ' }
    const mathInputModes = parseMathInputModes(parsed.data.mathInputModes)
    if (mathInputModes === null) return { ok: false, error: 'โหมดหน่วยมุมไม่ถูกต้อง กรุณาลองใหม่' }
    let variant: ReturnType<typeof buildPracticeQuestionVariant>
    try {
      variant = buildPracticeQuestionVariant(
        access.question,
        receipt.seed,
        access.library.shuffleOptions,
      )
    } catch {
      return {
        ok: false,
        error: 'โจทย์ชุดนี้ตรวจไม่ได้ กรุณาโหลดโจทย์ชุดใหม่',
        retryable: false,
        refreshRequired: true,
      }
    }
    const graded = gradeAnswer({
      id: access.question.id,
      correct_answer: variant.correctAnswer,
      student_answer: answer,
      math_input_modes: mathInputModes,
      max_score: variant.maxScore,
      questions: {
        question_type: access.question.question_type,
        answer_tolerance: access.question.answer_tolerance ?? 0.1,
        answer_parts: access.question.answer_parts,
        extra_data: access.question.extra_data,
      },
    })
    const feedback = toPracticeFeedback(buildAnswerFeedback({
      correct_answer: variant.correctAnswer,
      student_answer: answer,
      math_input_modes: mathInputModes,
      question: {
        question_type: access.question.question_type,
        answer_unit: access.question.answer_unit,
        answer_parts: access.question.answer_parts?.map(part => ({
          id: part.id,
          sub_text: part.sub_text,
          unit: part.unit,
          tolerance: part.tolerance,
          formula: '',
        })) ?? null,
        answer_tolerance: access.question.answer_tolerance,
        // The frozen correctAnswer already carries every key the feedback
        // builder needs. Use the student-safe config for labels and choices so
        // a private image-point label or future answer-bearing field cannot
        // slip into an explicit feedback row when revealAnswerKey is false.
        extra_data: variant.safeQuestion.questions.extra_data,
        mcq_options: variant.safeQuestion.questions.mcq_options,
      },
      isCorrect: graded.is_correct,
      score: graded.score,
      maxScore: variant.maxScore,
      revealAnswerKey: access.library.revealAnswerKey,
    }), variant.safeQuestion.questions)

    const metadata = parseRecordPracticeAnswerAttemptInput({
      library_id: parsed.data.libraryId,
      question_id: parsed.data.questionId,
      idempotency_key: parsed.data.idempotencyKey,
    })
    const admin = safeAdminClient()
    if (!admin) return { ok: false, error: GENERIC_ERROR, retryable: true }
    // This is intentionally the complete RPC payload. Never add the browser's
    // answer, the grade result, the answer key, or a client-provided time.
    const rpc = await admin.rpc(
      PRACTICE_STORAGE.recordAttemptRpc,
      toRecordPracticeAnswerAttemptRpcArgs(user.id, metadata),
    )
    if (rpc.error) return { ok: false, error: GENERIC_ERROR, retryable: true }
    const result = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
    if (!result || typeof result !== 'object'
      || result.library_id !== metadata.library_id
      || result.student_id !== user.id
      || result.question_id !== metadata.question_id
      || result.idempotency_key !== metadata.idempotency_key
      || typeof result.created !== 'boolean') {
      return { ok: false, error: GENERIC_ERROR, retryable: true }
    }

    revalidatePath(`/practice/${parsed.data.libraryId}`)
    revalidatePath(`/practice/${parsed.data.libraryId}/library`)
    return { ok: true, feedback }
  } catch {
    return { ok: false, error: GENERIC_ERROR, retryable: true }
  }
}

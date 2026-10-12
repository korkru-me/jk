import { notFound, redirect } from 'next/navigation'
import { PracticeAccessState } from '@/components/practice/practice-access-state'
import { PracticeQuestionRunner } from '@/components/practice/practice-question-runner'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadPracticeQuestionForStudent } from '@/lib/practice-question-access.server'
import { buildPracticeSearchHref, parsePracticeSearchParams } from '@/lib/practice-search'
import {
  buildPracticeQuestionVariant,
  practiceQuestionRevision,
  practiceVariantChangesOnRefresh,
} from '@/lib/practice-question-variant.server'
import {
  createPracticeVariantNonce,
  derivePracticeVariantSeed,
  practiceVariantSecret,
  signPracticeVariantReceipt,
} from '@/lib/practice-variant.server'

export const metadata = { title: 'ฝึกทำโจทย์ — KorKru' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function StudentPracticeQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; questionId: string }>
  searchParams: Promise<SearchParams>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const [{ id, questionId }, rawSearch] = await Promise.all([params, searchParams])
  const returnHref = `${buildPracticeSearchHref(id, parsePracticeSearchParams(rawSearch))}#practice-question-${encodeURIComponent(questionId)}`
  const access = await loadPracticeQuestionForStudent(user.id, id, questionId)

  if (access.status !== 'ready') {
    if (access.status === 'unsupported') {
      return <PracticeAccessState kind="unsupported" returnHref={returnHref} />
    }
    if (access.status === 'unavailable') {
      return <PracticeAccessState kind="unavailable" returnHref={returnHref} />
    }
    notFound()
  }

  const secret = practiceVariantSecret(process.env)
  if (!secret) return <PracticeAccessState kind="unavailable" returnHref={returnHref} />
  const identity = {
    actorId: user.id,
    libraryId: id,
    questionId,
    questionRevision: practiceQuestionRevision(access.question),
  }
  let seed: number | null = null
  let nonce: string | null = null
  let variant: ReturnType<typeof buildPracticeQuestionVariant> | null = null
  // A syntactically valid random formula may be undefined for one particular
  // draw (for example division by zero). Never sign or render that variant.
  for (let attempt = 0; attempt < 12 && !variant; attempt += 1) {
    const candidateNonce = createPracticeVariantNonce()
    const candidateSeed = derivePracticeVariantSeed(identity, candidateNonce, secret)
    try {
      variant = buildPracticeQuestionVariant(access.question, candidateSeed)
      seed = candidateSeed
      nonce = candidateNonce
    } catch {
      // Try another ephemeral seed; nothing has been persisted or exposed.
    }
  }
  if (!variant || seed === null || nonce === null) {
    return <PracticeAccessState kind="unavailable" returnHref={returnHref} />
  }
  const variantReceipt = signPracticeVariantReceipt(identity, nonce, secret)

  return (
    <PracticeQuestionRunner
      key={variantReceipt}
      libraryId={id}
      libraryTitle={access.library.title}
      question={variant.safeQuestion}
      variantReceipt={variantReceipt}
      returnHref={returnHref}
      changesOnRefresh={practiceVariantChangesOnRefresh(access.question)}
    />
  )
}

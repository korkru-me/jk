import { notFound, redirect } from 'next/navigation'
import { PracticeAccessState } from '@/components/practice/practice-access-state'
import { PracticeSingleQuestionRunner } from '@/components/practice/practice-single-question-runner'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadPracticeQuestionForStudent } from '@/lib/practice-question-access.server'
import { buildPracticeSearchHref, parsePracticeSearchParams } from '@/lib/practice-search'
import { preparePracticeRunQuestion } from '@/lib/practice-run.server'
import { hasPracticeAccessSession } from '@/lib/practice-access-session.server'

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
  if (access.library.requiresAccessCode
    && !await hasPracticeAccessSession(user.id, id)) redirect(`/practice/${id}`)

  const prepared = preparePracticeRunQuestion(user.id, access.library, access.question)
  if (!prepared) return <PracticeAccessState kind="unavailable" returnHref={returnHref} />

  return (
    <PracticeSingleQuestionRunner
      key={prepared.variantReceipt}
      libraryId={id}
      libraryTitle={access.library.title}
      initial={prepared}
      returnHref={returnHref}
      storageOwnerId={user.id}
    />
  )
}

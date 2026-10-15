import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { hasPracticeAccessSession } from '@/lib/practice-access-session.server'
import { loadPracticeLibraryWaiting, loadPracticeLibraryLocalSnapshot } from '@/lib/practice-question-access.server'
import { loadPracticeExercises } from '@/lib/practice-exercises.server'
import { isLocalPracticeReviewEnabled } from '@/lib/practice-local-review'
import { isUuid } from '@/lib/practice-library-contracts'
import { PracticeExerciseRunner } from '@/components/practice/practice-exercise-runner'
import { PracticeAccessState } from '@/components/practice/practice-access-state'

export const metadata = { title: 'แบบฝึกหัดของฉัน — KorKru' }

export default async function PracticeExerciseTakePage({ params }: { params: Promise<{ id: string; exerciseId: string }> }) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const { id, exerciseId } = await params
  if (!isUuid(id) || !isUuid(exerciseId)) notFound()
  const access = await loadPracticeLibraryWaiting(user.id, id)
  if (access.status !== 'ready') {
    if (access.status === 'unavailable') return <PracticeAccessState kind="unavailable" returnHref={`/practice/${id}`} />
    notFound()
  }
  if (access.library.requiresAccessCode && !await hasPracticeAccessSession(user.id, id)) redirect(`/practice/${id}`)
  const returnHref = `/practice/${id}/library`
  if (isLocalPracticeReviewEnabled(process.env)) {
    const snapshot = await loadPracticeLibraryLocalSnapshot(user.id, id, { q: '', tags: [], page: 1, ignoredTagCount: 0 })
    if (snapshot.status !== 'ready') return <PracticeAccessState kind="unavailable" returnHref={returnHref} />
    return <PracticeExerciseRunner key={`${user.id}:${id}:${exerciseId}`} library={access.library} exerciseId={exerciseId} storageOwnerId={user.id} localItems={snapshot.items} localReview returnHref={returnHref} />
  }
  const groups = await loadPracticeExercises(user.id, id)
  if (!groups.ready) return <PracticeAccessState kind="unavailable" returnHref={returnHref} />
  const exercise = groups.exercises.find(group => group.id === exerciseId)
  if (!exercise) notFound()
  return <PracticeExerciseRunner key={`${user.id}:${id}:${exerciseId}`} library={access.library} exerciseId={exerciseId} storageOwnerId={user.id} exercise={exercise} returnHref={returnHref} />
}

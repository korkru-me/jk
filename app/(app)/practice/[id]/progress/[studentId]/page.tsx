import { notFound, redirect } from 'next/navigation'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { buildPracticeProgressHref, parsePracticeProgressSearchParams } from '@/lib/practice-progress'

export default async function PracticeStudentProgressPage({ params, searchParams }: {
  params: Promise<{ id: string; studentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const [{ id, studentId }, search] = await Promise.all([params, searchParams])
  const state = parsePracticeProgressSearchParams(search)
  redirect(buildPracticeProgressHref(id, studentId, state, state.page))
}

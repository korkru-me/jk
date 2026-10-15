import { notFound, redirect } from 'next/navigation'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { practiceManagementHref } from '@/lib/practice-management'

/** Retain old teacher bookmarks; the destination performs exact-resource authorization. */
export default async function PracticeProgressPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const { id } = await params
  redirect(practiceManagementHref(id, 'progress'))
}

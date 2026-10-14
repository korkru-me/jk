import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'

// Keep existing bookmarks and result-page return links useful after merging
// the student landing pages. Authentication still precedes navigation.
export default async function MySubmissionsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  redirect('/dashboard#work-summary')
}

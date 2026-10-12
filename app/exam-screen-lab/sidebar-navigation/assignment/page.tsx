import { SidebarNavigationLabTarget } from '../_components/sidebar-navigation-lab-client'

export default async function SidebarNavigationLabTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ classroom?: string; plain?: string }>
}) {
  const params = await searchParams
  // Deliberately expose the real Next.js loading boundary for local QA.
  await new Promise(resolve => setTimeout(resolve, 4000))
  return <SidebarNavigationLabTarget classroomId={params.classroom} plain={params.plain === '1'} />
}

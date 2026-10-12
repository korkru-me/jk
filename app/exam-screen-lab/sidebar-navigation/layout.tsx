import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { SidebarNavigationLabShell } from './_components/sidebar-navigation-lab-client'

export const dynamic = 'force-dynamic'

export default function SidebarNavigationLabLayout({ children }: { children: React.ReactNode }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <SidebarNavigationLabShell>{children}</SidebarNavigationLabShell>
}

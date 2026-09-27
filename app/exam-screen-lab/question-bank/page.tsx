import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { QuestionBankLabClient } from './_components/question-bank-lab-client'

export const metadata = { title: 'ห้องทดลองคลังโจทย์ — KorKru' }
export const dynamic = 'force-dynamic'

/**
 * Local/Staging-only workbench for the คลังโจทย์ list on synthetic โจทย์ —
 * built for the ดูเฉลย button, whose เฉลย come from memory instead of the
 * database, so nobody has to sign in. `?fail=1` makes every เฉลย fail to load.
 * Production receives a 404.
 */
export default async function QuestionBankLabPage({
  searchParams,
}: {
  searchParams: Promise<{ fail?: string | string[] }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { fail } = await searchParams
  return <QuestionBankLabClient failLoads={fail === '1'} />
}

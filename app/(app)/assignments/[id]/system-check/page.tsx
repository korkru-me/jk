import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSebSystemCheckData } from '@/lib/actions/seb'
import { SebSystemCheck } from '@/components/exam/seb-system-check'

export const metadata = { title: 'ตรวจเครื่อง Safe Exam Browser — KorKru' }

export default async function SebSystemCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sebChallenge?: string | string[] }>
}) {
  const { id } = await params
  const rawChallenge = (await searchParams).sebChallenge
  const sebChallenge = typeof rawChallenge === 'string' ? rawChallenge : undefined
  const result = await getSebSystemCheckData(id, sebChallenge)

  if ('unauthenticated' in result && result.unauthenticated) redirect('/login')

  if ('error' in result) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <p className="mb-4 text-4xl">⚠️</p>
        <p className="text-lg font-semibold text-foreground">{result.error}</p>
        <Link href="/assignments" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← กลับรายการข้อสอบ
        </Link>
      </div>
    )
  }

  if (result.challenge && result.challenge !== sebChallenge) {
    redirect(`/assignments/${id}/system-check?sebChallenge=${encodeURIComponent(result.challenge)}`)
  }

  return (
    <SebSystemCheck
      assignmentId={id}
      assignmentTitle={result.assignmentTitle}
      challenge={result.challenge ?? ''}
      configured={result.sebConfigured}
      configUrl={process.env.NEXT_PUBLIC_SEB_CONFIG_URL?.trim() || null}
    />
  )
}

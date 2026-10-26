import { notFound } from 'next/navigation'
import { LibraryPanel } from '@/app/(app)/questions/sets/_components/library-panel'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { readQuestionSort } from '@/lib/question-sort'
import type { LibraryScope } from '@/app/(app)/questions/sets/page'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ทดลองค้นหาโจทย์ — KorKru' }

// Empty synthetic results with a synthetic inventory count to keep the toolbar visible.
// No database reads, question content or mutation targets.
export default async function QuestionSearchLab({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const params = await searchParams
  const search = typeof params.uq === 'string' ? params.uq : ''
  const scope: LibraryScope = params.qscope === 'all' ? { kind: 'all' } : { kind: 'unfiled' }
  return <main className="flex min-w-0 flex-col gap-3 p-4">
    <p className="text-sm text-muted-foreground">ตัวอย่างค้นหาคลังโจทย์ — ไม่มีข้อมูลจริง</p>
    <p data-committed-search className="text-sm">คำค้นที่ส่งแล้ว: {search || 'ยังไม่ระบุ'}</p>
    <LibraryPanel library={{ questions: [], groups: [], groupCounts: { tag: 0, title: 0, content: 0 }, total: 0, page: 1 }}
      scope={scope} search={search} match="all" sort={readQuestionSort(params, 'u')} perPage={24}
      unfiledTotal={0} ownQuestionTotal={1} sets={[]} setMemberships={{}} allTags={[]} subQuestionCounts={{}} />
  </main>
}

import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { LibraryPanel } from '@/app/(app)/questions/sets/_components/library-panel'
import { DEFAULT_QUESTION_SORT } from '@/lib/question-sort'
import type { UnfiledQuestion } from '@/app/(app)/questions/sets/page'

export const dynamic = 'force-dynamic'

/** Synthetic UI fixture only; no account or database reads during rendering. */
export default function QuestionLibraryBulkLab() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const questions: UnfiledQuestion[] = Array.from({ length: 4 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    title: `โจทย์ตัวอย่าง ${i + 1}`, question_text: '<p>โจทย์สังเคราะห์สำหรับตรวจหน้าจอ</p>',
    question_type: 'mcq', difficulty: 'medium', tags: [], subject: 'ฟิสิกส์',
    group_id: null, order_in_group: null, question_categories: null,
  }))
  return <main className="p-3">
    <h1 className="text-lg font-semibold">ห้องทดลองปุ่มจัดการโจทย์ · ข้อมูลสังเคราะห์</h1>
    <LibraryPanel library={{ questions, groups: [], groupCounts: { tag: 0, title: 0, content: 0 }, total: 4, page: 1 }}
      scope={{ kind: 'all' }} search="" match="all" sort={DEFAULT_QUESTION_SORT} perPage={24}
      unfiledTotal={4} ownQuestionTotal={4} sets={[]} setMemberships={{}} allTags={[]} subQuestionCounts={{}} />
  </main>
}

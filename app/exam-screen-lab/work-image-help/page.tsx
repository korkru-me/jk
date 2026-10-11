import { notFound } from 'next/navigation'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { Card } from '@/components/ui/card'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

export const metadata = { title: 'ห้องทดลองตัวช่วยแนบรูปวิธีทำ — KorKru' }
export const dynamic = 'force-dynamic'

export default function WorkImageHelpLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <Card padding="lg">
        <QuestionPreviewContent
          questionType="written"
          questionText="วัตถุมวล 2 กิโลกรัม เคลื่อนที่ด้วยความเร่ง 5 เมตรต่อวินาทีกำลังสอง จงหาแรงลัพธ์"
          isRandom={false}
          variables={[]}
          answerParts={[
            { id: 'force', sub_text: 'แรงลัพธ์', formula: '10', unit: 'N', tolerance: 0.01 },
          ]}
        />
      </Card>
    </main>
  )
}

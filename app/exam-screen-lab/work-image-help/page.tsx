import { notFound } from 'next/navigation'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { Card } from '@/components/ui/card'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { PreviewPanel } from '@/components/questions/formula-editor/preview-panel'

export const metadata = { title: 'ห้องทดลองตัวช่วยแนบรูปวิธีทำ — KorKru' }
export const dynamic = 'force-dynamic'

export default async function WorkImageHelpLabPage({ searchParams }: { searchParams: Promise<{ random?: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const random = (await searchParams).random === '1'
  const variables = random ? [{ name: 'm', min: 1, max: 9, step: 1 }, { name: 'a', min: 1, max: 9, step: 1 }] : []

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <Card padding="lg" data-random-preview-lab>
        <QuestionPreviewContent
          questionType="written"
          questionText={random ? 'วัตถุมวล {m} กิโลกรัม เคลื่อนที่ด้วยความเร่ง {a} เมตรต่อวินาทีกำลังสอง จงหาแรงลัพธ์' : 'วัตถุมวล 2 กิโลกรัม เคลื่อนที่ด้วยความเร่ง 5 เมตรต่อวินาทีกำลังสอง จงหาแรงลัพธ์'}
          isRandom={random}
          variables={variables}
          answerParts={[
            { id: 'force', sub_text: 'แรงลัพธ์', formula: random ? 'm * a' : '10', unit: 'N', tolerance: 0.01 },
          ]}
        />
      </Card>
      {random && <PreviewPanel formula="m * a" variables={variables} unit="N" />}
    </main>
  )
}

import { StudentLibraryLab } from './_components/student-library-lab'
import { notFound } from 'next/navigation'
import { PracticeLibraryForm } from '@/app/(app)/practice/_components/practice-library-form'
import { PracticeWaitingRoom } from '@/components/practice/practice-waiting-room'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import type { BankQuestion } from '@/lib/question-bank'
import type { AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'

export const metadata = { title: 'ทดลองคลังฝึก — KorKru' }
export const dynamic = 'force-dynamic'

const questions: BankQuestion[] = [
  {
    id: '00000000-0000-4000-8200-000000000001',
    title: 'แรงลัพธ์บนพื้นเอียง',
    question_text: '<p>จงหาแรงลัพธ์ของวัตถุบนพื้นเอียง</p>',
    question_type: 'written',
    difficulty: 'medium',
    subject: 'ฟิสิกส์',
    tags: ['สอวน.ค่าย 1', 'นิวตัน'],
    sub_question_count: 1,
    default_points: 1,
    has_random_values: true,
  },
  {
    id: '00000000-0000-4000-8200-000000000002',
    title: 'สนามไฟฟ้าระหว่างประจุ',
    question_text: '<p>สนามไฟฟ้าที่จุดกึ่งกลางมีค่าเท่าใด</p>',
    question_type: 'mcq',
    difficulty: 'hard',
    subject: 'ฟิสิกส์',
    tags: ['สอวน.ค่าย 1', 'ไฟฟ้า'],
    sub_question_count: 1,
    default_points: 1,
    has_random_values: false,
  },
  {
    id: '00000000-0000-4000-8200-000000000003',
    title: 'แรงลอยตัวของวัตถุ',
    question_text: '<p>วัตถุจมลงในของเหลวจะมีแรงลอยตัวเท่าใด</p>',
    question_type: 'written',
    difficulty: 'easy',
    subject: 'ฟิสิกส์',
    tags: ['สอวน.ค่าย 2', 'ของไหล'],
    sub_question_count: 1,
    default_points: 1,
    has_random_values: false,
  },
]

const questionSets: AssignmentQuestionSetOption[] = [
  {
    id: '00000000-0000-4000-8400-000000000001',
    title: 'สอวน. ฟิสิกส์ ค่าย 1–2',
    description: 'โจทย์กลศาสตร์ ไฟฟ้า และของไหลสำหรับฝึกคัดเลือก',
    question_ids: questions.map(question => question.id),
    sections: [
      {
        id: 'mechanics',
        title: 'กลศาสตร์',
        question_ids: [questions[0].id, questions[2].id],
      },
      {
        id: 'electricity',
        title: 'ไฟฟ้า',
        question_ids: [questions[1].id],
      },
    ],
  },
]

export default async function PracticeLibraryLabPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>
}) {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  const { view } = await searchParams

  if (view === 'student' || view === 'local-student') return <main className="p-4 sm:p-6">
    <p className="mb-4 text-xs text-muted-foreground">ห้องทดลองคลังฝึกนักเรียน · ข้อมูลจำลอง · ไม่อ่านหรือบันทึกฐานข้อมูล</p>
    <StudentLibraryLab localReview={view === 'local-student'} />
  </main>

  if (view === 'waiting'  || view === 'waiting-locked') {
    async function previewUnlock() {
      'use server'
    }
    const locked = view === 'waiting-locked'
    return (
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <p className="mb-4 text-xs text-muted-foreground">
          ห้องทดลองหน้ารอคลังฝึก · ข้อมูลจำลอง · ไม่มีการอ่านหรือบันทึกฐานข้อมูล
        </p>
        <PracticeWaitingRoom
          library={{
            id: '00000000-0000-4000-8300-000000000001',
            classroomId: '00000000-0000-4000-8300-000000000002',
            title: 'สอวน. ค่าย 1 · ไฟฟ้าและกลศาสตร์',
            description: '<p>เลือกหัวข้อที่อยากฝึก แล้วลองทำซ้ำได้ตามต้องการ</p>',
            revealAnswerKey: false,
            requiresAccessCode: locked,
            calculatorEnabled: false,
            scratchpadEnabled: true,
            shuffleOptions: true,
          }}
          questionCount={128}
          enterHref="/exam-screen-lab/practice-library?view=waiting"
          returnHref="/exam-screen-lab/practice-library"
          locked={locked}
          unlockAction={locked ? previewUnlock : undefined}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <p className="mb-4 text-xs text-muted-foreground">
        ห้องทดลองหน้าสร้างคลังฝึก · ข้อมูลจำลอง · อย่ากดบันทึกหรือเผยแพร่
      </p>
      <PracticeLibraryForm
        classrooms={[{
          id: '00000000-0000-4000-8300-000000000002',
          orgId: '00000000-0000-4000-8300-000000000003',
          name: 'ฟิสิกส์ ม.4/1',
          description: 'ระดับ: ม.4 · ภาคเรียน: 1/2569 · การเข้าร่วม: เปิดรับอิสระ',
        }, {
          id: '00000000-0000-4000-8300-000000000004',
          orgId: '00000000-0000-4000-8300-000000000003',
          name: 'ฟิสิกส์ ม.4/2',
          description: 'ระดับ: ม.4 · ภาคเรียน: 1/2569 · การเข้าร่วม: เปิดรับอิสระ',
        }, {
          id: '00000000-0000-4000-8300-000000000005',
          orgId: '00000000-0000-4000-8300-000000000003',
          name: 'ฟิสิกส์ ม.5/1',
          description: 'ระดับ: ม.5 · ภาคเรียน: 1/2569 · การเข้าร่วม: เปิดรับอิสระ',
        }]}
        questions={questions}
        questionSets={questionSets}
        initialClassroomId="00000000-0000-4000-8300-000000000002"
      />
    </main>
  )
}

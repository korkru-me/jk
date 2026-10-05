'use client'

import { useMemo, useState, type ComponentProps } from 'react'
import { CreateAssignmentForm, type AssignmentQuestionOption } from '@/components/assignments/create-assignment-form'
import { Card } from '@/components/ui/card'
import type { AssignmentType } from '@/lib/types'

const ROOM_ONE = '00000000-0000-4000-8000-000000000001'
const ROOM_TWO = '00000000-0000-4000-8000-000000000002'
const questions: AssignmentQuestionOption[] = [1, 2, 3].map(i => ({
  id: `00000000-0000-4000-8100-${String(i).padStart(12, '0')}`,
  title: `โจทย์จำลองข้อ ${i}`,
  question_text: `<p>คำถามจำลองข้อ ${i}</p>`,
  question_type: 'mcq',
  difficulty: 'easy',
  tags: [],
  sub_question_count: 1,
  default_points: 1,
  has_random_values: false,
}))

export function AssignmentCreationLabClient({ contextual, type }: { contextual: boolean; type: AssignmentType }) {
  const [savedSetName, setSavedSetName] = useState('')
  const [receivedAssignment, setReceivedAssignment] = useState('')
  const actions = useMemo<NonNullable<ComponentProps<typeof CreateAssignmentForm>['actions']>>(() => ({
    async createQuestionSet(data) {
      setSavedSetName(data.title)
      return { id: '00000000-0000-4000-8200-000000000001' }
    },
    async createAssignment(data) {
      setReceivedAssignment(`${data.title} · ${data.classroom_ids?.length ?? 0} ห้อง · ${data.random_question_count ?? 'ทุก'} ข้อ`)
      return { error: '(ห้องทดลอง) รับข้อมูลแล้ว ไม่มีการบันทึกฐานข้อมูล' }
    },
    async getQuestionPreviewDetails(ids) {
      return { data: questions.filter(q => ids.includes(q.id)).map(q => ({
        id: q.id, title: q.title, question_text: q.question_text,
        question_type: q.question_type, is_random: false, variables: [],
        answer_parts: [], image_urls: [], extra_data: {},
        mcq_options: [{ text: 'ตัวเลือกจำลอง ก', is_correct: true }, { text: 'ตัวเลือกจำลอง ข', is_correct: false }],
      })) }
    },
  }), [])

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <p className="text-xs text-muted-foreground">ห้องทดลองแบบฟอร์มมอบหมายงาน · ข้อมูลจำลอง · การบันทึกใช้หน่วยความจำของแท็บเท่านั้น</p>
      <CreateAssignmentForm
        classrooms={[
          { id: ROOM_ONE, name: 'ห้องหลักจำลอง', description: null },
          { id: ROOM_TWO, name: 'ห้องอื่นจำลอง', description: null },
        ]}
        groupsByClassroom={{
          [ROOM_TWO]: [{ id: '00000000-0000-4000-8300-000000000001', name: 'กลุ่มจำลอง', color: 'purple', memberCount: 5 }],
        }}
        questions={questions}
        questionSets={[
          { id: 'lab-all', title: 'แฟ้มจำลองสามข้อ', description: null, question_ids: questions.map(q => q.id), sections: [] },
          { id: 'lab-overlap', title: 'แฟ้มจำลองข้อซ้ำ', description: null, question_ids: [questions[0].id, questions[1].id], sections: [] },
          { id: 'lab-missing', title: 'แฟ้มจำลองมีข้อที่หายไป', description: null, question_ids: [questions[2].id, '00000000-0000-4000-8100-000000000099'], sections: [] },
          { id: 'lab-empty', title: 'แฟ้มจำลองว่าง', description: null, question_ids: [], sections: [] },
        ]}
        preselectedClassroomId={contextual ? ROOM_ONE : undefined}
        preselectedAssignmentType={type}
        actions={actions}
      />
      {(savedSetName || receivedAssignment) && (
        <Card padding="md" className="space-y-2">
          <p className="text-sm font-semibold">ข้อมูลที่รับในหน่วยความจำ (จำลอง)</p>
          <output aria-label="ชื่อแฟ้มที่รับ">{savedSetName}</output>
          <output aria-label="งานที่รับ" className="block">{receivedAssignment}</output>
        </Card>
      )}
    </main>
  )
}

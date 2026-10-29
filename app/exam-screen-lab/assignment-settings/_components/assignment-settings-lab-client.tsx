'use client'

import {
  EditAssignmentForm,
  type EditableAssignment,
  type EditableAssignmentQuestion,
} from '@/components/assignments/edit-assignment-form'
import type { BankQuestion } from '@/lib/question-bank'
import type { QuestionPreviewDetail } from '@/lib/actions/question-previews'
import type { AssignmentType } from '@/lib/types'

const QUESTION_IDS = [
  '00000000-0000-4000-8100-000000000001',
  '00000000-0000-4000-8100-000000000002',
  '00000000-0000-4000-8100-000000000003',
]

const questions: EditableAssignmentQuestion[] = [
  {
    id: QUESTION_IDS[0],
    title: 'แรงลัพธ์ในแนวเส้นตรง',
    question_text: '<p>จงคำนวณแรงลัพธ์จากข้อมูลที่กำหนด</p>',
    question_type: 'written',
    default_points: 2,
    has_random_values: true,
  },
  {
    id: QUESTION_IDS[1],
    title: 'กฎการเคลื่อนที่ของนิวตัน',
    question_text: '<p>เลือกคำตอบที่ถูกต้องที่สุด</p>',
    question_type: 'mcq',
    default_points: 1,
    has_random_values: false,
  },
  {
    id: QUESTION_IDS[2],
    title: 'วิเคราะห์กราฟความเร็ว–เวลา',
    question_text: '<p>อธิบายความหมายของความชันในแต่ละช่วง</p>',
    question_type: 'essay',
    default_points: 3,
    has_random_values: false,
  },
]

// The ดูตัวอย่าง eye reads these instead of the database.
const previewQuestions: QuestionPreviewDetail[] = questions.map(question => ({
  id: question.id,
  title: question.title,
  question_text: question.question_text,
  question_type: question.question_type,
  is_random: false,
  variables: [],
  answer_parts: null,
  mcq_options: question.question_type === 'mcq'
    ? [
        { text: 'วัตถุเคลื่อนที่ด้วยความเร็วคงที่เมื่อแรงลัพธ์เป็นศูนย์', is_correct: true },
        { text: 'วัตถุต้องหยุดนิ่งเสมอเมื่อแรงลัพธ์เป็นศูนย์', is_correct: false },
        { text: 'แรงลัพธ์ทำให้ความเร็วคงที่', is_correct: false },
      ]
    : null,
  image_urls: [],
  extra_data: {},
}))

const bank: BankQuestion[] = questions.map((question, index) => ({
  ...question,
  difficulty: index === 2 ? 'medium' : 'easy',
  subject: 'ฟิสิกส์',
  tags: ['ห้องทดลอง'],
  sub_question_count: 1,
}))

function assignmentFixture(type: AssignmentType): EditableAssignment {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    org_id: '00000000-0000-4000-8000-000000000002',
    created_by: '00000000-0000-4000-8000-000000000003',
    status: 'draft',
    title: type === 'exam' ? 'ทดสอบระบบสอบ' : 'แบบฝึกหัดเรื่องแรงและการเคลื่อนที่',
    description: '<p>อ่านคำชี้แจงก่อนเริ่มทำ และเตรียมกระดาษสำหรับคำนวณ</p>',
    question_ids: QUESTION_IDS,
    question_points: { [QUESTION_IDS[0]]: 2, [QUESTION_IDS[1]]: 1, [QUESTION_IDS[2]]: 3 },
    display_max_score: null,
    start_at: null,
    due_at: null,
    late_bands: [],
    end_at: null,
    duration_minutes: type === 'exam' ? 60 : null,
    max_attempts: type === 'exam' ? 1 : null,
    mode: 'online',
    type,
    score_strategy: type === 'exam' ? 'latest' : 'best',
    retry_scope: 'all',
    questions_per_page: 5,
    instant_check: type === 'exercise',
    instant_check_answer_key: false,
    completion_rule: 'fixed',
    streak_target: null,
    streak_question_cap: null,
    streak_recycle_pool: true,
    passing_type: null,
    passing_value: null,
    show_results: type === 'exam' ? 'after_due' : 'immediate',
    show_solutions: false,
    allow_exam_review: false,
    sections: [{ id: 'lab-section', title: 'แรงและการเคลื่อนที่', question_ids: QUESTION_IDS }],
    show_sections: true,
    shuffle_questions: false,
    shuffle_options: true,
    access_code: type === 'exam' ? 'LAB-2026' : null,
    proctoring_enabled: false,
    fullscreen_required: false,
    block_clipboard: false,
    random_question_count: null,
    shared_random_seed: null,
    exam_watermark_enabled: false,
    require_work_image: false,
    calculator_enabled: false,
    scratchpad_enabled: type === 'exercise',
    secure_browser_mode: 'browser',
    android_exam_mode: 'blocked',
  }
}

export function AssignmentSettingsLabClient({
  type,
  hasSubmissions,
}: {
  type: AssignmentType
  hasSubmissions: boolean
}) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <p className="text-xs text-muted-foreground">
        ห้องทดลองหน้าตั้งค่า{type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'} · ข้อมูลจำลอง · ไม่บันทึกฐานข้อมูล
      </p>
      <EditAssignmentForm
        assignment={assignmentFixture(type)}
        questions={questions}
        previewQuestions={previewQuestions}
        bank={bank}
        hasSubmissions={hasSubmissions}
        sebQuitPasswordSetup={{
          currentRevision: null,
          configuredAt: null,
          releaseRevision: null,
          artifactStatus: 'not_configured',
          canManage: false,
          blockedReason: 'owner_only',
        }}
      />
    </main>
  )
}

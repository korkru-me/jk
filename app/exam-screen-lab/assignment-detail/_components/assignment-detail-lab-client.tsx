'use client'

import { AssignmentDetailClient } from '@/app/(app)/assignments/[id]/_components/assignment-detail-client'
import type { SubmissionRow } from '@/app/(app)/assignments/[id]/page'
import type { Assignment } from '@/lib/types'

const ASSIGNMENT_ID = '00000000-0000-4000-b000-000000000044'
const NOW = '2026-10-07T02:15:00.000Z'

const assignment: Assignment & { classrooms: { name: string } } = {
  id: ASSIGNMENT_ID,
  org_id: '00000000-0000-4000-a000-000000000044',
  classroom_id: '00000000-0000-4000-c000-000000000044',
  created_by: '00000000-0000-4000-d000-000000000044',
  title: 'ทดสอบระบบตรวจกลับไปให้คะแนนเอง (สำเนา) (สำเนา)',
  description: null,
  question_ids: ['q1', 'q2', 'q3', 'q4', 'q5'],
  question_points: null,
  display_max_score: null,
  set_id: null,
  sections: null,
  show_sections: true,
  start_at: null,
  end_at: null,
  duration_minutes: null,
  status: 'closed',
  mode: 'online',
  type: 'exercise',
  shuffle_questions: false,
  shuffle_options: false,
  random_question_count: null,
  shared_random_seed: null,
  show_results: 'immediate',
  show_solutions: false,
  max_attempts: null,
  score_strategy: 'best',
  retry_scope: 'all',
  questions_per_page: 1,
  instant_check: false,
  instant_check_answer_key: false,
  completion_rule: 'fixed',
  streak_target: null,
  streak_question_cap: null,
  streak_recycle_pool: true,
  access_code: null,
  passing_type: null,
  passing_value: null,
  require_work_image: false,
  calculator_enabled: true,
  scratchpad_enabled: true,
  proctoring_enabled: false,
  fullscreen_required: false,
  block_clipboard: false,
  exam_watermark_enabled: false,
  secure_browser_mode: 'browser',
  android_exam_mode: 'blocked',
  created_at: NOW,
  updated_at: NOW,
  classrooms: { name: 'ทดสอบ สอบแก้กลางภาค' },
}

const submissions: SubmissionRow[] = Array.from({ length: 63 }, (_, index) => ({
  id: null,
  student_id: `00000000-0000-4000-e000-${String(index + 1).padStart(12, '0')}`,
  status: 'not_started',
  total_score: null,
  max_score: 0,
  submitted_at: null,
  started_at: '1970-01-01T00:00:00.000Z',
  users: { full_name: `นักเรียนตัวอย่าง ${index + 1}` },
}))

export function AssignmentDetailLabClient() {
  return (
    <AssignmentDetailClient
      assignment={assignment}
      questions={[]}
      submissions={submissions}
      pendingSubmissionIds={[]}
      pendingReviewCapped={false}
    />
  )
}

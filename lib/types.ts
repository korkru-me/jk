export type UserRole = 'teacher' | 'student' | 'admin'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Classroom {
  id: string
  teacher_id: string
  name: string
  description: string | null
  class_code: string
  created_at: string
  updated_at: string
}

export interface ClassroomStudent {
  id: string
  classroom_id: string
  student_id: string
  joined_at: string
}

export interface QuestionCategory {
  id: string
  name: string
  parent_id: string | null
  order: number
  created_at: string
}

export type QuestionType = 'mcq' | 'written'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'analytical'
export type Visibility = 'private' | 'school' | 'public'

export interface Variable {
  name: string
  min: number
  max: number
  unit: string
  decimals: number
  type?: 'value' | 'reference'
  reference_question_order?: number
  reference_field?: 'answer'
}

export interface MCQOption {
  text: string
  is_correct: boolean
}

export interface Question {
  id: string
  created_by: string
  category_id: string
  title: string
  question_text: string
  question_type: QuestionType
  difficulty: Difficulty
  visibility: Visibility
  is_random: boolean
  variables: Variable[]
  answer_formula: string
  answer_unit: string | null
  answer_tolerance: number
  mcq_options: MCQOption[] | null
  solution_text: string | null
  image_urls: string[]
  parent_question_id: string | null
  group_id: string | null
  order_in_group: number | null
  created_at: string
  updated_at: string
}

export type AssignmentStatus = 'draft' | 'published' | 'closed'
export type AssignmentMode = 'online' | 'print'

export interface Assignment {
  id: string
  classroom_id: string
  created_by: string
  title: string
  description: string | null
  question_ids: string[]
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  status: AssignmentStatus
  mode: AssignmentMode
  created_at: string
  updated_at: string
}

export type SubmissionStatus = 'in_progress' | 'submitted' | 'graded'

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  total_score: number | null
  max_score: number
  status: SubmissionStatus
  created_at: string
}

export interface SubmissionAnswer {
  id: string
  submission_id: string
  question_id: string
  random_values: Record<string, number>
  correct_answer: string
  student_answer: string | null
  is_correct: boolean | null
  score: number
  max_score: number
  teacher_feedback: string | null
  created_at: string
}

export interface FormulaPreset {
  id: string
  category_id: string
  formula_name: string
  equation: string
  variables: Variable[]
  target_variable: string
  description: string | null
  created_at: string
}

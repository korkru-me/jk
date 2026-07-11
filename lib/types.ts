export type UserRole = 'teacher' | 'student' | 'admin'
export type UserStatus = 'active' | 'suspended'
export type InstructorType = 'teacher' | 'tutor'
export type SurveyRole = 'teacher' | 'tutor' | 'student' | 'parent' | 'other'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  instructor_type: InstructorType | null
  survey_role: SurveyRole | null
  role_custom: string | null
  status: UserStatus
  created_at: string
  updated_at: string
}

export type ClassroomStatus = 'active' | 'archived' | 'deleted'

export interface Classroom {
  id: string
  org_id: string
  teacher_id: string
  name: string
  description: string | null
  class_code: string
  status: ClassroomStatus
  deleted_at: string | null
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

export type QuestionType = 'mcq' | 'written' | 'matching' | 'essay' | 'true_false' | 'fill_blank' | 'ordering'

export type TrueFalseExplanationMode = 'none' | 'wrong_only' | 'always'

export interface TrueFalseConfig {
  correct_answer: boolean
  explanation_mode: TrueFalseExplanationMode
  score_answer: number
  score_explanation: number
}

export interface FillBlankItem {
  id: number
  answer: string
  case_sensitive: boolean
}

export interface FillBlankConfig {
  blanks: FillBlankItem[]
  grading_mode: 'auto' | 'manual'
}

export interface OrderingItem {
  id: string
  text: string
  image_url?: string
}

export interface OrderingConfig {
  items: OrderingItem[]
}
export type Difficulty = 'easy' | 'medium' | 'hard' | 'analytical'
export type Visibility = 'private' | 'school' | 'public' | 'pending'

export interface Variable {
  name: string
  min: number
  max: number
  step: number
  unit?: string
  type?: 'value' | 'reference'
  reference_question_order?: number
  reference_field?: 'answer'
  is_constant?: boolean
  constant_value?: number
  is_answer?: boolean
}

export interface MCQOption {
  text: string
  is_correct: boolean
  image_url?: string
}

export interface MatchingPair {
  left_text: string
  right_text: string
  left_image?: string
  right_image?: string
}

export interface AnswerPart {
  id: string
  sub_text: string
  formula: string
  unit: string
  tolerance: number   // negative = percent mode, positive = absolute decimal
}

export type LogicOperator = '<' | '>' | '<=' | '>=' | '!='

export interface LogicRule {
  id: string
  lhs: string
  operator: LogicOperator
  rhs_type: 'variable' | 'constant'
  rhs_variable: string
  rhs_constant: number
}

export interface PythagoreanGroup {
  id: string
  a_var: string  // shorter leg
  b_var: string  // longer leg
  c_var: string  // hypotenuse
}

export interface RandomQuestionConfig {
  answer_step?: number            // 0 or undefined = disabled
  pythagorean_groups?: PythagoreanGroup[]
}

export interface Question {
  id: string
  created_by: string
  category_id: string
  grade_level: string | null
  subject: string | null
  title: string
  question_text: string
  question_type: QuestionType
  difficulty: Difficulty
  visibility: Visibility
  is_random: boolean
  variables: Variable[]
  logic_rules: LogicRule[]
  answer_formula: string
  answer_unit: string | null
  answer_tolerance: number
  answer_parts: AnswerPart[] | null
  mcq_options: MCQOption[] | null
  solution_text: string | null
  tags: string[] | null
  rejected_reason: string | null
  image_urls: string[]
  extra_data: TrueFalseConfig | FillBlankConfig | OrderingConfig | Record<string, never>
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

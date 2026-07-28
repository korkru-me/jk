import type { PartLabelStyle } from './part-labels'

export type UserRole = 'teacher' | 'student' | 'admin'
export type UserStatus = 'active' | 'suspended'
export type InstructorType = 'teacher' | 'tutor'
export type SurveyRole = 'teacher' | 'tutor' | 'student' | 'parent' | 'other'
export type NamePrefix = 'เด็กชาย' | 'เด็กหญิง' | 'นาย' | 'นางสาว'

export interface User {
  id: string
  email: string
  full_name: string
  prefix: NamePrefix | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  role: UserRole
  instructor_type: InstructorType | null
  survey_role: SurveyRole | null
  role_custom: string | null
  status: UserStatus
  created_at: string
  updated_at: string
}

export type StudentGender = 'male' | 'female'

export interface StudentGuardian {
  name: string
  phone: string
}

export interface StudentProfile {
  student_id: string
  nickname: string | null
  date_of_birth: string | null
  gender: StudentGender | null
  food_allergy: string | null
  chronic_disease: string | null
  grade_level: string | null
  section_number: number | null
  school_name: string | null
  student_code: string | null
  class_number: number | null
  address: string | null
  phone: string | null
  guardians: StudentGuardian[]
  updated_at: string
}

export type ClassroomStatus = 'active' | 'archived' | 'deleted'
export type ClassroomType = 'subject' | 'homeroom'

export interface Classroom {
  id: string
  org_id: string
  teacher_id: string
  name: string
  description: string | null
  class_code: string
  status: ClassroomStatus
  classroom_type: ClassroomType
  pinned_at: string | null
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

export type QuestionType = 'mcq' | 'written' | 'matching' | 'essay' | 'true_false' | 'fill_blank' | 'ordering' | 'file_upload'

export type TrueFalseExplanationMode = 'none' | 'wrong_only' | 'always'

export interface TrueFalseStatement {
  id: string
  text: string   // rich text (HTML) — the statement to judge true/false
  correct_answer: boolean
}

export interface TrueFalseConfig {
  correct_answer: boolean   // the main statement's (question_text) answer
  explanation_mode: TrueFalseExplanationMode
  score_answer: number      // points per statement
  score_explanation: number
  statements?: TrueFalseStatement[]   // additional statements beyond the main one — ข, ค, ...
  part_label_style?: PartLabelStyle
}

// 'text': student may answer anything, teacher grades manually
// 'fixed': student types freely, system auto-grades against `answer`
// 'dropdown': student picks from `options`, system auto-grades against `answer`
export type FillBlankType = 'text' | 'fixed' | 'dropdown'

export interface FillBlankItem {
  id: number
  type: FillBlankType
  answer: string
  case_sensitive: boolean
  options?: string[]   // only used when type === 'dropdown'
}

export interface FillBlankConfig {
  blanks: FillBlankItem[]
  /** @deprecated legacy whole-question grading mode, superseded by per-blank FillBlankItem.type */
  grading_mode?: 'auto' | 'manual'
}

export interface OrderingItem {
  id: string
  text: string
  image_url?: string
}

export interface OrderingConfig {
  items: OrderingItem[]
}

// "ส่งไฟล์งาน" (Google-Classroom-style file submission). The teacher's
// instructions live in the shared `question_text` field; `attachment_urls`
// holds optional teacher-provided reference material (images/PDF), stored
// in the same `question-images` bucket as other teacher-side uploads.
export interface FileUploadConfig {
  attachment_urls?: string[]
}

// A student's submitted answer for a `file_upload` question — encoded as a
// JSON array in `submission_answers.student_answer` (see SubmittedFile[]).
export interface SubmittedFile {
  url: string
  name: string
  type: string
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'analytical'
export type Visibility = 'private' | 'school' | 'organization' | 'public' | 'pending'

export type OrgType = 'school' | 'team'
export type TeamOrgRole = 'owner' | 'teacher'

export interface TeamOrg {
  id: string
  name: string
  type: OrgType
  invite_code: string
}

export interface TeamOrgMember {
  userId: string
  role: TeamOrgRole
  joinedAt: string
  fullName: string
  email: string
}

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
  equation_text?: string   // raw "{var} = formula" text shown in the equation picker, for edit/duplicate prefill
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
  part_label_style?: PartLabelStyle   // undefined = 'thai' (ก, ข, ค, ...)
}

export interface Question {
  id: string
  created_by: string
  org_id: string | null
  /** org_ids of teams this question was *additionally* shared to, beyond org_id.
   *  Only populated where explicitly fetched (e.g. the edit page) — absent otherwise. */
  shared_org_ids?: string[]
  /** Whether teammates with access to this question (via org_id/question_shares) may edit it. Default true. */
  team_edit_allowed: boolean
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
  requires_work_image: boolean
  extra_data: TrueFalseConfig | FillBlankConfig | OrderingConfig | RandomQuestionConfig | FileUploadConfig | Record<string, never>
  parent_question_id: string | null
  group_id: string | null
  order_in_group: number | null
  created_at: string
  updated_at: string
}

export type AssignmentStatus = 'draft' | 'published' | 'closed'
export type AssignmentMode = 'online' | 'print'
export type AssignmentType = 'exercise' | 'exam'

export type ShowResultsMode = 'immediate' | 'after_due'
export type ScoreStrategy = 'best' | 'average' | 'latest'

export interface Assignment {
  id: string
  org_id: string
  classroom_id: string
  created_by: string
  title: string
  description: string | null
  question_ids: string[]
  set_id: string | null
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  status: AssignmentStatus
  mode: AssignmentMode
  type: AssignmentType
  shuffle_questions: boolean
  shuffle_options: boolean
  show_results: ShowResultsMode
  max_attempts: number | null
  score_strategy: ScoreStrategy
  access_code: string | null
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  require_work_image: boolean
  created_at: string
  updated_at: string
}

export interface QuestionSet {
  id: string
  org_id: string
  created_by: string
  visibility: Visibility
  /** org_ids of teams this set was *additionally* shared to, beyond org_id.
   *  Only populated where explicitly fetched — absent otherwise. */
  shared_org_ids?: string[]
  title: string
  description: string | null
  question_ids: string[]
  tags: string[]
  created_at: string
  updated_at: string
}

export interface AssignmentClassroom {
  id: string
  assignment_id: string
  classroom_id: string
  created_at: string
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
  attempt_number: number
  created_at: string
}

export type CoTeacherPermission = 'admin' | 'manage' | 'view'

export interface ClassroomCoTeacher {
  id: string
  classroom_id: string
  user_id: string
  permission: CoTeacherPermission
  invited_by: string
  created_at: string
  updated_at: string
}

export interface ClassroomInvitation {
  id: string
  classroom_id: string
  token: string
  permission: CoTeacherPermission
  email: string | null
  created_by: string
  expires_at: string
  used_at: string | null
  used_by: string | null
  created_at: string
}

export interface AssignmentExtension {
  id: string
  assignment_id: string
  student_id: string
  extended_end_at: string
  note: string | null
  granted_by: string
  created_at: string
}

export type NotificationType = 'assignment_reminder' | 'co_teacher_invite' | 'extension_granted' | 'classroom_post' | 'homeroom_weekly_digest'

export interface Notification {
  id: string
  org_id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  related_assignment_id: string | null
  related_classroom_id: string | null
  is_read: boolean
  created_at: string
}

export interface ClassroomPost {
  id: string
  classroom_id: string
  author_id: string
  body: string
  pinned: boolean
  created_at: string
  updated_at: string
  users: { full_name: string } | null
  comments: PostComment[]
}

export interface PostComment {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
  users: { full_name: string } | null
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
  order_index: number
  option_order: number[] | null
  work_images: (string | null)[] | null
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

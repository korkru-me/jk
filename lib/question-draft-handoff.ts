import type { QuestionFormData } from '@/lib/actions/questions'

/**
 * Lets an authoring form be used to fill in a โจทย์ that is not being saved yet.
 *
 * The Word import collects a whole worksheet before any of it is written: the
 * teacher works through the โจทย์ one at a time, and nothing reaches the คลัง
 * until they confirm the batch. The forms already know how to author every
 * question type — validation, the symbol picker, image upload, the live
 * preview — so rather than growing a second, poorer editor inside the import
 * screen, a form given this prop hands its payload back instead of calling
 * `createQuestion`.
 *
 * Present means "draft mode". The form also hides the controls whose values
 * the caller cannot honour: sharing and visibility are decided by the import
 * path (`importQuestionsFromFile` stores every imported โจทย์ as private), and
 * a แฟ้ม is chosen once for the whole file rather than per โจทย์.
 */
export interface QuestionDraftHandoff {
  /** Label for the submit button — "ตกลง" rather than "บันทึกโจทย์". */
  submitLabel: string
  /** Receives exactly the payload `createQuestion` would have been given. */
  onSubmit: (payload: QuestionFormData) => void
  onCancel: () => void
}

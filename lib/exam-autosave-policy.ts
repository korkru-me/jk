/**
 * A teacher/device preview has no submission row to recover and must leave no
 * answer backup on the device. Real attempts keep the existing crash/offline
 * recovery behaviour.
 */
export function shouldPersistExamAnswerLocally(previewMode: boolean): boolean {
  return !previewMode
}

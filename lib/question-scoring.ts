// Lightweight scoring rules shared by previews and the attempt grader.
// Keep this module independent of the random sampler and mathjs.
import { classifyCellCount } from '@/lib/classify'
import { imageLabelMarkerCount } from '@/lib/image-label'

// A question's point value before any assignment-level custom override —
// same formula used both when an attempt starts (to seed submission_answers.
// max_score) and when grading (to know how much to rescale a raw score by,
// so a custom override changes the ceiling without silently changing which
// answers count as correct). Must stay identical in both places: when no
// override is set, this being equal to the stored max_score is exactly what
// keeps grading unchanged from before this feature existed.
export function naturalMaxScore(
  questionType: string,
  extraData: any,
  answerParts: unknown[] | null,
  matchingPairCount = 0,
): number {
  if (questionType === 'true_false') {
    const statements: unknown[] = extraData?.statements ?? []
    const scoreAnswer: number = extraData?.score_answer ?? 1
    const explanationScore = extraData?.explanation_mode !== 'none' ? (extraData?.score_explanation ?? 1) : 0
    if (statements.length > 0) return scoreAnswer * (statements.length + 1) + explanationScore
    return scoreAnswer + explanationScore
  }
  if (questionType === 'fill_blank') {
    const blanks: unknown[] = extraData?.blanks ?? []
    return blanks.length || 1
  }
  if (questionType === 'ordering') {
    const items: unknown[] = extraData?.items ?? []
    return items.length || 1
  }
  if (questionType === 'matching') {
    // Matching pairs live in mcq_options rather than extra_data (see
    // MatchingPair in lib/types.ts), so the count comes in explicitly — one
    // point per pair.
    return matchingPairCount || 1
  }
  // 1 คะแนนต่อช่อง, counting only the cells the teacher actually keyed — an
  // unkeyed cell is not gradable, so charging the student for it would repeat
  // the composite เติมคำ mistake. classifyCellCount owns that rule.
  if (questionType === 'classify') return classifyCellCount(extraData) || 1
  // 1 คะแนนต่อจุด, counting only the points the teacher actually keyed — the
  // same rule, and the same reason, as classify above. imageLabelMarkerCount
  // owns it.
  if (questionType === 'image_label') return imageLabelMarkerCount(extraData) || 1
  if (questionType === 'file_upload') return 1
  if (questionType === 'composite') {
    const parts: any[] = extraData?.parts ?? []
    if (parts.length === 0) return 1
    return parts.reduce((sum, p) => sum + (typeof p?.score === 'number' && p.score > 0 ? p.score : 1), 0)
  }
  if (answerParts && answerParts.length > 1) return answerParts.length
  return 1
}

// ค่าคลาดเคลื่อนที่ยอมรับ: ลบ = คิดเป็นเปอร์เซ็นต์ของเฉลย, บวก = ค่าสัมบูรณ์
// export ออกไปเพราะหน้าตัวอย่างโจทย์ของครูตัดสินถูก/ผิดด้วยกติกาเดียวกันนี้ —
// เดิมมันมีสูตร 1% ของตัวเอง คำว่า "ถูก" ในตัวอย่างจึงไม่ตรงกับตอนตรวจจริง
export function gradeValue(studentVal: number, correctVal: number, storedTolerance: number): boolean {
  const tolerance = storedTolerance < 0
    ? Math.abs(correctVal) * (Math.abs(storedTolerance) / 100)
    : storedTolerance
  return Math.abs(studentVal - correctVal) <= tolerance
}


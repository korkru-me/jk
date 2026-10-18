import type { GradingAnswer, GradingWorkspaceData } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import type { GradingSavedDraft } from '@/lib/grading-draft-types'
import type { Question } from '@/lib/types'

export const LAB_BASE = '/exam-screen-lab/grading-workspace'
export const LAB_STORAGE = 'korkru:grading-workspace-lab:v2'
export const LAB_LEGACY_STORAGE = 'korkru:grading-workspace-lab:v1'
export const LAB_TIME = '2026-10-18T02:00:00.000Z'
export const LAB_LONG_QUESTION_TITLE = 'อัตราเร็วของการเดินในกิจกรรมสำรวจเส้นทางรอบโรงเรียน พร้อมข้อมูลประกอบหลายช่วง ขั้นตอนการวิเคราะห์ และภาพแสดงวิธีทำสำหรับทดลองอ่านโจทย์ยาวระหว่างตรวจคำตอบนักเรียน'
export const labId = (type: number, index: number) => `00000000-0000-4000-${String(type).padStart(4, '0')}-${String(index).padStart(12, '0')}`

const LONG_QUESTION_TEXT = String.raw`
<p><strong>สถานการณ์จำลอง: สำรวจการเคลื่อนที่ในโรงเรียน</strong> นักเรียนกลุ่มหนึ่งต้องการเปรียบเทียบการเดินของเพื่อนแต่ละคน โดยกำหนดเส้นทางตรงจากจุดเริ่มต้นไปยังจุดสิ้นสุดเป็นระยะทาง 20 เมตร และวัดเวลาของช่วงที่ต้องนำมาคำนวณได้ 4 วินาที จงหาอัตราเร็วเฉลี่ยของการเดินช่วงนี้ พร้อมแนบภาพแสดงวิธีทำอย่างเป็นลำดับ</p>
<p>ก่อนเริ่มกิจกรรม สมาชิกในกลุ่มช่วยกันตรวจระยะทางด้วยสายวัด กำหนดตำแหน่งเริ่มต้นและสิ้นสุดให้ชัดเจน และตรวจว่าตลอดเส้นทางไม่มีสิ่งกีดขวาง ข้อมูลส่วนนี้ใช้ประกอบความเข้าใจสถานการณ์ โดยไม่เปลี่ยนค่าระยะทางและเวลาที่กำหนดในคำถาม</p>
<p>ผู้จับเวลาต้องมองเห็นผู้เดินตลอดช่วงที่เก็บข้อมูล ส่วนผู้บันทึกผลต้องระบุทั้งค่าตัวเลขและหน่วยลงในตารางบันทึก เพื่อให้ผู้อ่านสามารถแยกความหมายของระยะทาง เวลา และอัตราเร็วได้อย่างถูกต้อง</p>
<p><strong>ลำดับการวิเคราะห์ที่ต้องแสดงในภาพวิธีทำ</strong></p>
<ol>
<li>ระบุปริมาณที่โจทย์กำหนดให้ครบ ได้แก่ ระยะทางและช่วงเวลาที่ใช้เดิน พร้อมเขียนหน่วยกำกับแต่ละค่า</li>
<li>ระบุว่าปริมาณที่ต้องการหาคืออัตราเร็วเฉลี่ย และอธิบายสั้น ๆ ว่าปริมาณนี้สัมพันธ์กับข้อมูลที่วัดอย่างไร</li>
<li>เลือกสมการให้สอดคล้องกับปริมาณที่ต้องการหา โดยยังไม่แทนค่าตัวเลขในขั้นตอนนี้</li>
<li>แทนค่าระยะทางและเวลาตามที่กำหนด ตรวจว่าหน่วยของทั้งสองปริมาณใช้ร่วมกันได้ แล้วคำนวณอย่างเป็นลำดับ</li>
<li>ตรวจคำตอบด้วยการคูณอัตราเร็วที่ได้กับช่วงเวลา และเปรียบเทียบกับระยะทางเดิมของโจทย์</li>
<li>สรุปคำตอบพร้อมหน่วย และแยกคำอธิบายการตรวจสอบออกจากบรรทัดคำตอบสุดท้ายให้อ่านง่าย</li>
</ol>
<p>ใช้ความสัมพันธ์ \(v_{\mathrm{avg}} = \frac{s}{t}\) โดย \(s\) คือระยะทางทั้งหมดของช่วงที่พิจารณา และ \(t\) คือเวลาที่ใช้ในช่วงเดียวกัน ค่าทั้งสองต้องอ้างอิงจุดเริ่มต้นและสิ้นสุดชุดเดียวกันเสมอ</p>
<p>\[v_{\mathrm{avg}} = \frac{20\,\mathrm{m}}{4\,\mathrm{s}}\]</p>
<p><strong>ข้อมูลประกอบช่วงที่หนึ่ง</strong> สมมติว่ากลุ่มนักเรียนต้องเตรียมจุดวัดซ้ำอีกครั้งในวันถัดไป สมาชิกควรบันทึกตำแหน่งเครื่องหมายเริ่มต้นและสิ้นสุดให้ละเอียด เพื่อให้ทุกกลุ่มใช้เส้นทางเดียวกัน ข้อมูลนี้อธิบายวิธีดำเนินกิจกรรม ไม่ต้องนำระยะทางใหม่มาบวกเพิ่มในการคำนวณ</p>
<p><strong>ข้อมูลประกอบช่วงที่สอง</strong> หากการเริ่มจับเวลาคลาดเคลื่อนจากจุดเริ่มต้น ควรบันทึกข้อสังเกตนั้นไว้และเริ่มเก็บข้อมูลรอบใหม่ในการทดลองจริง แต่คำถามจำลองข้อนี้ให้ใช้ค่าระยะทาง 20 เมตรและเวลา 4 วินาทีตามเดิมเท่านั้น</p>
<p><strong>ข้อมูลประกอบช่วงที่สาม</strong> การเขียนหน่วยในทุกขั้นตอนช่วยตรวจสอบว่าความสัมพันธ์ของสมการถูกต้องหรือไม่ เช่น เมื่อระยะทางอยู่ในหน่วยเมตรและเวลาอยู่ในหน่วยวินาที หน่วยของคำตอบจะเกิดจากการหารหน่วยระยะทางด้วยหน่วยเวลา</p>
<p><strong>ข้อมูลประกอบช่วงที่สี่</strong> คำตอบที่คำนวณได้ควรสอดคล้องกับเหตุการณ์ในโจทย์ ครูสามารถพิจารณาทั้งการเลือกสูตร การแทนค่า การคำนวณ และการสรุปหน่วยจากภาพวิธีทำที่แนบมา โดยแยกคะแนนคำตอบออกจากคะแนนวิธีทำตามสัดส่วนเดิมของงาน</p>
<p>ภาพท้ายโจทย์เป็นกระดาษวิธีทำจำลองจากไฟล์ภายในห้องทดลอง ใช้ประกอบการตรวจว่าครูเลื่อนอ่านเนื้อหาและภาพได้ครบ โดยยังมองเห็นช่องคะแนนของนักเรียนด้านล่าง ไม่มีไฟล์หรือข้อมูลผู้เรียนจริงอยู่ในตัวอย่างนี้</p>`

export interface GradingLabData extends GradingWorkspaceData {
  assignment: GradingWorkspaceData['assignment'] & { showResults: 'immediate' }
  viewerId: string
  draftsAvailable: boolean
  savedDrafts: GradingSavedDraft[]
}

const names = ['กานต์พิชชา ใจดี','กิตติภพ วงศ์สวัสดิ์','จิราพร แก้วประเสริฐ','ชนาธิป ศรีสุข','ณัฐกานต์ พูนผล','ณัฐวุฒิ แสงทอง','ธนพร วิริยะ','ธนวัฒน์ รุ่งเรือง','นภัสสร สุขสันต์','นวพล พรหมมา','นันทิชา เมธาวี','ปกรณ์ สายชล','ปณิตา ศรีวิไล','ปริญญา จันทร์หอม','ปวีณา รัตนชัย','พงศกร บุญช่วย','พัชราภา อารีย์','พิชญ์สินี พิมพ์ใจ','ภูริณัฐ ดีพร้อม','มนัสวี จงเจริญ','เมธาวี ศิลป์งาม','รวิภา แสนดี','รัชชานนท์ เพียรดี','ลลิตา ทองแท้','วรัญญา อุดมสุข','วรเมธ แก้วใส','ศศิธร สุวรรณ','ศุภกร พัฒนะ','สุชาดา รุ่งอรุณ','สุรเชษฐ์ คงมั่น','อภิชญา แสงแก้ว','อิทธิพล ยิ้มแย้ม']

function question(index: number, patch: Partial<Question>): Question {
  return {
    id: labId(8100, index), created_by: labId(8000, 1), org_id: null, team_edit_allowed: true,
    is_research_snapshot: false, research_snapshot_project_id: null, research_snapshot_source_id: null,
    category_id: '', grade_level: 'ม.4', subject: 'ฟิสิกส์ 1', title: '', question_text: '', question_type: 'written',
    difficulty: 'easy', visibility: 'private', is_random: false, variables: [], logic_rules: [], answer_formula: '', answer_unit: null,
    answer_tolerance: 0, answer_parts: null, mcq_options: null, solution_text: null, solution_image_urls: [], tags: [],
    rejected_reason: null, image_urls: [], requires_work_image: false, extra_data: {}, parent_question_id: null,
    group_id: null, order_in_group: null, content_fingerprint: null, search_text: '', tag_count: 0, created_at: LAB_TIME, updated_at: LAB_TIME, ...patch,
  }
}

export function createGradingLab({ longQuestion = false }: { longQuestion?: boolean } = {}): GradingLabData {
  const questions = [
    question(1, { question_type: 'mcq', title: 'อัตราเร็วเฉลี่ย', question_text: 'รถเคลื่อนที่ได้ระยะทาง 120 เมตร ในเวลา 20 วินาที รถมีอัตราเร็วเฉลี่ยเท่าใด', mcq_options: [{ text: '4 เมตรต่อวินาที', is_correct: false }, { text: '6 เมตรต่อวินาที', is_correct: true }, { text: '12 เมตรต่อวินาที', is_correct: false }, { text: '24 เมตรต่อวินาที', is_correct: false }] }),
    question(2, { question_type: 'written', title: longQuestion ? LAB_LONG_QUESTION_TITLE : 'อัตราเร็วของการเดิน', question_text: longQuestion ? LONG_QUESTION_TEXT : 'นักเรียนเดินเป็นระยะทาง 20 เมตร ใช้เวลา 4 วินาที จงหาอัตราเร็วเฉลี่ย พร้อมแนบภาพแสดงวิธีทำ', image_urls: longQuestion ? [`${LAB_BASE}/assets/work-0.svg`] : [], answer_formula: '5', answer_unit: 'เมตรต่อวินาที', requires_work_image: true }),
    question(3, { question_type: 'essay', title: 'ระยะทางและการกระจัด', question_text: 'อธิบายความแตกต่างระหว่างระยะทางกับการกระจัด พร้อมยกตัวอย่างเหตุการณ์' }),
    question(4, { question_type: 'file_upload', title: 'ใบงานการเคลื่อนที่', question_text: 'ส่งไฟล์ใบงานเรื่องการเคลื่อนที่แนวตรง พร้อมแสดงคำตอบและเหตุผลครบทุกข้อ' }),
    question(5, { question_type: 'true_false', title: 'ความหมายของอัตราเร็ว', question_text: 'วัตถุที่เคลื่อนที่ด้วยอัตราเร็วคงที่ ต้องมีความเร็วคงที่เสมอ ถูกหรือผิด', extra_data: { correct_answer: false, explanation_mode: 'none', score_answer: 1, score_explanation: 0 } }),
    question(6, { question_type: 'matching', title: 'จับคู่ปริมาณกับหน่วย', question_text: 'จับคู่ปริมาณทางฟิสิกส์กับหน่วยที่ถูกต้อง', mcq_options: [{ left_text: 'ระยะทาง', right_text: 'เมตร' }, { left_text: 'อัตราเร็ว', right_text: 'เมตรต่อวินาที' }] as unknown as Question['mcq_options'] }),
    question(7, { question_type: 'fill_blank', title: 'สรุปการเคลื่อนที่', question_text: 'อัตราเร็วเป็นปริมาณ ______ ส่วนความเร็วเป็นปริมาณ ______ พร้อมอธิบายเหตุผล', extra_data: { blanks: [{ id: 1, type: 'text', answer: '', case_sensitive: false }, { id: 2, type: 'text', answer: '', case_sensitive: false }] } }),
  ]
  const maxScores = [1, 5, 2, 2, 1, 2, 2]
  const students = names.map((name, index) => ({ id: labId(8200, index + 1), name, gradeLevel: 'ม.4', sectionNumber: index < 20 ? 1 : 2, classNumber: index < 20 ? index + 1 : index - 19, studentCode: String(68101 + index), classroom: index < 20 ? 'ม.4/1' : 'ม.4/2', submissionId: labId(8300, index + 1), attemptNumber: 1, score: 0, maxScore: 15, status: 'submitted' as const }))
  const answers: GradingAnswer[] = []
  for (const [index, student] of students.entries()) for (const [questionIndex, q] of questions.entries()) {
    const manual = ['essay', 'file_upload', 'fill_blank'].includes(q.question_type)
    const checked = manual && q.question_type !== 'file_upload' && index % 11 === 0
    const wrong = index % 5 === 1
    const answerMax = questionIndex === 1 ? 2 : maxScores[questionIndex]
    const workMax = questionIndex === 1 ? 3 : 0
    const workChecked = workMax > 0 && index % 4 === 0
    const answerScore = manual ? checked ? 1.5 : 0 : wrong ? 0 : answerMax
    const workScore = workChecked ? 2.5 : 0
    const studentAnswer = q.question_type === 'mcq' ? wrong ? 'MCQ:2' : 'MCQ:1' : q.question_type === 'written' ? wrong ? '4' : '5' : q.question_type === 'essay' ? 'ระยะทางคือความยาวของเส้นทางที่เคลื่อนที่ ส่วนการกระจัดคือระยะจากจุดเริ่มต้นไปยังจุดสุดท้ายและมีทิศทาง เช่น เดินรอบสนามกลับมาที่เดิม การกระจัดเป็นศูนย์' : q.question_type === 'file_upload' ? JSON.stringify([{ url: `${LAB_BASE}/assets/file-${index}.pdf`, name: `ใบงานการเคลื่อนที่_${index + 1}.pdf`, type: 'application/pdf' }]) : q.question_type === 'true_false' ? wrong ? 'true' : 'false' : q.question_type === 'matching' ? JSON.stringify(['เมตร', wrong ? 'วินาที' : 'เมตรต่อวินาที']) : JSON.stringify(['สเกลาร์', 'เวกเตอร์ เพราะความเร็วต้องระบุทิศทาง'])
    const correctAnswer = q.question_type === 'mcq' ? 'MCQ:1' : q.question_type === 'written' ? '5' : q.question_type === 'essay' || q.question_type === 'file_upload' ? '' : q.question_type === 'true_false' ? 'false' : q.question_type === 'matching' ? 'MATCH:["เมตร","เมตรต่อวินาที"]' : 'FILL_MANUAL:2'
    answers.push({ id: labId(8400, index * 10 + questionIndex + 1), submissionId: student.submissionId, studentId: student.id, questionId: q.id, randomValues: {}, correctAnswer, studentAnswer, isCorrect: manual ? checked ? true : null : !wrong, score: answerScore + workScore, maxScore: maxScores[questionIndex], optionOrder: null, orderIndex: questionIndex, workImages: workMax ? [`${LAB_BASE}/assets/work-${index}.svg`] : [], scoreEditedBy: checked ? labId(8000, 1) : null, scoreEditedAt: checked || workChecked ? LAB_TIME : null, answerScore, answerMaxScore: answerMax, workScore, workMaxScore: workMax, answerReviewedAt: checked ? LAB_TIME : null, workReviewedAt: workChecked ? LAB_TIME : null, gradingPartsConfigured: true })
  }
  return recomputeLab({ assignment: { id: labId(8000, 2), title: 'การเคลื่อนที่แนวตรง', classroomName: 'ฟิสิกส์ 1 · ม.4/1 และ ม.4/2', type: 'exercise', displayMaxScore: null, completionRule: 'fixed', showResults: 'immediate' }, students, questions, answers, inProgressCount: 0, pendingFinalizationCount: 0, voidedQuestionIds: [], baseHref: LAB_BASE, reviewAvailable: true, viewerId: labId(8000, 1), draftsAvailable: true, savedDrafts: [], gradingParts: { [questions[1].id]: { workShare: 0.6, updatedAt: LAB_TIME } }, questionMaxScores: Object.fromEntries(questions.map((q, index) => [q.id, maxScores[index]])) })
}

export function recomputeLab<T extends GradingWorkspaceData>(data: T): T {
  return { ...data, students: data.students.map(student => {
    const answers = data.answers.filter(answer => answer.studentId === student.id)
    let score = 0, maxScore = 0, bestStreak = 0, currentStreak = 0
    for (const answer of answers.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const q = data.questions.find(item => item.id === answer.questionId)
      if (!q) continue
      const parts = scoreParts(answer, q)
      score += parts.total; maxScore += parts.maxScore
      currentStreak = parts.maxScore > 0 && parts.total >= parts.maxScore && !parts.pending ? currentStreak + 1 : 0
      bestStreak = Math.max(bestStreak, currentStreak)
    }
    return { ...student, score: Math.round(score * 100) / 100, maxScore, bestStreak, streakReached: bestStreak >= (data.assignment.streakTarget ?? 3) }
  }) }
}

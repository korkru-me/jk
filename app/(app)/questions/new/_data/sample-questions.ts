import type { QuestionType } from '@/lib/types'
import type { QuestionPreviewProps } from '@/components/questions/question-preview-content'

/**
 * One worked example per question type, shown on the "สร้างโจทย์ใหม่" chooser so
 * a teacher can see what a type turns into for a student before committing to
 * building one.
 *
 * These are written examples, not production data: the chooser prefers the
 * teacher's own newest question of the type and only falls back here when they
 * have not built one yet, and either way the dialog labels which of the two it
 * is showing. Nothing here is ever saved to the question bank.
 *
 * They are shaped exactly like a saved question's preview props, so the same
 * student-facing renderer draws them — an example that drifted from what the
 * real renderer produces would be worse than no example at all.
 */
export interface SampleQuestion {
  /** Stands in for the question's title, the way the bank would show it. */
  title: string
  props: QuestionPreviewProps
}

export const SAMPLE_QUESTIONS: Record<QuestionType, SampleQuestion> = {
  written: {
    title: 'หาความเร่งจากแรงลัพธ์',
    props: {
      questionType: 'written',
      questionText:
        'วัตถุมวล {m} กิโลกรัม วางนิ่งบนพื้นราบลื่น ถูกแรงในแนวราบขนาด {F} นิวตันกระทำ ' +
        'จงหาความเร่งของวัตถุ และระยะทางที่วัตถุเคลื่อนที่ได้ในเวลา {t} วินาทีแรก',
      isRandom: true,
      variables: [
        { name: 'm', min: 2, max: 10, step: 1, unit: 'kg' },
        { name: 'F', min: 10, max: 60, step: 5, unit: 'N' },
        { name: 't', min: 2, max: 6, step: 1, unit: 's' },
      ],
      answerParts: [
        { id: 'a', sub_text: 'ความเร่งของวัตถุ', formula: 'F/m', unit: 'm/s²', tolerance: 0.01 },
        { id: 's', sub_text: 'ระยะทางที่เคลื่อนที่ได้', formula: '0.5*(F/m)*t^2', unit: 'm', tolerance: 0.01 },
      ],
      answerTolerance: 0.01,
    },
  },

  mcq: {
    title: 'หน่วยของความดันในระบบเอสไอ',
    props: {
      questionType: 'mcq',
      questionText: 'หน่วยของความดันในระบบเอสไอ (SI) ตรงกับข้อใด',
      isRandom: false,
      variables: [],
      answerParts: [],
      mcqOptions: [
        { text: 'นิวตัน (N)', is_correct: false },
        { text: 'ปาสกาล (Pa)', is_correct: true },
        { text: 'จูล (J)', is_correct: false },
        { text: 'วัตต์ (W)', is_correct: false },
      ],
    },
  },

  true_false: {
    title: 'สมบัติของคลื่นเสียง',
    props: {
      questionType: 'true_false',
      // The main question_text is itself the first statement (ก) — the rest
      // live in `statements`, which is how the true/false editor saves them.
      questionText: 'เสียงเดินทางผ่านสุญญากาศได้',
      isRandom: false,
      variables: [],
      answerParts: [],
      trueFalseConfig: {
        correct_answer: false,
        explanation_mode: 'none',
        score_answer: 1,
        score_explanation: 0,
        statements: [
          { id: 'b', text: 'เสียงเดินทางในน้ำได้เร็วกว่าในอากาศ', correct_answer: true },
          { id: 'c', text: 'ความถี่ของเสียงเป็นตัวกำหนดว่าเสียงนั้นสูงหรือต่ำ', correct_answer: true },
          { id: 'd', text: 'ความดังของเสียงขึ้นอยู่กับความยาวคลื่น', correct_answer: false },
        ],
      },
    },
  },

  fill_blank: {
    title: 'กฎการเคลื่อนที่ของนิวตัน',
    props: {
      questionType: 'fill_blank',
      questionText:
        'กฎข้อที่หนึ่งของนิวตันมีอีกชื่อหนึ่งว่ากฎของ [___1] ' +
        'ส่วนกฎข้อที่สามกล่าวว่า แรงกิริยาย่อมมีขนาดเท่ากับ [___2] เสมอ ' +
        'แต่มีทิศทาง [___3] กัน',
      isRandom: false,
      variables: [],
      answerParts: [],
      fillBlankConfig: {
        blanks: [
          { id: 1, type: 'fixed', answer: 'ความเฉื่อย', answers: ['ความเฉื่อย', 'ความเฉื่อยของวัตถุ'], case_sensitive: false },
          { id: 2, type: 'fixed', answer: 'แรงปฏิกิริยา', answers: ['แรงปฏิกิริยา'], case_sensitive: false },
          {
            id: 3,
            type: 'dropdown',
            answer: 'ตรงกันข้าม',
            answers: ['ตรงกันข้าม'],
            case_sensitive: false,
            options: ['เดียวกัน', 'ตรงกันข้าม', 'ตั้งฉาก'],
          },
        ],
      },
    },
  },

  ordering: {
    title: 'ขั้นตอนของกระบวนการทางวิทยาศาสตร์',
    props: {
      questionType: 'ordering',
      questionText: 'จงเรียงขั้นตอนของกระบวนการทางวิทยาศาสตร์ต่อไปนี้ให้ถูกต้องตามลำดับ',
      isRandom: false,
      variables: [],
      answerParts: [],
      orderingConfig: {
        items: [
          { id: '1', text: 'ตั้งคำถามจากสิ่งที่สังเกตเห็น' },
          { id: '2', text: 'ตั้งสมมติฐานที่ตรวจสอบได้' },
          { id: '3', text: 'ออกแบบและลงมือทำการทดลอง' },
          { id: '4', text: 'รวบรวมและวิเคราะห์ข้อมูลที่ได้' },
          { id: '5', text: 'สรุปผลและเขียนรายงาน' },
        ],
      },
    },
  },

  matching: {
    title: 'จับคู่ปริมาณทางฟิสิกส์กับหน่วยเอสไอ',
    props: {
      questionType: 'matching',
      questionText: 'จงจับคู่ปริมาณทางฟิสิกส์ทางซ้ายกับหน่วยในระบบเอสไอทางขวาให้ถูกต้อง',
      isRandom: false,
      variables: [],
      answerParts: [],
      matchingPairs: [
        { left_text: 'แรง', right_text: 'นิวตัน (N)' },
        { left_text: 'งานและพลังงาน', right_text: 'จูล (J)' },
        { left_text: 'กำลัง', right_text: 'วัตต์ (W)' },
        { left_text: 'ความดัน', right_text: 'ปาสกาล (Pa)' },
        { left_text: 'ประจุไฟฟ้า', right_text: 'คูลอมบ์ (C)' },
      ],
    },
  },

  essay: {
    title: 'อธิบายการเกิดฤดูกาลบนโลก',
    props: {
      questionType: 'essay',
      questionText:
        'จงอธิบายว่าเหตุใดประเทศไทยจึงมีช่วงที่อากาศร้อนและช่วงที่อากาศหนาวสลับกันไปในรอบปี ' +
        'โดยอ้างถึงการเอียงของแกนโลกและการโคจรของโลกรอบดวงอาทิตย์ประกอบคำอธิบาย (ความยาวประมาณ 5–8 บรรทัด)',
      isRandom: false,
      variables: [],
      answerParts: [],
    },
  },

  file_upload: {
    title: 'ส่งใบงานกราฟความเร็ว–เวลา',
    props: {
      questionType: 'file_upload',
      questionText:
        'ให้นักเรียนเขียนกราฟความเร็ว–เวลาของรถทดลองจากข้อมูลที่บันทึกไว้ในการทดลองลงในกระดาษกราฟ ' +
        'พร้อมคำนวณความชันของกราฟและระบุความหมายทางฟิสิกส์ของค่าที่ได้ ' +
        'จากนั้นถ่ายรูปหรือสแกนงานเป็นไฟล์ภาพหรือ PDF แล้วส่งกลับมาในระบบ',
      isRandom: false,
      variables: [],
      answerParts: [],
      attachmentUrls: [],
    },
  },

  composite: {
    title: 'การเคลื่อนที่ของรถทดลอง',
    props: {
      questionType: 'composite',
      questionText:
        'รถทดลองคันหนึ่งเริ่มเคลื่อนที่จากหยุดนิ่ง ด้วยความเร่งคงที่ 2 เมตรต่อวินาที² เป็นเวลา 5 วินาที ' +
        'จงพิจารณาคำถามย่อยต่อไปนี้',
      isRandom: false,
      variables: [],
      answerParts: [],
      compositeConfig: {
        parts: [
          {
            id: 'p1',
            type: 'true_false',
            text: 'เมื่อครบ 5 วินาที รถทดลองมีความเร็ว 10 เมตรต่อวินาที',
            correct_answer: true,
            score: 1,
          },
          {
            id: 'p2',
            type: 'mcq',
            text: 'ระยะทางที่รถเคลื่อนที่ได้ในช่วง 5 วินาทีแรกมีค่าเท่าใด',
            score: 2,
            options: [
              { text: '10 เมตร', is_correct: false },
              { text: '12.5 เมตร', is_correct: false },
              { text: '25 เมตร', is_correct: true },
              { text: '50 เมตร', is_correct: false },
            ],
          },
          {
            id: 'p3',
            type: 'fill_blank',
            // A composite fill_blank part holds exactly one blank, marked with
            // [คำตอบ] rather than the numbered [___n] a standalone fill-blank
            // question uses.
            text: 'กราฟความเร็ว–เวลาของการเคลื่อนที่นี้มีลักษณะเป็นเส้น [คำตอบ]',
            score: 1,
            blanks: [
              {
                id: 1,
                type: 'dropdown',
                answer: 'ตรงที่มีความชันคงที่',
                answers: ['ตรงที่มีความชันคงที่'],
                case_sensitive: false,
                options: ['ตรงที่มีความชันคงที่', 'ตรงที่ขนานกับแกนเวลา', 'โค้งที่มีความชันเพิ่มขึ้น'],
              },
            ],
          },
          {
            id: 'p4',
            type: 'ordering',
            text: 'จงเรียงขั้นตอนการหาระยะทางจากกราฟความเร็ว–เวลาให้ถูกลำดับ',
            score: 1,
            items: [
              { id: 'o1', text: 'เขียนกราฟความเร็ว–เวลาจากข้อมูลที่มี' },
              { id: 'o2', text: 'ระบุช่วงเวลาที่ต้องการหาระยะทาง' },
              { id: 'o3', text: 'หาพื้นที่ใต้กราฟในช่วงเวลานั้น' },
              { id: 'o4', text: 'สรุประยะทางพร้อมหน่วยเป็นเมตร' },
            ],
          },
        ],
      },
    },
  },
}

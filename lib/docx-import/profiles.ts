/**
 * Every ประเภทโจทย์, and what a Word file has to look like for one to arrive.
 *
 * One record per question type, keyed by the type itself. `PROFILE_BY_TYPE` is
 * a `Record<QuestionType, …>` on purpose: adding a value to `QuestionType`
 * stops the build here until someone says what that type looks like in a
 * worksheet. That is the `AGENTS.md` rule — a question type is not finished
 * until the Word path can carry it — enforced by the compiler rather than by
 * anyone's memory.
 *
 * A profile is data, not markup, and holds three things the rest of the
 * feature reads:
 *
 *   `rules`  — how to lay the file out. Each carries a stable `id` because the
 *              messages a teacher gets when a file is wrong cite the same rule
 *              they read on the way in; a warning that maps to no rule is a
 *              warning nobody can act on.
 *   `sample` — one correctly formatted worksheet, as lines. The screen draws
 *              it as a page, and the downloadable .docx is generated from this
 *              same data, so the example shown and the file handed over cannot
 *              drift apart.
 *   `limits` — what this type provably cannot bring across. Said out loud on
 *              the screen, because an import that silently drops half a โจทย์
 *              costs a teacher more than one that never offered.
 *
 * `status` is the honest state of the parser, not a roadmap: `planned` means
 * the screen explains the shape and refuses the upload. The rules of a
 * `planned` profile are a proposal shown to teachers for comment — nothing
 * parses them, and none of them may be turned into a parser before a real file
 * from a real teacher confirms the convention (`AGENTS.md`).
 */
import type { QuestionType } from '@/lib/types'

export type ImportProfileStatus = 'ready' | 'planned'

export interface ImportRule {
  /** Stable across wording changes — warnings and tests cite this, not the text. */
  id: string
  text: string
}

/** A run of text in the sample worksheet. `answer` is what a teacher marks. */
export interface SampleSpan {
  text: string
  answer?: boolean
}

export interface SampleLine {
  /** `question` is a numbered item; `part` is one level deeper. */
  kind: 'heading' | 'question' | 'choice' | 'part'
  spans: SampleSpan[]
}

export interface ImportProfile {
  /** URL segment. Spelled the same as `/questions/new/<slug>` on purpose, so a
   *  teacher meets one name and one icon for a type whether they type it in or
   *  bring it from a file. */
  slug: string
  /** The type this profile produces, or null for the reader that decides per โจทย์. */
  type: QuestionType | null
  label: string
  /** One line, for the card on the chooser. */
  blurb: string
  status: ImportProfileStatus
  rules: ImportRule[]
  sample: SampleLine[]
  limits: string[]
  /** Where to author this type by hand instead. */
  createHref: string
}

// ─── Rules shared by every profile ───────────────────────────────────────────

/** Word draws question numbers from `numbering.xml`; they are not in the text,
 *  which is why this one rule decides whether a file can be split into โจทย์ at
 *  all. It is first on every list for that reason. */
const NUMBERING: ImportRule = {
  id: 'numbering',
  text: 'ใส่เลขข้อด้วยปุ่มรายการลำดับเลขของ Word ไม่ต้องพิมพ์เลขเอง',
}

const ANSWER_MARK: ImportRule = {
  id: 'answer-mark',
  text: 'ทำเครื่องหมายเฉลยด้วยตัวอักษรสีแดง ปากกาเน้นข้อความ หรือตัวหนา — ใช้แบบเดียวกันทุกประเภทโจทย์',
}

/**
 * Where the เฉลย of a calculation goes. How it is marked is `ANSWER_MARK`, the
 * same for every question type.
 *
 * Only a mark at the end counts: the numbers inside a โจทย์ are the ones it
 * gives you. Brackets are optional because the worksheets written before this
 * convention put the answer in brackets and nothing else — those still read.
 */
const ANSWER_POSITION: ImportRule = {
  id: 'answer-position',
  text: 'วางเฉลยไว้ท้ายข้อ เช่น "…จงหาอัตราเร็วเชิงมุม 2.5" หรือ "… (25 rad/s)" — ข้อย่อยที่มีเฉลยของตัวเอง ใส่ท้ายข้อย่อยนั้น · ไฟล์เก่าที่ใส่วงเล็บไว้แต่ยังไม่ได้ทำสี ระบบก็ยังอ่านได้',
}

const EQUATION: ImportRule = {
  id: 'equation',
  text: 'สูตรและสมการพิมพ์ด้วยตัวแทรกสมการของ Word ระบบแปลงให้ แต่ควรตรวจอีกครั้งก่อนนำเข้า',
}

const EMF_LIMIT = 'รูปที่ Word เก็บเป็น EMF/WMF (มักมาจากการวางจากโปรแกรมอื่น) เว็บแสดงไม่ได้ ต้องแนบใหม่เอง'

// Authoring helpers for the sample worksheets below.
const t = (text: string): SampleSpan => ({ text })
const key = (text: string): SampleSpan => ({ text, answer: true })
const line = (kind: SampleLine['kind'], ...spans: SampleSpan[]): SampleLine => ({ kind, spans })

// ─── One profile per question type ───────────────────────────────────────────

export const PROFILE_BY_TYPE: Record<QuestionType, ImportProfile> = {
  mcq: {
    slug: 'mcq',
    type: 'mcq',
    label: 'ปรนัย (เลือกตอบ)',
    blurb: 'ทั้งไฟล์เป็นข้อเลือกตอบ ระบบอ่านตัวเลือกและเฉลยที่ทำเครื่องหมายสีไว้',
    status: 'ready',
    rules: [
      NUMBERING,
      { id: 'choices', text: 'ตัวเลือกขึ้นต้นด้วย 1) 2) 3) 4) จะอยู่ในตารางหรือคนละบรรทัดก็ได้' },
      ANSWER_MARK,
      EQUATION,
    ],
    sample: [
      line('heading', t('แบบทดสอบวิชาฟิสิกส์ บทที่ 2 การเคลื่อนที่')),
      line('question', t('รถยนต์เคลื่อนที่ด้วยความเร็วคงที่ 20 เมตรต่อวินาที เป็นเวลา 6 วินาที รถยนต์เคลื่อนที่ได้ระยะทางเท่าใด')),
      line('choice', t('60 เมตร')),
      line('choice', key('120 เมตร')),
      line('choice', t('180 เมตร')),
      line('choice', t('240 เมตร')),
      line('question', t('ข้อใดเป็นหน่วยของความเร่ง')),
      line('choice', t('เมตรต่อวินาที')),
      line('choice', key('เมตรต่อวินาที²')),
      line('choice', t('นิวตัน')),
      line('choice', t('จูล')),
    ],
    limits: [
      'รูปผูกกับข้อ ไม่ได้ผูกกับตัวเลือกรายข้อ — ตัวเลือกที่เป็นรูปต้องแนบเองในเว็บ',
      EMF_LIMIT,
    ],
    createHref: '/questions/new/mcq',
  },

  written: {
    slug: 'random',
    type: 'written',
    label: 'เติมคำตอบตัวเลข',
    blurb: 'โจทย์คำนวณที่ตอบเป็นตัวเลข ระบบอ่านทั้งตัวโจทย์ ข้อย่อย และเฉลยที่เขียนไว้ในวงเล็บ',
    status: 'ready',
    rules: [
      NUMBERING,
      { id: 'parts', text: 'ข้อย่อย ก) ข) ค) พิมพ์ขึ้นบรรทัดใหม่ หรือใช้รายการย่อยของ Word ก็ได้ ระบบแยกเป็นช่องคำตอบให้ข้อละช่อง' },
      ANSWER_MARK,
      ANSWER_POSITION,
      { id: 'answer-multi', text: 'ข้อที่ต้องตอบหลายค่า ทำเครื่องหมายรวมกันแล้วคั่นด้วยจุลภาค เช่น (200 m/s, 10 m/s²) ระบบแยกเป็นช่องกรอกให้ช่องละคำตอบ' },
      EQUATION,
    ],
    sample: [
      line('heading', t('ใบงานที่ 3 แรงและกฎการเคลื่อนที่')),
      line('question', t('วัตถุมวล 5 กิโลกรัม ถูกแรง 20 นิวตันกระทำในแนวราบ')),
      line('part', t('จงหาความเร่งของวัตถุ ('), key('4 m/s²'), t(')')),
      line('part', t('ถ้าวัตถุเริ่มจากหยุดนิ่ง หลังจาก 4 วินาที วัตถุมีความเร็วเท่าใด ('), key('16 m/s'), t(')')),
      line('question', t('ล้อหมุนด้วยความถี่คงที่ 420 รอบต่อนาที จงหาอัตราเร็วเชิงมุมในหน่วยเรเดียนต่อวินาที ('), key('14pi'), t(')')),
      line('question', t('พัดลมช้าลงจาก 750 เป็น 150 รอบต่อนาที ใน 30 วินาที จงหาความเร่งเชิงมุม และจำนวนรอบที่หมุนได้ ('), key('-2pi/3, 225 รอบ'), t(')')),
    ],
    limits: [
      'ค่าคลาดเคลื่อนที่ยอมรับตั้งให้เป็น 0.1 ทุกข้อ ปรับรายข้อได้ในฟอร์ม',
      'ข้อที่ไม่ได้ทำเครื่องหมายเฉลยไว้ จะเข้ามาเป็นบรรยายให้ครูตรวจเอง ไม่ถูกทิ้ง',
      'โจทย์ที่สุ่มตัวเลขต้องตั้งค่าช่วงของตัวแปรในเว็บ ใบงานกระดาษไม่มีข้อมูลส่วนนี้',
      EMF_LIMIT,
    ],
    createHref: '/questions/new/random',
  },

  essay: {
    slug: 'essay',
    type: 'essay',
    label: 'อัตนัย (บรรยาย)',
    blurb: 'ข้อเขียนตอบอิสระที่ครูตรวจเอง ไม่ต้องมีเฉลยในไฟล์',
    status: 'ready',
    rules: [NUMBERING, EQUATION],
    sample: [
      line('heading', t('ข้อสอบปลายภาค ตอนที่ 2 อธิบายความ')),
      line('question', t('จงอธิบายความแตกต่างระหว่างระยะทางกับการกระจัด พร้อมยกตัวอย่างประกอบ')),
      line('question', t('เพราะเหตุใดวัตถุที่ตกอย่างอิสระในสุญญากาศจึงถึงพื้นพร้อมกันแม้มีมวลต่างกัน')),
    ],
    limits: ['ระบบไม่ตรวจให้ ครูตรวจและให้คะแนนเองในหน้าตรวจงาน', EMF_LIMIT],
    createHref: '/questions/new/essay',
  },

  fill_blank: {
    slug: 'fill-blank',
    type: 'fill_blank',
    label: 'เติมคำในช่องว่าง',
    blurb: 'ข้อความที่เว้นช่องให้นักเรียนเติมคำ — เขียนประโยคเต็มแล้วทำสีคำที่เป็นคำตอบ',
    status: 'ready',
    rules: [
      NUMBERING,
      ANSWER_MARK,
      { id: 'blank-answer', text: 'พิมพ์ประโยคเต็มพร้อมคำตอบ แล้วทำเครื่องหมายเฉพาะคำที่เป็นคำตอบ — ระบบจะเปลี่ยนคำนั้นเป็นช่องให้นักเรียนกรอก' },
      { id: 'blank-count', text: 'หนึ่งข้อมีช่องว่างได้หลายช่อง ทำเครื่องหมายทุกคำที่เป็นคำตอบ ระบบเรียงเลขช่องให้เอง' },
      { id: 'blank-partial', text: 'อย่าทำเครื่องหมายทั้งประโยค — ถ้าทั้งข้อถูกทำสีเหมือนกันหมด ระบบจะถือว่าเป็นการจัดรูปแบบ ไม่ใช่คำตอบ' },
    ],
    sample: [
      line('heading', t('ใบงาน เติมคำในช่องว่าง')),
      line('question', t('หน่วยของแรงในระบบเอสไอคือ '), key('นิวตัน')),
      line('question', t('น้ำบริสุทธิ์เดือดที่อุณหภูมิ '), key('100'), t(' องศาเซลเซียส และแข็งตัวที่ '), key('0'), t(' องศาเซลเซียส')),
      line('question', t('สารที่นำไฟฟ้าได้ดีที่สุดคือ '), key('เงิน'), t(' รองลงมาคือ '), key('ทองแดง')),
    ],
    limits: [
      'ช่องที่รับคำตอบได้หลายแบบ (เช่น สะกดได้สองอย่าง) ต้องเพิ่มคำที่ยอมรับเองในเว็บ',
      'ทุกช่องเข้ามาเป็นแบบ "ฟิกคำตอบ" (ระบบตรวจให้ ไม่สนตัวพิมพ์เล็กใหญ่) เปลี่ยนเป็นดรอปดาวน์หรือให้ครูตรวจเองได้ในฟอร์ม',
      EMF_LIMIT,
    ],
    createHref: '/questions/new/fill-blank',
  },

  true_false: {
    slug: 'true-false',
    type: 'true_false',
    label: 'ถูก-ผิด',
    blurb: 'ข้อความหลายบรรทัดให้นักเรียนตัดสินว่าถูกหรือผิด',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'statements', text: 'ข้อความย่อยบรรทัดละข้อ ใช้รายการย่อยของ Word' },
      { id: 'true-mark', text: 'บรรทัดที่เป็นจริงทำเครื่องหมายสี บรรทัดที่ไม่ได้ทำถือว่าเป็นเท็จ' },
    ],
    sample: [
      line('question', t('พิจารณาข้อความต่อไปนี้ว่าถูกหรือผิด')),
      line('part', key('น้ำบริสุทธิ์เดือดที่ 100 องศาเซลเซียส ที่ความดัน 1 บรรยากาศ')),
      line('part', t('เสียงเดินทางในสุญญากาศได้เร็วกว่าในอากาศ')),
      line('part', key('แรงเสียดทานมีทิศตรงข้ามกับทิศการเคลื่อนที่')),
    ],
    limits: [],
    createHref: '/questions/new/true-false',
  },

  matching: {
    slug: 'matching',
    type: 'matching',
    label: 'จับคู่',
    blurb: 'สองรายการที่สัมพันธ์กัน ให้นักเรียนโยงเส้นจับคู่',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'two-columns', text: 'ใช้ตาราง 2 คอลัมน์ ซ้ายคือโจทย์ ขวาคือคำตอบของแถวนั้น' },
      { id: 'row-alignment', text: 'คู่ที่ถูกต้องต้องอยู่แถวเดียวกัน ระบบจะสลับฝั่งขวาให้นักเรียนเอง' },
    ],
    sample: [
      line('question', t('จงจับคู่ปริมาณกับหน่วยในระบบเอสไอให้ถูกต้อง')),
      line('part', t('แรง — นิวตัน')),
      line('part', t('งาน — จูล')),
      line('part', t('กำลัง — วัตต์')),
    ],
    limits: ['ตัวเลือกลวง (ฝั่งขวาที่ไม่มีคู่) ต้องเพิ่มเองในเว็บ'],
    createHref: '/questions/new/matching',
  },

  ordering: {
    slug: 'ordering',
    type: 'ordering',
    label: 'เรียงลำดับ',
    blurb: 'ขั้นตอนหรือเหตุการณ์ที่ต้องเรียงให้ถูกลำดับ',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'correct-order', text: 'พิมพ์รายการโดยเรียงถูกลำดับไว้แล้วในไฟล์ ระบบจะสลับให้นักเรียนเอง' },
      { id: 'items', text: 'แต่ละรายการอยู่คนละบรรทัด ใช้รายการย่อยของ Word' },
    ],
    sample: [
      line('question', t('จงเรียงขั้นตอนของกระบวนการทางวิทยาศาสตร์ให้ถูกต้อง')),
      line('part', t('ตั้งปัญหา')),
      line('part', t('ตั้งสมมติฐาน')),
      line('part', t('ออกแบบและทำการทดลอง')),
      line('part', t('สรุปผลการทดลอง')),
    ],
    limits: [],
    createHref: '/questions/new/ordering',
  },

  classify: {
    slug: 'classify',
    type: 'classify',
    label: 'ตารางจำแนก',
    blurb: 'ตารางเดียว แถวคือสิ่งที่ให้จำแนก คอลัมน์คือมิติการจำแนก',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'table-header', text: 'หัวตารางแถวแรกคือมิติการจำแนก คอลัมน์แรกคือสิ่งที่ให้จำแนก' },
      { id: 'checkbox', text: 'ในแต่ละช่องพิมพ์ตัวเลือกทั้งหมดของคอลัมน์นั้น แล้วใช้ ☑ หน้าตัวที่ถูก และ ☐ หน้าตัวที่เหลือ' },
    ],
    sample: [
      line('question', t('จงจำแนกพอลิเมอร์ต่อไปนี้')),
      line('part', t('เนื้อหมู · ☑ พอลิเมอร์ธรรมชาติ ☐ พอลิเมอร์สังเคราะห์')),
      line('part', t('ยางรัดของ · ☐ พอลิเมอร์ธรรมชาติ ☑ พอลิเมอร์สังเคราะห์')),
    ],
    limits: ['รูปประจำแถวต้องอยู่ในช่องคอลัมน์แรกของแถวนั้น ไม่ใช่รูปลอยบนหน้ากระดาษ'],
    createHref: '/questions/new/classify',
  },

  image_label: {
    slug: 'image-label',
    type: 'image_label',
    label: 'ติดป้ายบนรูป',
    blurb: 'รูปเดียวที่นักเรียนตอบว่าแต่ละจุดคืออะไร',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'one-picture', text: 'หนึ่งข้อมีรูปเดียว วางรูปแบบอยู่ในบรรทัด (In Line with Text) ไม่ใช่รูปลอย' },
      { id: 'label-list', text: 'รายการคำตอบของแต่ละจุดพิมพ์เป็นบรรทัดย่อยใต้รูป' },
    ],
    sample: [
      line('question', t('จงระบุส่วนประกอบของเซลล์พืชตามหมายเลขในภาพ')),
      line('part', t('ผนังเซลล์')),
      line('part', t('คลอโรพลาสต์')),
      line('part', t('แวคิวโอล')),
    ],
    limits: [
      'ตำแหน่งของจุดบนรูปไม่มีทางอยู่ในไฟล์ Word — นำเข้าได้แค่รูปกับรายการคำตอบ แล้วครูต้องคลิกวางจุดเองในเว็บ',
    ],
    createHref: '/questions/new/image-label',
  },

  composite: {
    slug: 'composite',
    type: 'composite',
    label: 'โจทย์ผสม (หลายรูปแบบ)',
    blurb: 'โจทย์หลักเดียว แต่ข้อย่อยเป็นคนละชนิดกันได้',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'stem', text: 'สถานการณ์หลักอยู่ย่อหน้าแรกของข้อ' },
      { id: 'sub-questions', text: 'ข้อย่อย ก) ข) ค) ใช้รายการย่อยของ Word และทำเครื่องหมายเฉลยตามกติกาของชนิดนั้น ๆ' },
    ],
    sample: [
      line('question', t('จากกราฟความเร็ว-เวลาที่กำหนดให้')),
      line('part', t('ช่วงใดที่วัตถุมีความเร่งเป็นศูนย์')),
      line('part', t('จงหาระยะทางทั้งหมดใน 10 วินาทีแรก')),
    ],
    limits: ['ข้อย่อยที่เป็นตารางจำแนกหรือติดป้ายบนรูปยังทำในโจทย์ผสมไม่ได้'],
    createHref: '/questions/new/composite',
  },

  file_upload: {
    slug: 'file-upload',
    type: 'file_upload',
    label: 'ส่งไฟล์งาน',
    blurb: 'คำสั่งงานที่นักเรียนส่งเป็นไฟล์กลับมา',
    status: 'planned',
    rules: [
      NUMBERING,
      { id: 'instruction', text: 'คำสั่งงานหนึ่งย่อหน้าต่อหนึ่งข้อ ไม่ต้องมีเฉลย' },
    ],
    sample: [
      line('question', t('ให้นักเรียนถ่ายภาพการทดลองพร้อมเขียนผลการทดลอง แล้วส่งเป็นไฟล์ PDF')),
    ],
    limits: [
      'ประเภทนี้แทบไม่มีอะไรให้อ่านจากไฟล์ การสร้างในเว็บโดยตรงเร็วกว่า',
    ],
    createHref: '/questions/new/file-upload',
  },
}

/**
 * The reader that decides each โจทย์'s type on its own.
 *
 * Kept as its own profile rather than as a flag, because it is the only entry
 * that answers "ไฟล์เดียวมีทั้งปรนัยและอัตนัย" — a real exam paper's shape, and
 * the one case a per-type screen cannot serve.
 */
export const AUTO_PROFILE: ImportProfile = {
  slug: 'auto',
  type: null,
  label: 'อ่านอัตโนมัติ (หลายประเภทในไฟล์เดียว)',
  blurb: 'ไฟล์ที่มีทั้งปรนัยและข้อเขียนปนกัน ระบบเดาชนิดให้ทีละข้อ แล้วครูแก้ได้ก่อนนำเข้า',
  status: 'ready',
  rules: [
    NUMBERING,
    { id: 'choices', text: 'ข้อที่มีตัวเลือก 1) 2) 3) 4) จะถูกอ่านเป็นปรนัย ข้อที่ไม่มีจะเป็นข้อเขียน' },
    ANSWER_MARK,
    ANSWER_POSITION,
    EQUATION,
  ],
  sample: [
    line('heading', t('ข้อสอบกลางภาค ตอนที่ 1 ปรนัย')),
    line('question', t('ข้อใดคือหน่วยของกำลังไฟฟ้า')),
    // Four, not three: a โจทย์ with three is read as possibly being ก) ข) ค)
    // sub-questions and comes back carrying a warning, which an example file
    // must never do.
    line('choice', t('โวลต์')),
    line('choice', key('วัตต์')),
    line('choice', t('แอมแปร์')),
    line('choice', t('โอห์ม')),
    line('heading', t('ตอนที่ 2 แสดงวิธีทำ')),
    line('question', t('ลวดความต้านทาน 20 โอห์ม ต่อกับความต่างศักย์ 12 โวลต์ จงหากระแสไฟฟ้าที่ไหลผ่าน ('), key('0.6 A'), t(')')),
    line('question', t('จงอธิบายหลักการทำงานของหม้อแปลงไฟฟ้า')),
  ],
  limits: [
    'อ่านได้ 3 ชนิด: ปรนัย เติมคำตอบตัวเลข และอัตนัย — ข้อที่เป็นชนิดอื่นจะลงมาเป็นอัตนัยให้ครูตรวจเอง',
    'ข้อที่ไม่มีทั้งตัวเลือกและเฉลยที่ทำเครื่องหมายไว้ จะเข้ามาเป็นอัตนัยให้ครูตรวจเอง',
    EMF_LIMIT,
  ],
  createHref: '/questions/new',
}

/** Chooser order: the reader first, then what works, then what is coming. */
const PROFILE_ORDER: QuestionType[] = [
  'mcq', 'written', 'essay',
  'fill_blank', 'true_false', 'matching', 'ordering', 'classify', 'image_label',
  'composite', 'file_upload',
]

export const IMPORT_PROFILES: ImportProfile[] = [
  AUTO_PROFILE,
  ...PROFILE_ORDER.map(type => PROFILE_BY_TYPE[type]),
]

export function findProfile(slug: string): ImportProfile | null {
  return IMPORT_PROFILES.find(profile => profile.slug === slug) ?? null
}

/** Plain text of one sample line — for titles, tests and the .docx generator. */
export function sampleLineText(line: SampleLine): string {
  return line.spans.map(span => span.text).join('')
}

export interface NumberedSampleLine {
  line: SampleLine
  /** What is printed in front of this line: `2.`, `3)`, `ข)`, or nothing. */
  marker: string
}

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']

/**
 * The numbering a reader sees down the left of the sample.
 *
 * Worked out rather than stored, because it belongs to the list and not to any
 * one โจทย์ — the same reason Word keeps it in `numbering.xml` and the same
 * reason a file that types its numbers by hand is the first thing the rules
 * ask a teacher not to do.
 *
 * The screen prints every marker. The generated .docx prints only the choice
 * markers and lets Word draw the rest from the list definition, which is the
 * shape the parser reads back.
 */
export function numberSampleLines(sample: SampleLine[]): NumberedSampleLine[] {
  let question = 0
  let choice = 0
  let part = 0

  return sample.map(line => {
    if (line.kind === 'question') {
      question += 1
      choice = 0
      part = 0
      return { line, marker: `${question}.` }
    }
    if (line.kind === 'choice') {
      choice += 1
      return { line, marker: `${choice})` }
    }
    if (line.kind === 'part') {
      part += 1
      return { line, marker: `${PART_LABELS[part - 1] ?? part})` }
    }
    return { line, marker: '' }
  })
}

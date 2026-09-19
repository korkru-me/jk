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

/**
 * `not-applicable` is a type that deliberately has no Word import — not one
 * that is merely unfinished. It stays in the register so that adding a
 * question type still forces the question to be answered, and so that the
 * answer is written down where the next person can read it.
 */
export type ImportProfileStatus = 'ready' | 'planned' | 'not-applicable'

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
  /** `question` is a numbered item; `part` is one level deeper. `item` is one
   *  line of a เรียงลำดับ list, which is numbered like a `choice` and is not
   *  one — the difference is the whole reading of that type. `pair` is one row
   *  of a จับคู่ table, which is the only sample line with two cells. */
  kind: 'heading' | 'question' | 'choice' | 'part' | 'item' | 'pair'
  /** The line, or for a `pair` its left-hand cell. */
  spans: SampleSpan[]
  /** A `pair`'s right-hand cell. An empty array is a choice with no ข้อ beside
   *  it, which is how a worksheet writes a ตัวเลือกลวง. */
  right?: SampleSpan[]
}

export interface ImportProfile {
  /** URL segment. Spelled the same as `/questions/new/<slug>` on purpose, so a
   *  teacher meets one name and one icon for a type whether they type it in or
   *  bring it from a file. */
  slug: string
  /** The type this profile produces, or null for the reader that decides per โจทย์. */
  type: QuestionType | null
  /** The name on the card. */
  label: string
  /**
   * The same thing named inside a sentence: "นำเข้า<noun>", "ไฟล์ที่มี<noun>".
   *
   * Separate from `label` because a card title and a phrase read differently —
   * "โจทย์ผสม (หลายชนิดในข้อเดียว)" is a good card and "นำเข้าโจทย์โจทย์ผสม" is
   * not — and because the automatic reader is not a ประเภทโจทย์ at all, so
   * every sentence about it has to avoid calling it one.
   */
  noun: string
  /** One line, for the card on the chooser. */
  blurb: string
  status: ImportProfileStatus
  rules: ImportRule[]
  sample: SampleLine[]
  limits: string[]
  /** Where to author this type by hand instead. */
  createHref: string
  /** Why a `not-applicable` type is not imported. Read by nobody but the next
   *  person to ask "where did this one go?" — which is the point. */
  notApplicableReason?: string
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
/** One row of a จับคู่ table: the ข้อ on the left, the ตัวเลือก on the right. */
const pair = (left: SampleSpan[], right: SampleSpan[]): SampleLine => ({ kind: 'pair', spans: left, right })

// ─── One profile per question type ───────────────────────────────────────────

export const PROFILE_BY_TYPE: Record<QuestionType, ImportProfile> = {
  mcq: {
    slug: 'mcq',
    type: 'mcq',
    label: 'ปรนัย (เลือกตอบ)',
    noun: 'โจทย์ปรนัย',
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
    noun: 'โจทย์เติมคำตอบตัวเลข',
    blurb: 'โจทย์คำนวณที่ตอบเป็นตัวเลข ระบบอ่านทั้งตัวโจทย์ ข้อย่อย และเฉลยที่ทำเครื่องหมายไว้ท้ายข้อ',
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
    noun: 'โจทย์อัตนัย (บรรยาย)',
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
    noun: 'โจทย์เติมคำในช่องว่าง',
    blurb: 'ข้อความที่เว้นช่องให้นักเรียนเติมคำ — เขียนประโยคเต็มแล้วทำสีคำที่เป็นคำตอบ',
    status: 'ready',
    rules: [
      NUMBERING,
      ANSWER_MARK,
      { id: 'blank-answer', text: 'พิมพ์ประโยคเต็มพร้อมคำตอบ แล้วทำเครื่องหมายเฉพาะคำที่เป็นคำตอบ — ระบบจะเปลี่ยนคำนั้นเป็นช่องให้นักเรียนกรอก' },
      { id: 'blank-count', text: 'หนึ่งข้อมีช่องว่างได้หลายช่อง ทำเครื่องหมายทุกคำที่เป็นคำตอบ ระบบเรียงเลขช่องให้เอง' },
      { id: 'blank-partial', text: 'อย่าทำเครื่องหมายทั้งประโยค — ถ้าทั้งข้อถูกทำสีเหมือนกันหมด ระบบจะถือว่าเป็นการจัดรูปแบบ ไม่ใช่คำตอบ' },
      { id: 'blank-placeholder', text: 'ถ้าไฟล์เว้นช่องไว้เป็นจุดไข่ปลา .......... หรือขีดเส้นใต้ ______ อยู่แล้ว ระบบอ่านเป็นช่องกรอกให้เหมือนกัน — แต่ไฟล์ไม่ได้บอกคำตอบ ช่องนั้นจึงเข้ามาเป็นแบบครูตรวจเอง' },
    ],
    sample: [
      line('heading', t('ใบงาน เติมคำในช่องว่าง')),
      line('question', t('หน่วยของแรงในระบบเอสไอคือ '), key('นิวตัน')),
      line('question', t('ดาวเคราะห์ที่อยู่ใกล้ดวงอาทิตย์ที่สุดคือ ..........')),
      line('question', t('น้ำบริสุทธิ์เดือดที่อุณหภูมิ '), key('100'), t(' องศาเซลเซียส และแข็งตัวที่ '), key('0'), t(' องศาเซลเซียส')),
      line('question', t('สารที่นำไฟฟ้าได้ดีที่สุดคือ '), key('เงิน'), t(' รองลงมาคือ '), key('ทองแดง')),
    ],
    limits: [
      'ช่องที่เว้นไว้เป็นจุดไข่ปลาหรือขีดเส้นใต้ ระบบไม่รู้คำตอบ ต้องพิมพ์เองในฟอร์มถ้าอยากให้ระบบตรวจให้',
      'ช่องที่รับคำตอบได้หลายแบบ (เช่น สะกดได้สองอย่าง) ต้องเพิ่มคำที่ยอมรับเองในเว็บ',
      'ช่องที่รู้คำตอบเข้ามาเป็นแบบ "ฟิกคำตอบ" (ระบบตรวจให้ ไม่สนตัวพิมพ์เล็กใหญ่) เปลี่ยนเป็นดรอปดาวน์ได้ในฟอร์ม',
      EMF_LIMIT,
    ],
    createHref: '/questions/new/fill-blank',
  },

  true_false: {
    slug: 'true-false',
    type: 'true_false',
    label: 'ถูก-ผิด',
    noun: 'โจทย์ถูก-ผิด',
    blurb: 'ข้อความหลายบรรทัดให้นักเรียนตัดสินว่าถูกหรือผิด — ทำ ✓ หรือ x ไว้หน้าข้อความ',
    status: 'ready',
    rules: [
      NUMBERING,
      { id: 'statements', text: 'ข้อความย่อยเขียนเป็น 8.1 8.2 8.3 ใต้ข้อหลัก (เลขหน้าจุดต้องตรงกับเลขข้อ)' },
      { id: 'tick', text: 'ทำ ✓ หน้าข้อความที่ถูก และ x หน้าข้อความที่ผิด — แทรก ✓ จากเมนู Symbol ของ Word ได้ ระบบอ่านออก' },
      ANSWER_MARK,
      { id: 'statement-score', text: 'จะเขียนคะแนนท้ายข้อความ เช่น (0.25 คะแนน) ก็ได้ ระบบใช้เป็นคะแนนต่อข้อความให้' },
      { id: 'lead-in', text: 'ข้อความนำหน้าข้อหลัก เช่น "พิจารณาการปล่อยวัตถุในแนวดิ่ง โดยไม่คิดแรงต้านอากาศ" จะกลายเป็นคำสั่งนำ ที่นักเรียนอ่านก่อนแต่ไม่ต้องตัดสินถูก-ผิด' },
    ],
    sample: [
      line('heading', t('แบบทดสอบ ตอนที่ 3 ถูก-ผิด')),
      line('question', t('พิจารณาการปล่อยวัตถุในแนวดิ่ง โดยไม่คิดแรงต้านอากาศ (1 คะแนน)')),
      line('part', t('……… '), key('x'), t(' …… วัตถุที่ตกแบบเสรีจะมีความเร่งเพิ่มขึ้นเรื่อย ๆ ตามเวลา (0.25 คะแนน)')),
      line('part', t('……… '), key('✓'), t(' …… วัตถุที่ปล่อยจากที่สูงจะมีความเร็วเพิ่มขึ้นเท่ากันทุก ๆ วินาที (0.25 คะแนน)')),
      line('part', t('……… '), key('✓'), t(' …… ระยะทางที่วัตถุตกในแต่ละวินาทีจะเพิ่มขึ้น (0.25 คะแนน)')),
      line('part', t('……… '), key('x'), t(' …… วัตถุที่มีมวลมากกว่าจะตกถึงพื้นก่อน (0.25 คะแนน)')),
    ],
    limits: [
      'ข้อความที่ไม่ได้ทำเครื่องหมายเลย ระบบถือว่าผิด และจะเตือนไว้ให้ตรวจ',
      'ช่องให้เขียนเหตุผลปิดไว้ก่อน เปิดได้ในฟอร์มถ้าต้องการให้นักเรียนอธิบาย',
    ],
    createHref: '/questions/new/true-false',
  },

  matching: {
    slug: 'matching',
    type: 'matching',
    label: 'จับคู่',
    noun: 'โจทย์จับคู่',
    blurb: 'ตาราง 2 คอลัมน์ เขียนตัวอักษรของคำตอบลงในช่องว่างหน้าข้อความ — แบบเดียวกับใบงานที่ใช้อยู่',
    status: 'ready',
    rules: [
      NUMBERING,
      {
        id: 'match-table',
        text: 'ใช้ตาราง 2 คอลัมน์ · คอลัมน์ซ้ายคือข้อความที่ต้องจับคู่ · คอลัมน์ขวาคือตัวเลือก',
      },
      {
        id: 'match-labels',
        text: 'ใส่ตัวอักษร ก. ข. ค. ไว้หน้าตัวเลือกฝั่งขวาทุกตัว — เฉลยชี้ถึงตัวอักษรพวกนี้',
      },
      ANSWER_MARK,
      {
        id: 'match-key',
        text: 'เขียนตัวอักษรของตัวเลือกที่ถูกลงในช่องว่างหน้าข้อความฝั่งซ้าย เช่น "๒. ………ซ………. ที่มาของนิทาน" · ตัวอักษรที่เขียนไว้กลางจุดไข่ปลาระบบอ่านออกแม้ไม่ได้ทำสี · ข้อไหนยังไม่รู้เฉลยจะเว้นไว้ก็ได้ แล้วมาจับคู่ในเว็บทีหลัง',
      },
      {
        id: 'match-distractor',
        text: 'ตัวเลือกฝั่งขวาที่ไม่มีคู่ (แถวที่ช่องซ้ายเว้นว่าง) เข้ามาเป็น "ตัวเลือกลวง" ให้อัตโนมัติ',
      },
      {
        id: 'match-mode',
        text: 'เขียนคำว่า "โยงเส้น" ไว้ในคำชี้แจง ระบบจะตั้งวิธีตอบเป็นโยงเส้นให้ · ไม่เขียนก็จะเป็นแบบลากตัวเลือกมาวางในช่อง',
      },
    ],
    sample: [
      line('heading', t('แบบทดสอบ ตอนที่ 4 จับคู่')),
      line('question', t('คำชี้แจง จงนำตัวอักษรหน้าตัวเลือกมาเขียนในช่องว่างหน้าข้อความที่สัมพันธ์กัน')),
      pair([t('……'), key('ค'), t('…… หน่วยของแรง')], [t('จูล')]),
      pair([t('……'), key('ก'), t('…… หน่วยของงาน')], [t('วัตต์')]),
      pair([t('……'), key('ข'), t('…… หน่วยของกำลัง')], [t('นิวตัน')]),
      pair([t('……'), key('จ'), t('…… หน่วยของกระแสไฟฟ้า')], [t('โอห์ม')]),
      // A choice with no ข้อ beside it: the ตัวเลือกลวง that stops the last
      // pair being had by elimination.
      pair([], [t('แอมแปร์')]),
      line('question', t('จงโยงเส้นจับคู่คำกับความหมายให้ถูกต้อง')),
      pair([t('……'), key('ข'), t('…… วัฏจักรน้ำ')], [t('การเปลี่ยนของเหลวเป็นไอ')]),
      pair([t('……'), key('ก'), t('…… การระเหย')], [t('การหมุนเวียนของน้ำในธรรมชาติ')]),
      pair([t('……'), key('ค'), t('…… การควบแน่น')], [t('การเปลี่ยนไอเป็นของเหลว')]),
    ],
    limits: [
      'แถวในตารางไม่ใช่เฉลย — ใบงานจริงตั้งใจสลับซ้าย-ขวาไว้ ระบบจึงอ่านเฉพาะตัวอักษรที่เขียนไว้ในช่องว่างเท่านั้น',
      'ข้อที่ไฟล์ไม่ได้บอกเฉลย จะถูกจับคู่เรียงตามลำดับไว้ก่อน ซึ่งยังไม่ใช่เฉลย และจะยังนำเข้าไม่ได้จนกว่าจะกด "แก้ไข" จับคู่ให้ครบ',
      'ฟอร์มจับคู่รับได้สูงสุด 12 คู่ และตัวเลือกลวง 6 ตัว',
      EMF_LIMIT,
    ],
    createHref: '/questions/new/matching',
  },

  ordering: {
    slug: 'ordering',
    type: 'ordering',
    label: 'เรียงลำดับ',
    noun: 'โจทย์เรียงลำดับ',
    blurb: 'ขั้นตอนหรือเหตุการณ์ที่ต้องเรียงให้ถูกลำดับ — อ่านได้ทั้งข้อสอบที่มีตัวเลือก 2-1-4-3 และใบงานที่พิมพ์เรียงถูกไว้แล้ว',
    status: 'ready',
    rules: [
      NUMBERING,
      {
        id: 'order-items',
        text: 'พิมพ์รายการที่ต้องเรียงบรรทัดละรายการ ขึ้นต้นด้วย 1. 2. 3. 4. หรือใช้รายการย่อยของ Word ก็ได้',
      },
      {
        id: 'order-options',
        text: 'ข้อสอบกระดาษที่มีตัวเลือกลำดับท้ายข้อ เช่น "2-1-4-3" ใส่มาได้เลย ระบบใช้หาว่าลำดับไหนถูก แล้วตัดตัวเลือกทิ้ง เพราะบนเว็บนักเรียนลากเรียงเอง ไม่ต้องเลือกข้อ',
      },
      ANSWER_MARK,
      {
        id: 'order-key',
        text: 'ทำเครื่องหมายที่ตัวเลือกลำดับที่ถูก · ถ้าเป็นใบงานที่พิมพ์รายการเรียงถูกไว้อยู่แล้วและไม่มีตัวเลือก ไม่ต้องทำเครื่องหมาย ระบบถือว่าลำดับที่พิมพ์คือลำดับที่ถูก',
      },
    ],
    sample: [
      line('heading', t('ตอนที่ 1 การเรียงประโยค')),
      line('question', t('การเรียงประโยคในข้อใดถูกต้อง')),
      line('item', t('เป็นการแสดงออกให้เห็นถึงภูมิปัญญา')),
      line('item', t('การที่มนุษย์รู้จักคิดและทอผ้าขึ้นมาได้นั้น')),
      line('item', t('ตลอดจนการสร้างสรรค์ลวดลายบนผืนผ้า')),
      line('item', t('ในการเลือกสรรวัสดุ วิธีการที่เหมาะสม กระบวนการและลำดับขั้นตอนในการทอผ้า')),
      line('choice', key('2-1-4-3')),
      line('choice', t('2-1-3-4')),
      line('choice', t('4-1-2-3')),
      line('choice', t('4-2-3-1')),
      line('question', t('จงเรียงขั้นตอนของกระบวนการทางวิทยาศาสตร์ให้ถูกต้อง')),
      line('item', t('ตั้งปัญหา')),
      line('item', t('ตั้งสมมติฐาน')),
      line('item', t('ออกแบบและทำการทดลอง')),
      line('item', t('สรุปผลการทดลอง')),
    ],
    limits: [
      'ข้อสอบที่แจกนักเรียนมักไม่ได้ทำเฉลยไว้ ข้อแบบนั้นเข้ามาโดยเรียงตามที่พิมพ์ในไฟล์ (ซึ่งเป็นลำดับที่สลับไว้) และจะยังนำเข้าไม่ได้จนกว่าจะเลือกลำดับที่ถูกบนการ์ด',
      'รูปที่อยู่ในบรรทัดของรายการ เข้ามาเป็นรูปของทั้งข้อ ถ้าอยากให้อยู่กับรายการใดรายการหนึ่ง ต้องใส่เองในฟอร์ม',
      'ฟอร์มเรียงลำดับรับได้สูงสุด 8 รายการต่อข้อ ข้อที่มีมากกว่านั้นนำเข้าได้ แต่จะเพิ่มรายการใหม่ในฟอร์มไม่ได้',
      EMF_LIMIT,
    ],
    createHref: '/questions/new/ordering',
  },

  classify: {
    slug: 'classify',
    type: 'classify',
    label: 'ตารางจำแนก',
    noun: 'โจทย์ตารางจำแนก',
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
    noun: 'โจทย์ติดป้ายบนรูป',
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
    label: 'โจทย์ผสม (หลายชนิดในข้อเดียว)',
    noun: 'โจทย์ผสม',
    blurb: 'โจทย์ข้อเดียวที่มีคำถามย่อยหลายชนิด เช่น ถูก-ผิด กับ เติมคำ อยู่ในข้อเดียวกัน',
    // Not shown on the chooser. A โจทย์ผสม is several kinds nested inside one
    // ข้อ, and a Word file has no way to say which kind each sub-question is —
    // ก) could be ถูก-ผิด, เติมคำ, ปรนัย or a calculation, and only the teacher
    // knows which. They would have to choose for every sub-question anyway,
    // which is the form's job and is where it is already done.
    status: 'not-applicable',
    notApplicableReason: 'ไฟล์ Word บอกไม่ได้ว่าข้อย่อยแต่ละอันเป็นชนิดไหน ครูต้องเลือกเองทุกข้อย่อยอยู่ดี — ประกอบในฟอร์มตรงกว่า',
    rules: [NUMBERING],
    sample: [
      line('question', t('จากกราฟความเร็ว-เวลาที่กำหนดให้')),
      line('part', t('ช่วงใดที่วัตถุมีความเร่งเป็นศูนย์')),
      line('part', t('จงหาระยะทางทั้งหมดใน 10 วินาทีแรก')),
    ],
    limits: [],
    createHref: '/questions/new/composite',
  },

  file_upload: {
    slug: 'file-upload',
    type: 'file_upload',
    label: 'ส่งไฟล์งาน',
    noun: 'โจทย์ส่งไฟล์งาน',
    blurb: 'คำสั่งงานที่นักเรียนส่งเป็นไฟล์กลับมา',
    // Not shown on the chooser at all. This one is modelled on posting an
    // assignment the way Google Classroom does: the teacher writes the
    // instruction and posts it. There is nothing in a .docx to read but that
    // one instruction, so an import screen would be a longer way round to the
    // same typing — and a card promising otherwise wastes the teacher's time
    // before it disappoints them.
    status: 'not-applicable',
    notApplicableReason: 'คำสั่งงานหนึ่งย่อหน้าไม่มีอะไรให้อ่านจากไฟล์ — ครูโพสต์งานในเว็บได้เร็วกว่า',
    rules: [NUMBERING],
    sample: [
      line('question', t('ให้นักเรียนถ่ายภาพการทดลองพร้อมเขียนผลการทดลอง แล้วส่งเป็นไฟล์ PDF')),
    ],
    limits: [],
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
  label: 'อ่านอัตโนมัติ (คละชนิดในไฟล์เดียว)',
  // Never "โจทย์อ่านอัตโนมัติ": this is a way of reading a file, not a kind of
  // โจทย์, and a name that implies otherwise is what made it read like
  // โจทย์ผสม on the chooser.
  noun: 'โจทย์คละชนิด',
  blurb: 'ข้อสอบชุดเดียวที่มีหลายข้อคนละชนิดกัน เช่น ตอนที่ 1 ปรนัย ตอนที่ 2 ข้อเขียน ระบบแยกชนิดให้ทีละข้อ ครูแก้ได้ก่อนนำเข้า',
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

/**
 * The profiles the chooser offers, which is every type but the ones whose
 * answer to "does this import from Word?" is no.
 */
export const IMPORT_PROFILES: ImportProfile[] = [
  AUTO_PROFILE,
  ...PROFILE_ORDER.map(type => PROFILE_BY_TYPE[type]).filter(profile => profile.status !== 'not-applicable'),
]

/**
 * Only ever finds a profile the chooser offers.
 *
 * A type with no import has no page: the address exists in nobody's history,
 * so a 404 is a truer answer than a screen explaining a feature that was
 * decided against.
 */
export function findProfile(slug: string): ImportProfile | null {
  return IMPORT_PROFILES.find(profile => profile.slug === slug) ?? null
}

/** Plain text of one sample line — for titles, tests and the .docx generator.
 *  A จับคู่ row reads as both of its cells, which is how it reads on the page. */
export function sampleLineText(line: SampleLine): string {
  const left = line.spans.map(span => span.text).join('')
  const right = (line.right ?? []).map(span => span.text).join('')
  return right ? `${left} ${right}`.trim() : left
}

export interface NumberedSampleLine {
  line: SampleLine
  /** What is printed in front of this line: `2.`, `3)`, `ข)`, or nothing. For
   *  a `pair` this is the left-hand cell's number. */
  marker: string
  /** A `pair`'s right-hand label — `ก.` `ข.` `ค.` — which is what a จับคู่
   *  เฉลย points at, and therefore the one marker that carries meaning. */
  rightMarker?: string
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
  let item = 0
  let prompt = 0
  let option = 0

  return sample.map(line => {
    if (line.kind === 'question') {
      question += 1
      choice = 0
      part = 0
      item = 0
      prompt = 0
      option = 0
      return { line, marker: `${question}.` }
    }
    // The two columns of a จับคู่ are numbered apart: the ข้อ count down the
    // left, and the choices carry the ก. ข. ค. the เฉลย refers to. A row with
    // no ข้อ in it still consumes a letter, because that is the shape of a
    // ตัวเลือกลวง on the page.
    if (line.kind === 'pair') {
      const left = line.spans.length > 0 ? `${(prompt += 1)}.` : ''
      option += 1
      return { line, marker: left, rightMarker: `${PART_LABELS[option - 1] ?? option}.` }
    }
    if (line.kind === 'choice') {
      choice += 1
      return { line, marker: `${choice})` }
    }
    // The lines of a เรียงลำดับ list count on their own, because the orders
    // offered underneath them are numbered 1) 2) 3) 4) as well — which is
    // exactly the ambiguity a teacher's eye resolves and a parser must not
    // guess at.
    if (line.kind === 'item') {
      item += 1
      return { line, marker: `${item}.` }
    }
    if (line.kind === 'part') {
      part += 1
      return { line, marker: `${PART_LABELS[part - 1] ?? part})` }
    }
    return { line, marker: '' }
  })
}

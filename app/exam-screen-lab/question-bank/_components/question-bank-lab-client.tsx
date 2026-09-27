'use client'

import { Card } from '@/components/ui/card'
import { SolutionLoaderProvider, type SolutionLoader } from '@/components/questions/solution-loader'
import { QuestionBankClient } from '@/app/(app)/questions/_components/question-bank-client'
import type {
  QuestionFilters, QuestionWithCategory, QuestionWithCreator, TeamFilters,
} from '@/app/(app)/questions/page'
import { DEFAULT_QUESTION_SORT } from '@/lib/question-sort'
import type { QuestionSolutionPart } from '@/lib/question-solution'

const LAB_USER = '00000000-0000-4000-8000-000000000001'
const LAB_TEAM = '00000000-0000-4000-8000-000000000002'
const STAMP = '2026-09-26T05:00:00.000Z'

/** Ids nobody's database holds, so a stray click on the real actions finds nothing. */
const id = (n: number) => `00000000-0000-4000-8000-1000000000${String(n).padStart(2, '0')}`

function own(row: Pick<QuestionWithCategory, 'id' | 'title' | 'question_text' | 'question_type' | 'difficulty'>
  & Partial<QuestionWithCategory>): QuestionWithCategory {
  return {
    created_by: LAB_USER, org_id: null, tags: null, group_id: null, order_in_group: null,
    team_edit_allowed: true, content_fingerprint: null, created_at: STAMP, updated_at: STAMP,
    subject: 'วิทยาศาสตร์', question_categories: null, ...row,
  }
}

const OWN: QuestionWithCategory[] = [
  own({
    id: id(1), title: 'จำแนกประเภทพอลิเมอร์จากสิ่งของรอบตัว', question_type: 'classify', difficulty: 'medium',
    question_text: '<p>พิจารณาสิ่งของต่อไปนี้ แล้วจำแนกตามแหล่งกำเนิดของพอลิเมอร์</p>', tags: ['พอลิเมอร์'],
  }),
  own({
    id: id(2), title: 'ความเร็วของรถที่เร่งจากหยุดนิ่ง', question_type: 'written', difficulty: 'medium', subject: 'ฟิสิกส์',
    question_text: '<p>รถเริ่มเคลื่อนที่จากหยุดนิ่งด้วยความเร่ง 2 m/s² เป็นเวลา 5 วินาที จงหาความเร็วสุดท้าย</p>',
    tags: ['การเคลื่อนที่'],
  }),
  own({
    id: id(3), title: 'รถลากกล่องบนพื้นฝืด', question_type: 'written', difficulty: 'hard', subject: 'ฟิสิกส์',
    question_text: '<p>ออกแรง 50 N ลากกล่องมวล 10 kg บนพื้นที่มีสัมประสิทธิ์แรงเสียดทาน 0.2</p>',
    group_id: '00000000-0000-4000-8000-200000000003', order_in_group: 0,
  }),
  own({
    id: id(4), title: 'ธาตุใดเป็นโลหะแอลคาไล', question_type: 'mcq', difficulty: 'easy',
    question_text: '<p>ธาตุในข้อใดจัดเป็นโลหะแอลคาไลทั้งหมด</p>',
  }),
  own({
    id: id(5), title: 'อธิบายวัฏจักรของน้ำ', question_type: 'essay', difficulty: 'analytical',
    question_text: '<p>อธิบายการเปลี่ยนสถานะของน้ำในวัฏจักรของน้ำ พร้อมยกตัวอย่างในชีวิตประจำวัน</p>',
  }),
]

const TEAM: QuestionWithCreator[] = [
  {
    ...own({
      id: id(6), title: 'หาพื้นที่สามเหลี่ยมจากความยาวฐานและส่วนสูง', question_type: 'written', difficulty: 'easy',
      subject: 'คณิตศาสตร์', question_text: '<p>สามเหลี่ยมมีฐาน 8 ซม. สูง 5 ซม. จงหาพื้นที่</p>',
    }),
    created_by: '00000000-0000-4000-8000-000000000003', org_id: LAB_TEAM,
    users: { full_name: 'ครูสมศรี ใจดี' }, organizations: { name: 'ทีมวิทย์-คณิต ม.ต้น' },
    shared_org_names: [], shared_org_ids: [],
  },
  {
    ...own({
      id: id(7), title: 'เรียงลำดับขั้นตอนการทดลองแยกสาร', question_type: 'ordering', difficulty: 'medium',
      question_text: '<p>เรียงลำดับขั้นตอนการกรองแยกทรายออกจากน้ำ</p>',
    }),
    created_by: '00000000-0000-4000-8000-000000000003', org_id: LAB_TEAM, team_edit_allowed: false,
    users: { full_name: 'ครูสมศรี ใจดี' }, organizations: { name: 'ทีมวิทย์-คณิต ม.ต้น' },
    shared_org_names: [], shared_org_ids: [],
  },
]

// ── Synthetic เฉลย ────────────────────────────────────────────────────────────

interface LabFile { name: string; type: string; body: string }

const svg = (width: number, height: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  + `<rect width="${width}" height="${height}" fill="#ffffff"/>${inner}</svg>`

const BOARD: LabFile = {
  name: 'solution-board_1_lab.png',
  type: 'image/svg+xml',
  body: svg(720, 320, [
    '<g fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round">',
    '<path d="M70 270 H650"/><path d="M70 270 V50"/></g>',
    '<path d="M70 270 L560 80" fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round"/>',
    '<text x="600" y="300" font-family="sans-serif" font-size="26" fill="#1f2937">t (s)</text>',
    '<text x="20" y="45" font-family="sans-serif" font-size="26" fill="#1f2937">v (m/s)</text>',
    '<text x="300" y="120" font-family="sans-serif" font-size="34" fill="#dc2626">v = u + at</text>',
    '<text x="300" y="170" font-family="sans-serif" font-size="30" fill="#1f2937">= 0 + 2(5) = 10 m/s</text>',
  ].join('')),
}

const FORCES: LabFile = {
  name: 'solution_2_lab.webp',
  type: 'image/svg+xml',
  body: svg(640, 300, [
    '<path d="M40 230 H600" stroke="#6b7280" stroke-width="4"/>',
    '<rect x="250" y="130" width="140" height="100" fill="#fde68a" stroke="#92400e" stroke-width="4"/>',
    '<path d="M390 180 H540 M520 165 L540 180 L520 195" fill="none" stroke="#2563eb" stroke-width="5"/>',
    '<path d="M250 215 H120 M140 200 L120 215 L140 230" fill="none" stroke="#dc2626" stroke-width="5"/>',
    '<text x="470" y="160" font-family="sans-serif" font-size="28" fill="#2563eb">F = 50 N</text>',
    '<text x="100" y="190" font-family="sans-serif" font-size="28" fill="#dc2626">f = 20 N</text>',
  ].join('')),
}

const ALKALI: LabFile = {
  name: 'solution_3_lab.webp',
  type: 'image/svg+xml',
  body: svg(520, 240, ['Li', 'Na', 'K', 'Rb'].map((symbol, index) => (
    `<rect x="${30 + index * 120}" y="70" width="100" height="100" rx="12" fill="#dcfce7" stroke="#15803d" stroke-width="4"/>`
    + `<text x="${80 + index * 120}" y="135" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#14532d">${symbol}</text>`
  )).join('') + '<text x="30" y="215" font-family="sans-serif" font-size="24" fill="#1f2937">หมู่ 1A — โลหะแอลคาไล</text>'),
}

const GRAPH: LabFile = {
  name: 'solution-inline_1_lab.webp',
  type: 'image/svg+xml',
  body: svg(360, 160, [
    '<path d="M30 130 H330 M30 130 V20" fill="none" stroke="#1f2937" stroke-width="3"/>',
    '<path d="M30 130 L300 40" fill="none" stroke="#16a34a" stroke-width="4"/>',
    '<text x="200" y="120" font-family="sans-serif" font-size="18" fill="#1f2937">ความชัน = a</text>',
  ].join('')),
}

// Enough of a PDF for the browser's own viewer to open.
const PDF_PAGE = 'BT /F1 20 Tf 30 80 Td (KorKru lab solution PDF) Tj ET'
const WORKED_PDF: LabFile = {
  name: 'solution_4_lab.pdf',
  type: 'application/pdf',
  body: [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 360 160]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${PDF_PAGE.length}>>stream`,
    PDF_PAGE,
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n'),
}

/** Each เฉลย as parts: text may place a picture with `src="lab:<name>"`. */
type LabPart = Pick<Partial<QuestionSolutionPart>, 'label' | 'excerpt' | 'text'> & { files?: LabFile[] }

const SOLUTIONS: Record<string, LabPart[]> = {
  [id(2)]: [{
    text: [
      '<p>ใช้สมการ \\(v = u + at\\) เมื่อรถเริ่มจากหยุดนิ่ง \\(u = 0\\)</p>',
      '<p>\\(v = 0 + (2)(5) = 10\\ \\text{m/s}\\)</p>',
      `<p><img src="lab:${GRAPH.name}" alt=""></p>`,
      '<p>ดังนั้นความเร็วสุดท้ายคือ <strong>10 m/s</strong></p>',
    ].join(''),
    files: [BOARD, WORKED_PDF],
  }],
  [id(3)]: [
    {
      label: 'ข้อย่อยที่ 1', excerpt: 'หาแรงเสียดทานที่กระทำต่อกล่อง',
      text: '<p>\\(f = \\mu N = (0.2)(10)(10) = 20\\ \\text{N}\\)</p>',
    },
    { label: 'ข้อย่อยที่ 2', excerpt: 'หาแรงลัพธ์ที่กระทำต่อกล่อง' },
    { label: 'ข้อย่อยที่ 3', excerpt: 'หาความเร่งของกล่อง', files: [FORCES] },
  ],
  [id(4)]: [{ files: [ALKALI] }],
  [id(5)]: [{
    text: [
      '<p><strong>การระเหย</strong> — น้ำในแหล่งน้ำได้รับความร้อนจากดวงอาทิตย์ กลายเป็นไอน้ำ</p>',
      '<p><strong>การควบแน่น</strong> — ไอน้ำลอยขึ้นสู่ที่สูงซึ่งอากาศเย็นกว่า ควบแน่นเป็นละอองน้ำเกิดเป็นเมฆ</p>',
      '<p><strong>หยาดน้ำฟ้า</strong> — ละอองน้ำรวมตัวจนหนักพอจะตกลงมาเป็นฝน</p>',
      '<p>ตัวอย่าง: หยดน้ำที่เกาะข้างแก้วน้ำเย็นเกิดจากการควบแน่นของไอน้ำในอากาศ</p>',
    ].join(''),
  }],
  [id(6)]: [{ text: '<p>พื้นที่ \\(= \\tfrac{1}{2} \\times 8 \\times 5 = 20\\) ตารางเซนติเมตร</p>' }],
}

const hasContent = (part: LabPart) => !!part.text || (part.files ?? []).length > 0

/** Every card's answer, from the same spec the dialog reads. */
const PRESENCE: Record<string, boolean> = Object.fromEntries(
  [...OWN, ...TEAM].map(question => [question.id, (SOLUTIONS[question.id] ?? []).some(hasContent)]),
)

const fileUrls = new Map<string, string>()

/** One object URL per file for the life of the tab, named after the `#` the way the solution-board lab does. */
function fileUrl(file: LabFile): string {
  let url = fileUrls.get(file.name)
  if (!url) {
    url = `${URL.createObjectURL(new Blob([file.body], { type: file.type }))}#lab/${file.name}`
    fileUrls.set(file.name, url)
  }
  return url
}

const INLINE_FILES = new Map([GRAPH].map(file => [file.name, file]))

function makeLoader(fail: boolean): SolutionLoader {
  return async (questionId: string) => {
    // Long enough to see the loading state, short enough not to wait on it.
    await new Promise(resolve => setTimeout(resolve, 600))
    if (fail) return { error: 'โหลดเฉลยไม่สำเร็จ — ปิดหน้าต่างนี้แล้วกด “ดูเฉลย” อีกครั้ง' }
    const question = [...OWN, ...TEAM].find(candidate => candidate.id === questionId)
    if (!question) return { error: 'ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์เข้าถึง' }
    const parts = SOLUTIONS[questionId] ?? [{}]
    return {
      data: {
        title: question.title,
        parts: parts.map((part, index) => ({
          id: `${questionId}-${index}`,
          label: part.label ?? null,
          excerpt: part.excerpt ?? null,
          text: part.text?.replace(/lab:([\w.-]+)/g, (_, name: string) => {
            const file = INLINE_FILES.get(name)
            return file ? fileUrl(file) : ''
          }) ?? null,
          files: (part.files ?? []).map(fileUrl),
        })),
      },
    }
  }
}

const LOADERS = { ok: makeLoader(false), fail: makeLoader(true) }

const FILTERS: QuestionFilters = {
  q: '', match: 'all', type: 'all', difficulty: 'all', tag: '', page: 1, sort: DEFAULT_QUESTION_SORT,
}
const TEAM_FILTERS: TeamFilters = { q: '', match: 'all', team: '', page: 1, sort: DEFAULT_QUESTION_SORT }
const NO_GROUPS = { tag: 0, title: 0, content: 0 }

export function QuestionBankLabClient({ failLoads }: { failLoads: boolean }) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <Card padding="md" className="space-y-1">
        <h1 className="text-lg font-semibold">ห้องทดลองคลังโจทย์</h1>
        <p className="text-sm text-muted-foreground">
          โจทย์และเฉลยในหน้านี้เป็นข้อมูลจำลอง ปุ่ม “ดูเฉลย” อ่านเฉลยจากหน่วยความจำของแท็บนี้ ไม่ต่อฐานข้อมูล
          {failLoads ? ' · โหมดนี้จำลองให้โหลดเฉลยไม่สำเร็จทุกข้อ' : ' · เปิด ?fail=1 เพื่อดูตอนโหลดเฉลยไม่สำเร็จ'}
        </p>
        <p className="text-sm text-muted-foreground">
          ปุ่มอื่นบนหน้านี้ (นำเข้า แท็ก แชร์ ลบ ดูตัวอย่าง) ยังเรียกเซิร์ฟเวอร์จริง — ทดสอบเฉพาะปุ่มดูเฉลย
        </p>
      </Card>
      <SolutionLoaderProvider loader={failLoads ? LOADERS.fail : LOADERS.ok}>
        <QuestionBankClient
          questions={OWN}
          stats={{}}
          teamQuestions={TEAM}
          hasTeamOrg
          hasMultipleTeams={false}
          myTeams={[{ id: LAB_TEAM, name: 'ทีมวิทย์-คณิต ม.ต้น' }]}
          currentUserId={LAB_USER}
          filters={FILTERS}
          allTags={['พอลิเมอร์', 'การเคลื่อนที่']}
          matchCount={OWN.length}
          searchGroups={[]}
          searchGroupCounts={NO_GROUPS}
          totalCount={OWN.length}
          duplicateCounts={{}}
          subQuestionCounts={{ [id(1)]: 2, [id(3)]: 3 }}
          setMemberships={{}}
          solutionPresence={PRESENCE}
          perPage={24}
          teamFilters={TEAM_FILTERS}
          teamMatchCount={TEAM.length}
          teamSearchGroups={[]}
          teamSearchGroupCounts={NO_GROUPS}
          teamPaged
        />
      </SolutionLoaderProvider>
    </main>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AttemptSolutionShortcut, AttemptSolutionsButton, AttemptSolutionsProvider,
  type AttemptSolutionsLoader,
} from '@/components/student/attempt-solutions'
import { SolutionLockNotice } from '@/components/student/solution-lock-notice'
import { SolutionReleaseSetting } from '@/components/assignments/solution-release-setting'
import { attemptItemHasSolution, type AttemptSolutionItem } from '@/lib/attempt-solutions'
import type { SolutionLock } from '@/lib/solution-release'
import type { AssignmentType } from '@/lib/types'

export type LabReleaseState = 'open' | 'locked' | 'unfinished' | 'unfinished-closed'

/** Ids nobody's database holds, so a stray press on a real action finds nothing. */
const id = (n: number) => `00000000-0000-4000-8000-3000000000${String(n).padStart(2, '0')}`
const SUBMISSION_ID = '00000000-0000-4000-8000-400000000001'
const ASSIGNMENT_ID = '00000000-0000-4000-8000-400000000002'

// ── Synthetic files ──────────────────────────────────────────────────────────

interface LabFile { name: string; type: string; body: string }

const svg = (width: number, height: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  + `<rect width="${width}" height="${height}" fill="#ffffff"/>${inner}</svg>`

const CLIFF: LabFile = {
  name: 'question_1_lab.webp',
  type: 'image/svg+xml',
  body: svg(560, 260, [
    '<path d="M40 60 H200 V230 H520" fill="none" stroke="#1f2937" stroke-width="4"/>',
    '<circle cx="200" cy="60" r="10" fill="#dc2626"/>',
    '<path d="M200 60 Q360 60 470 230" fill="none" stroke="#2563eb" stroke-width="4" stroke-dasharray="10 8"/>',
    '<text x="60" y="150" font-family="sans-serif" font-size="24" fill="#1f2937">h = 45 m</text>',
  ].join('')),
}

const BOARD: LabFile = {
  name: 'solution-board_1_lab.png',
  type: 'image/svg+xml',
  body: svg(720, 300, [
    '<text x="40" y="80" font-family="sans-serif" font-size="34" fill="#1f2937">y = ½gt²  →  45 = 5t²</text>',
    '<text x="40" y="150" font-family="sans-serif" font-size="34" fill="#dc2626">t = 3 s</text>',
    '<text x="40" y="220" font-family="sans-serif" font-size="34" fill="#1f2937">x = ut = 12 × 3 = 36 m</text>',
  ].join('')),
}

const ALKALI: LabFile = {
  name: 'solution_3_lab.webp',
  type: 'image/svg+xml',
  body: svg(520, 200, ['Li', 'Na', 'K', 'Rb'].map((symbol, index) => (
    `<rect x="${30 + index * 120}" y="50" width="100" height="100" rx="12" fill="#dcfce7" stroke="#15803d" stroke-width="4"/>`
    + `<text x="${80 + index * 120}" y="115" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#14532d">${symbol}</text>`
  )).join('')),
}

// Enough of a PDF for the browser's own viewer to open.
const PDF_PAGE = 'BT /F1 20 Tf 30 80 Td (KorKru lab worked solution) Tj ET'
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

const fileUrls = new Map<string, string>()

/** One object URL per file for the life of the tab; the name after `#` is what
 *  the เฉลย viewer reads a file's kind from, as with a real Storage path. */
function fileUrl(file: LabFile): string {
  let url = fileUrls.get(file.name)
  if (!url) {
    url = `${URL.createObjectURL(new Blob([file.body], { type: file.type }))}#lab/${file.name}`
    fileUrls.set(file.name, url)
  }
  return url
}

// ── The synthetic attempt ────────────────────────────────────────────────────

interface LabQuestion {
  title: string | null
  question: string | null
  images?: LabFile[]
  solution?: string
  files?: LabFile[]
  correct: boolean | null
}

const ATTEMPT: LabQuestion[] = [
  {
    title: 'โปรเจกไทล์ ไกลจากที่สูง',
    question: '<p>ขว้างลูกบอลในแนวระดับด้วยความเร็ว 12 m/s จากหน้าผาสูง 45 m ลูกบอลตกห่างจากฐานหน้าผากี่เมตร (ให้ \\(g = 10\\ \\text{m/s}^2\\))</p>',
    images: [CLIFF],
    solution: [
      '<p>แนวดิ่ง: \\(y = \\tfrac{1}{2}gt^2\\) ได้ \\(45 = 5t^2\\) ดังนั้น \\(t = 3\\ \\text{s}\\)</p>',
      '<p>แนวระดับ: \\(x = ut = (12)(3) = 36\\ \\text{m}\\)</p>',
    ].join(''),
    files: [BOARD, WORKED_PDF],
    correct: true,
  },
  {
    title: 'โปรเจกไทล์ ปล่อยของบนเครื่องบิน',
    question: '<p>เครื่องบินบินในแนวระดับด้วยความเร็ว 80 m/s ที่ความสูง 500 m ปล่อยกล่องลงมา กล่องตกถึงพื้นในเวลากี่วินาที</p>',
    solution: '<p>\\(500 = \\tfrac{1}{2}(10)t^2\\) ได้ \\(t = 10\\ \\text{s}\\) — ความเร็วแนวระดับไม่มีผลต่อเวลาตก</p>',
    correct: false,
  },
  {
    title: 'โปรเจกไทล์ ระยะห่างจากจุดยิง',
    question: '<p>ปืนใหญ่ยิงกระสุนออกไปด้วยความเร็ว 50 m/s ทำมุม 37° กับแนวระดับ กระสุนตกห่างจากจุดยิงเท่าใด</p>',
    correct: false,
  },
  {
    title: 'ธาตุใดเป็นโลหะแอลคาไล',
    question: '<p>ธาตุในข้อใดจัดเป็นโลหะแอลคาไลทั้งหมด</p>',
    files: [ALKALI],
    correct: true,
  },
  {
    title: 'อธิบายวัฏจักรของน้ำ',
    question: '<p>อธิบายการเปลี่ยนสถานะของน้ำในวัฏจักรของน้ำ พร้อมยกตัวอย่างในชีวิตประจำวัน</p>',
    solution: Array.from({ length: 6 }, (_, round) => [
      `<p><strong>รอบที่ ${round + 1} · การระเหย</strong> — น้ำในแหล่งน้ำได้รับความร้อนจากดวงอาทิตย์ กลายเป็นไอน้ำลอยขึ้นสู่ที่สูง</p>`,
      '<p><strong>การควบแน่น</strong> — ไอน้ำเจออากาศเย็นกว่า ควบแน่นเป็นละอองน้ำรวมกันเป็นเมฆ</p>',
      '<p><strong>หยาดน้ำฟ้า</strong> — ละอองน้ำรวมตัวจนหนักพอ ตกลงมาเป็นฝน หิมะ หรือลูกเห็บ</p>',
    ].join('')).join(''),
    correct: null,
  },
  {
    title: null,
    question: '<p>รถเริ่มเคลื่อนที่จากหยุดนิ่งด้วยความเร่ง 2 m/s² เป็นเวลา 5 วินาที จงหาความเร็วสุดท้าย</p>',
    solution: '<p>\\(v = u + at = 0 + (2)(5) = 10\\ \\text{m/s}\\)</p>',
    correct: true,
  },
  {
    title: 'ข้อที่ครูลบออกจากคลังไปแล้ว',
    question: null,
    correct: false,
  },
]

function buildItems(): AttemptSolutionItem[] {
  return ATTEMPT.map((question, index) => ({
    answerId: id(index + 1),
    number: index + 1,
    title: question.title,
    questionText: question.question,
    imageUrls: (question.images ?? []).map(fileUrl),
    solutionText: question.solution ?? null,
    solutionFiles: (question.files ?? []).map(fileUrl),
  }))
}

function makeLoader(fail: boolean): AttemptSolutionsLoader {
  return async () => {
    // Long enough to see the loading state, short enough not to wait on it.
    await new Promise(resolve => setTimeout(resolve, 600))
    if (fail) return { error: 'โหลดเฉลยไม่สำเร็จ — กดลองอีกครั้ง หรือกลับมาเปิดใหม่ภายหลัง' }
    return { data: { items: buildItems() } }
  }
}

const LOADERS = { ok: makeLoader(false), fail: makeLoader(true) }

const IN_A_WEEK = new Date(Date.UTC(2026, 9, 3, 9, 0)).toISOString()

const LOCKS: Record<Exclude<LabReleaseState, 'open'>, SolutionLock> = {
  locked: { state: 'locked', unfinished: null, deadline: IN_A_WEEK, attemptLimit: 3, attemptsUsed: 1 },
  unfinished: {
    state: 'locked', unfinished: { id: id(90), attemptNumber: 2 }, deadline: IN_A_WEEK, attemptLimit: 3, attemptsUsed: 1,
  },
  'unfinished-closed': {
    state: 'locked', unfinished: { id: id(90), attemptNumber: 2 }, deadline: null, attemptLimit: null, attemptsUsed: 1,
  },
}

const STATE_LABELS: Record<LabReleaseState, string> = {
  open: 'เปิดแล้ว',
  locked: 'ยังไม่ถึงเวลา',
  unfinished: 'มีรอบค้าง (งานยังเปิด)',
  'unfinished-closed': 'มีรอบค้าง (ครูปิดงานแล้ว)',
}

export function SolutionReleaseLabClient({ state, failLoads }: { state: LabReleaseState; failLoads: boolean }) {
  const open = state === 'open'
  const items = buildItemsForList()

  const summary = (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <Card padding="md" className="space-y-2">
        <h1 className="text-lg font-semibold">ห้องทดลองเฉลยวิธีทำ</h1>
        <p className="text-sm text-muted-foreground">
          ผลงานและเฉลยในหน้านี้เป็นข้อมูลจำลอง ปุ่มเฉลยอ่านจากหน่วยความจำของแท็บนี้ ไม่ต่อฐานข้อมูล
          {failLoads ? ' · โหมดนี้จำลองให้โหลดเฉลยไม่สำเร็จ' : ' · เปิด ?fail=1 เพื่อดูตอนโหลดไม่สำเร็จ'}
        </p>
        <nav aria-label="สถานะที่จำลอง" className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(STATE_LABELS) as LabReleaseState[]).map(candidate => (
            <Link
              key={candidate}
              href={`?state=${candidate}${failLoads ? '&fail=1' : ''}`}
              aria-current={candidate === state ? 'page' : undefined}
              className={candidate === state ? 'font-semibold text-primary underline' : 'text-muted-foreground hover:text-primary'}
            >
              {STATE_LABELS[candidate]}
            </Link>
          ))}
        </nav>
      </Card>

      {/* The summary card, as the student's page lays it out. */}
      <Card padding="2xl" className="text-center">
        <p className="text-4xl font-black">18/30</p>
        <p className="mt-1 text-sm text-muted-foreground">คะแนนที่ได้</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {open && <AttemptSolutionsButton />}
        </div>
        {state !== 'open' && (
          <SolutionLockNotice
            lock={LOCKS[state]}
            assignmentId={ASSIGNMENT_ID}
            canResume={state !== 'unfinished-closed'}
          />
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><span>📋</span> ตรวจเฉลยทีละข้อ</h2>
        {items.map(item => (
          <Card key={item.answerId} padding="lg" className="space-y-2">
            <div className="flex items-center gap-2">
              {item.correct === true
                ? <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
                : item.correct === false
                  ? <XCircle size={16} className="text-destructive" aria-hidden="true" />
                  : <span aria-hidden="true">⏳</span>}
              <p className="text-sm font-semibold">ข้อ {item.number}</p>
              {item.title && <p className="truncate text-xs text-muted-foreground">{item.title}</p>}
              {item.correct === null && <Badge variant="outline" className="ml-auto text-xs">รอครูตรวจ</Badge>}
            </div>
            {open && item.hasSolution && (
              <AttemptSolutionShortcut answerId={item.answerId} number={item.number} />
            )}
          </Card>
        ))}
      </div>

      <SettingPreview />
    </main>
  )

  return open
    ? (
        <AttemptSolutionsProvider submissionId={SUBMISSION_ID} loader={failLoads ? LOADERS.fail : LOADERS.ok}>
          {summary}
        </AttemptSolutionsProvider>
      )
    : summary
}

/** What the review list needs of each ข้อ — computed from the same spec the
 *  viewer loads, so the shortcuts and the viewer never disagree. */
function buildItemsForList() {
  return ATTEMPT.map((question, index) => {
    const item: AttemptSolutionItem = {
      answerId: id(index + 1),
      number: index + 1,
      title: question.title,
      questionText: question.question,
      imageUrls: [],
      solutionText: question.solution ?? null,
      solutionFiles: (question.files ?? []).map(file => `#lab/${file.name}`),
    }
    return { ...item, correct: question.correct, hasSolution: attemptItemHasSolution(item) }
  })
}

/** The teacher's side: ให้นักเรียนดูเฉลยวิธีทำ under the settings the forms pass it. */
function SettingPreview() {
  const cases: Array<{ label: string; type: AssignmentType; maxAttempts: string }> = [
    { label: 'แบบฝึกหัด ไม่จำกัดครั้ง', type: 'exercise', maxAttempts: '' },
    { label: 'แบบฝึกหัด ทำได้ 3 ครั้ง', type: 'exercise', maxAttempts: '3' },
    { label: 'ข้อสอบ ทำได้ 1 ครั้ง', type: 'exam', maxAttempts: '1' },
  ]
  return (
    <Card padding="xl" className="space-y-5">
      <h2 className="font-semibold text-foreground">ตั้งค่าในหน้าสร้าง/แก้ไขงาน</h2>
      {cases.map(entry => <SettingCase key={entry.label} {...entry} />)}
    </Card>
  )
}

function SettingCase({ label, type, maxAttempts }: { label: string; type: AssignmentType; maxAttempts: string }) {
  const [checked, setChecked] = useState(type === 'exam')
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <SolutionReleaseSetting checked={checked} onChange={setChecked} assignmentType={type} maxAttempts={maxAttempts} />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { QuestionSetsClient } from '@/app/(app)/questions/sets/_components/question-sets-client'
import type {
  QuestionSetSummary,
  QuestionSetSummaryWithCreator,
} from '@/app/(app)/questions/sets/page'
import { Card } from '@/components/ui/card'
import { SetStructurePanel, type PanelQuestion } from '@/components/questions/set-structure-panel'
import type { QuestionSetSection } from '@/lib/question-set-sections'
import type { QuestionCardData } from '@/lib/question-card-data'

const LAB_USER = '00000000-0000-4000-8000-000000000001'

function questionIds(count: number, seed: number) {
  return Array.from({ length: count }, (_, index) => (
    `00000000-0000-4000-8000-${String(seed * 100 + index).padStart(12, '0')}`
  ))
}

function own(
  id: string,
  title: string,
  count: number,
  extras: Partial<QuestionSetSummary> = {},
): QuestionSetSummary {
  return {
    id,
    created_by: LAB_USER,
    title,
    description: null,
    question_ids: questionIds(count, Number(id.at(-1)) || 1),
    valid_question_count: count,
    sections: [],
    tags: [],
    ...extras,
  }
}

const MY_SETS: QuestionSetSummary[] = [
  own('00000000-0000-4000-8000-000000000011', 'การเคลื่อนที่แบบโปรเจกไทล์', 22),
  own('00000000-0000-4000-8000-000000000012', 'ทดสอบ', 5),
  own('00000000-0000-4000-8000-000000000013', 'พลังงาน', 5, {
    description: 'รวบรวมโจทย์เรื่องงาน พลังงาน และกฎการอนุรักษ์พลังงาน',
    sections: [
      { id: 'energy-work', title: 'งานและกำลัง', question_ids: questionIds(2, 31) },
      { id: 'energy-law', title: 'กฎอนุรักษ์', question_ids: questionIds(3, 32) },
    ],
  }),
  own('00000000-0000-4000-8000-000000000014', 'การเคลื่อนที่แบบหมุน', 0),
  own('00000000-0000-4000-8000-000000000015', 'การเคลื่อนที่ 2 มิติ', 1, {
    description: 'วงกลม โปรเจกไทล์ ฮาร์มอนิกอย่างง่าย',
  }),
  own('00000000-0000-4000-8000-000000000016', 'โลก ดาราศาสตร์ และอวกาศ', 0),
  own('00000000-0000-4000-8000-000000000017', 'การเคลื่อนที่ 1 มิติ', 0),
  own('00000000-0000-4000-8000-000000000018', 'กฎการเคลื่อนที่ของนิวตัน', 0),
]

const TEAM_SETS: QuestionSetSummaryWithCreator[] = [
  {
    ...own('00000000-0000-4000-8000-000000000019', 'แบบฝึกฟิสิกส์ร่วมกันของทีม', 12, {
      description: 'แฟ้มตัวอย่างที่แชร์โดยครูในทีมวิทยาศาสตร์',
    }),
    created_by: '00000000-0000-4000-8000-000000000002',
    users: { full_name: 'ครูสมศรี ใจดี' },
    organizations: { name: 'ทีมวิทยาศาสตร์' },
    shared_org_names: ['ทีม ม.4'],
  },
]

const STRUCTURE_QUESTIONS: PanelQuestion[] = [
  {
    id: '00000000-0000-4000-8000-000000000091',
    title: 'งาน ง่าย งานติดลบ',
    question_text: '<p>โจทย์จำลองเรื่องงานและพลังงาน</p>',
    question_type: 'written',
    difficulty: 'medium',
    tags: ['อัตนัย'],
  },
  {
    id: '00000000-0000-4000-8000-000000000092',
    title: 'พลังงาน อนุรักษ์ โยนวัตถุ หาความสูง',
    question_text: '<p>โจทย์จำลองเรื่องกฎอนุรักษ์พลังงาน</p>',
    question_type: 'written',
    difficulty: 'medium',
    tags: ['อัตนัย'],
  },
  {
    id: '00000000-0000-4000-8000-000000000093',
    title: 'พลังงาน อนุรักษ์ ปล่อยวัตถุ หาอัตราเร็ว',
    question_text: '<p>โจทย์จำลองเรื่องพลังงานจลน์</p>',
    question_type: 'mcq',
    difficulty: 'easy',
    tags: [],
  },
]

const STRUCTURE_CARD_DATA: QuestionCardData = {
  details: Object.fromEntries(STRUCTURE_QUESTIONS.map(question => [question.id, {
    subject: 'ฟิสิกส์', category: 'งานและพลังงาน', group_id: null, order_in_group: null,
  }])),
  stats: {}, duplicateCounts: {}, subQuestionCounts: {}, setMemberships: {}, solutionPresence: {},
}
const STRUCTURE_QUESTION_IDS = STRUCTURE_QUESTIONS.map(question => question.id)
const STRUCTURE_SECTIONS: QuestionSetSection[] = [
  {
    id: 'lab-section-work',
    title: 'งาน',
    question_ids: [STRUCTURE_QUESTION_IDS[0], STRUCTURE_QUESTION_IDS[1]],
  },
  {
    id: 'lab-section-energy',
    title: 'กฎอนุรักษ์พลังงาน',
    question_ids: [STRUCTURE_QUESTION_IDS[1], STRUCTURE_QUESTION_IDS[2]],
  },
]

export function QuestionSetsLabClient() {
  const [structureSections, setStructureSections] = useState<QuestionSetSection[]>(STRUCTURE_SECTIONS)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <Card padding="md" radius="md" className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">ห้องทดลองการ์ดแฟ้มโจทย์</h1>
        <p className="text-sm text-muted-foreground">
          ข้อมูลในการ์ดเป็นข้อมูลจำลองและหน้าเริ่มต้นไม่อ่าน Supabase · ใช้ตรวจหน้าตาและเมนูแฟ้มย่อยเท่านั้น
        </p>
        <p className="text-sm text-muted-foreground">
          ปุ่มนำเข้า ดาวน์โหลด ลบ และลิงก์สร้าง/มอบหมายยังเป็น action จริง จึงไม่ใช้ปุ่มเหล่านี้ในห้องทดลอง
        </p>
      </Card>
      <QuestionSetsClient
        mySets={MY_SETS}
        teamSets={TEAM_SETS}
        currentUserId={LAB_USER}
        libraryPanel={(
          <Card edge="dashed" padding="md" radius="md" className="text-sm text-muted-foreground">
            พื้นที่คลังโจทย์จำลอง — การตรวจรอบนี้เน้นเฉพาะการ์ดแฟ้มโจทย์
          </Card>
        )}
      />

      <Card padding="md" radius="md" className="space-y-1">
        <h2 className="font-semibold">ห้องทดลองร่างแฟ้มย่อย</h2>
        <p className="text-sm text-muted-foreground">
          ใช้ตรวจการเตือนเมื่อปิดหน้าต่างที่กรอกชื่อหรือติ๊กโจทย์ไว้ โดยข้อมูลอยู่ในหน่วยความจำของแท็บเท่านั้น
        </p>
      </Card>
      <SetStructurePanel
        questions={STRUCTURE_QUESTIONS}
        questionIds={STRUCTURE_QUESTION_IDS}
        sections={structureSections}
        onChange={next => setStructureSections(next.sections)}
        onAddQuestions={() => {}}
        allTags={['อัตนัย']}
        myTeams={[]}
        initialCardData={STRUCTURE_CARD_DATA}
      />
    </main>
  )
}

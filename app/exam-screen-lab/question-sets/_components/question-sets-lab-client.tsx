'use client'

import { QuestionSetsClient } from '@/app/(app)/questions/sets/_components/question-sets-client'
import type {
  QuestionSetSummary,
  QuestionSetSummaryWithCreator,
} from '@/app/(app)/questions/sets/page'
import { Card } from '@/components/ui/card'

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

export function QuestionSetsLabClient() {
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
    </main>
  )
}

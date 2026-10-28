'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { QuestionPicker } from '@/components/assignments/question-picker'
import type { BankQuestion } from '@/lib/question-bank'
import type { QuestionCardData } from '@/lib/question-card-data'
import type { QuestionType } from '@/lib/types'

/** The size of the คลัง the slowness was measured on (28 ตุลาคม 2026). */
const BANK_SIZE = 912
/** How many the งาน already holds when the picker opens. */
const SELECTED_SIZE = 20
/** The median server wait one getQuestionCardData call took on Production. */
const CARD_DATA_LATENCY_MS = 400

// Sixteen topics, so each holds 57 of the 912 — the same count a search for
// "ไฟฟ้า" found in the real คลัง. Only the first one says ไฟฟ้า.
const TOPICS = [
  'สนามไฟฟ้า', 'การเคลื่อนที่แนวตรง', 'แรงและกฎของนิวตัน', 'งานและพลังงาน',
  'โมเมนตัมและการชน', 'การเคลื่อนที่แบบวงกลม', 'คลื่นกล', 'เสียง',
  'แสงและการมองเห็น', 'ความร้อนและแก๊ส', 'ของไหล', 'แม่เหล็ก',
  'ฟิสิกส์อะตอม', 'ฟิสิกส์นิวเคลียร์', 'สภาพยืดหยุ่น', 'การหมุน',
]
const DIFFICULTIES = ['easy', 'medium', 'hard', 'analytical']
const TYPES: QuestionType[] = ['mcq', 'written', 'true_false', 'fill_blank']

function labId(index: number) {
  return `00000000-0000-4000-8000-${String(700000 + index).padStart(12, '0')}`
}

const BANK: BankQuestion[] = Array.from({ length: BANK_SIZE }, (_, index) => {
  const topic = TOPICS[index % TOPICS.length]
  return {
    id: labId(index),
    title: `${topic} โจทย์จำลอง ${index + 1}`,
    // About the 400 bytes an average real question_text carries.
    question_text: `<p>${topic}: วัตถุสองชิ้นวางห่างกันตามระยะที่กำหนดในรูป เมื่อปล่อยให้ระบบเปลี่ยนแปลงตามเงื่อนไขของโจทย์ ปริมาณใดต่อไปนี้มีค่ามากที่สุด</p>`,
    difficulty: DIFFICULTIES[index % DIFFICULTIES.length] as BankQuestion['difficulty'],
    question_type: TYPES[index % TYPES.length],
    subject: 'ฟิสิกส์',
    tags: [topic],
    sub_question_count: 1,
    default_points: 1,
    has_random_values: false,
  }
})
const BASELINE_IDS = BANK.slice(0, SELECTED_SIZE).map(question => question.id)

const LAB_SET = { id: '00000000-0000-4000-8000-000000700999', title: 'แฟ้มจำลอง', isOwner: true }

function cardDataFor(ids: string[]): QuestionCardData {
  const data: QuestionCardData = {
    details: {}, duplicateCounts: {}, subQuestionCounts: {}, setMemberships: {}, solutionPresence: {},
  }
  for (const id of ids) {
    const index = Number(id.slice(-6)) - 700000
    data.details[id] = { subject: 'ฟิสิกส์', category: null, group_id: null, order_in_group: null }
    data.subQuestionCounts[id] = 1
    if (index % 7 === 0) data.setMemberships[id] = [LAB_SET]
    data.solutionPresence[id] = index % 3 === 0
  }
  return data
}

let cardDataQueue: Promise<unknown> = Promise.resolve()
let cardDataRequests = 0
let cardDataIds = 0

/**
 * Stands in for getQuestionCardData. One call at a time, like the Server
 * Action it replaces — Next.js dispatches those one after another per client
 * — so a burst of calls queues exactly as it does on the real page.
 */
function loadLabCardData(ids: string[]): Promise<QuestionCardData> {
  cardDataRequests += 1
  cardDataIds += ids.length
  const status = document.querySelector<HTMLElement>('[data-lab-card-requests]')
  if (status) {
    status.dataset.labCardRequests = String(cardDataRequests)
    status.dataset.labCardIds = String(cardDataIds)
    status.textContent = `คำขอป้าย ${cardDataRequests} ครั้ง · รวม ${cardDataIds} ข้อ`
  }
  const run = cardDataQueue.then(async () => {
    performance.mark('lab-card-data-start')
    await new Promise(resolve => setTimeout(resolve, CARD_DATA_LATENCY_MS))
    performance.mark('lab-card-data-end')
    return cardDataFor(ids)
  })
  cardDataQueue = run.catch(() => {})
  return run
}

export function QuestionPickerLoadLabClient() {
  const [open, setOpen] = useState(false)
  const [draftIds, setDraftIds] = useState(BASELINE_IDS)
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:p-6">
      <Card padding="md" radius="md" className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">ห้องทดลองความเร็วหน้าต่างเลือกโจทย์</h1>
        <p className="text-sm text-muted-foreground">
          โจทย์จำลอง {BANK_SIZE} ข้อ เลือกไว้แล้ว {SELECTED_SIZE} ข้อ · ป้ายบนการ์ดมาจากตัวโหลดจำลองที่หน่วง {CARD_DATA_LATENCY_MS} ms
          และตอบทีละคำขอ ไม่อ่านหรือเขียน Supabase
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>เพิ่มโจทย์จากคลัง</Button>
          <p data-lab-card-requests="0" data-lab-card-ids="0" className="text-sm text-muted-foreground">
            คำขอป้าย 0 ครั้ง · รวม 0 ข้อ
          </p>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>เพิ่มหรือเอาโจทย์ออก</DialogTitle>
            <DialogDescription>ข้อมูลจำลองทั้งหมด การติ๊กเลือกอยู่ในหน่วยความจำของแท็บเท่านั้น</DialogDescription>
          </DialogHeader>
          <QuestionPicker
            questions={BANK}
            selectedIds={draftIds}
            baselineIds={BASELINE_IDS}
            collectionNoun="ชุดข้อสอบ"
            onToggle={id => setDraftIds(prev => (
              prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
            ))}
            search={search}
            onSearchChange={setSearch}
            diffFilter={diffFilter}
            onDiffFilterChange={setDiffFilter}
            showSelectedFooter={false}
            showHeader={false}
            surface="plain"
            loadCardData={loadLabCardData}
          />
        </DialogContent>
      </Dialog>
    </main>
  )
}

import Link from 'next/link'
import { Shuffle, ListChecks, ArrowLeftRight, FileText, CheckSquare, AlignLeft, ArrowUpDown, ChevronRight, FileUp, Blocks } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SAMPLE_QUESTIONS } from './_data/sample-questions'
import { SamplePreview } from './_components/sample-preview'
import type { QuestionType } from '@/lib/types'

const QUESTION_TYPES = [
  {
    href: '/questions/new/random',
    type: 'written' as QuestionType,
    icon: Shuffle,
    title: 'เติมคำตอบตัวเลข',
    desc: 'สร้างจากสมการ เขียนสมการเอง หรือกำหนดคำตอบตายตัว — เลือกได้ในหน้าเดียว',
    color: 'bg-tint-1/10 border-tint-1/20 text-tint-1',
    iconColor: 'text-tint-1',
  },
  {
    href: '/questions/new/mcq',
    type: 'mcq' as QuestionType,
    icon: ListChecks,
    title: 'ปรนัย (เลือกตอบ)',
    desc: 'ตัวเลือก 2–6 ข้อ นักเรียนเลือกคำตอบที่ถูกต้องจากรายการ',
    color: 'bg-success/10 border-success/20 text-success',
    iconColor: 'text-success',
  },
  {
    href: '/questions/new/true-false',
    type: 'true_false' as QuestionType,
    icon: CheckSquare,
    title: 'ถูก-ผิด',
    desc: 'นักเรียนตัดสินว่าข้อความแต่ละข้อถูกหรือผิด',
    color: 'bg-tint-4/10 border-tint-4/20 text-tint-4',
    iconColor: 'text-tint-4',
  },
  {
    href: '/questions/new/fill-blank',
    type: 'fill_blank' as QuestionType,
    icon: AlignLeft,
    title: 'เติมคำในช่องว่าง',
    desc: 'ข้อความพร้อมช่องว่าง นักเรียนพิมพ์คำหรือวลีที่ขาดหายไป',
    color: 'bg-tint-2/10 border-tint-2/20 text-tint-2',
    iconColor: 'text-tint-2',
  },
  {
    href: '/questions/new/ordering',
    type: 'ordering' as QuestionType,
    icon: ArrowUpDown,
    title: 'เรียงลำดับ',
    desc: 'นักเรียนเรียงรายการ ขั้นตอน หรือเหตุการณ์ให้ถูกลำดับ',
    color: 'bg-warning/10 border-warning/20 text-warning',
    iconColor: 'text-warning',
  },
  {
    href: '/questions/new/matching',
    type: 'matching' as QuestionType,
    icon: ArrowLeftRight,
    title: 'จับคู่',
    desc: 'นักเรียนจับคู่รายการสองชุดที่สัมพันธ์กัน',
    color: 'bg-flag/10 border-flag/20 text-flag',
    iconColor: 'text-flag',
  },
  {
    href: '/questions/new/essay',
    type: 'essay' as QuestionType,
    icon: FileText,
    title: 'อัตนัย (บรรยาย)',
    desc: 'นักเรียนเขียนคำตอบอิสระ ครูตรวจและให้คะแนนเอง',
    color: 'bg-tint-3/10 border-tint-3/20 text-tint-3',
    iconColor: 'text-tint-3',
  },
  {
    href: '/questions/new/file-upload',
    type: 'file_upload' as QuestionType,
    icon: FileUp,
    title: 'ส่งไฟล์งาน',
    desc: 'แนบไฟล์รูปภาพหรือ PDF พร้อมคำสั่ง ให้นักเรียนส่งไฟล์คำตอบกลับมา',
    color: 'bg-tint-2/10 border-tint-2/20 text-tint-2',
    iconColor: 'text-tint-2',
  },
  {
    href: '/questions/new/composite',
    type: 'composite' as QuestionType,
    icon: Blocks,
    title: 'โจทย์ผสม (หลายรูปแบบ)',
    desc: 'รวมคำถามถูก-ผิด เติมคำ เรียงลำดับ ปรนัย ฯลฯ ไว้ในโจทย์เดียวกัน ภายใต้โจทย์หลักเดียว',
    color: 'bg-muted border-border text-muted-foreground',
    iconColor: 'text-muted-foreground',
  },
]

export default function NewQuestionTypePage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์ใหม่</h1>
        <p className="text-sm text-muted-foreground mt-1">
          เลือกประเภทโจทย์ที่ต้องการสร้าง — กดรูปดวงตาเพื่อดูว่านักเรียนจะเห็นโจทย์แบบนั้นอย่างไร
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUESTION_TYPES.map((type) => {
          const Icon = type.icon
          return (
            <Card
              key={type.href}
              radius="md"
              padding="none"
              interactive
              className={`flex items-start border-2 ${type.color}`}
            >
              <Link href={type.href} className="flex items-start gap-4 p-4 pr-1 flex-1 min-w-0">
                <div className={`mt-0.5 ${type.iconColor}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{type.title}</p>
                  <p className="text-xs mt-0.5 opacity-75 leading-relaxed">{type.desc}</p>
                </div>
              </Link>
              {/* Rides on the title's line rather than a row of its own — the
                  right edge is empty anyway, so the preview costs no height.
                  Outside the Link because a button nested in an anchor is
                  invalid, and previewing must not start creating. The chevron
                  comes along and turns decorative; the whole text block is
                  still the link. */}
              <div className="flex items-center gap-0.5 shrink-0 pt-3 pr-2">
                <SamplePreview typeTitle={type.title} sample={SAMPLE_QUESTIONS[type.type]} />
                <ChevronRight aria-hidden className="w-4 h-4 opacity-40" />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

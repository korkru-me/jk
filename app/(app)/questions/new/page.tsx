import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Shuffle, ListChecks, ArrowLeftRight, FileText, CheckSquare, AlignLeft, ArrowUpDown, FileUp, Blocks, Table2, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import styles from './question-types.module.css'
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
    accent: 'var(--question-type-numeric)',
  },
  {
    href: '/questions/new/mcq',
    type: 'mcq' as QuestionType,
    icon: ListChecks,
    title: 'ปรนัย (เลือกตอบ)',
    desc: 'ตัวเลือก 2–6 ข้อ นักเรียนเลือกคำตอบที่ถูกต้องจากรายการ',
    accent: 'var(--question-type-mcq)',
  },
  {
    href: '/questions/new/true-false',
    type: 'true_false' as QuestionType,
    icon: CheckSquare,
    title: 'ถูก-ผิด',
    desc: 'นักเรียนตัดสินว่าข้อความแต่ละข้อถูกหรือผิด',
    accent: 'var(--question-type-true-false)',
  },
  {
    href: '/questions/new/fill-blank',
    type: 'fill_blank' as QuestionType,
    icon: AlignLeft,
    title: 'เติมคำในช่องว่าง',
    desc: 'ข้อความพร้อมช่องว่าง นักเรียนพิมพ์คำหรือวลีที่ขาดหายไป',
    accent: 'var(--question-type-fill-blank)',
  },
  {
    href: '/questions/new/ordering',
    type: 'ordering' as QuestionType,
    icon: ArrowUpDown,
    title: 'เรียงลำดับ',
    desc: 'นักเรียนเรียงรายการ ขั้นตอน หรือเหตุการณ์ให้ถูกลำดับ',
    accent: 'var(--question-type-ordering)',
  },
  {
    href: '/questions/new/matching',
    type: 'matching' as QuestionType,
    icon: ArrowLeftRight,
    title: 'จับคู่',
    desc: 'นักเรียนจับคู่รายการสองชุดที่สัมพันธ์กัน',
    accent: 'var(--question-type-matching)',
  },
  {
    href: '/questions/new/essay',
    type: 'essay' as QuestionType,
    icon: FileText,
    title: 'อัตนัย (บรรยาย)',
    desc: 'นักเรียนเขียนคำตอบอิสระ ครูตรวจและให้คะแนนเอง',
    accent: 'var(--question-type-essay)',
  },
  {
    href: '/questions/new/file-upload',
    type: 'file_upload' as QuestionType,
    icon: FileUp,
    title: 'ส่งไฟล์งาน',
    desc: 'แนบไฟล์รูปภาพหรือ PDF พร้อมคำสั่ง ให้นักเรียนส่งไฟล์คำตอบกลับมา',
    accent: 'var(--question-type-file-upload)',
  },
  {
    href: '/questions/new/classify',
    type: 'classify' as QuestionType,
    icon: Table2,
    title: 'ตารางจำแนก',
    desc: 'ตารางเดียว — แถวคือสิ่งที่ให้จำแนก คอลัมน์คือมิติการจำแนก นักเรียนเลือก 1 ตัวเลือกต่อช่อง',
    accent: 'var(--question-type-classify)',
  },
  {
    href: '/questions/new/image-label',
    type: 'image_label' as QuestionType,
    icon: MapPin,
    title: 'เติมคำในรูป',
    desc: 'รูปเดียว — ครูวางช่องคำตอบไว้บนรูป นักเรียนเติมคำว่าแต่ละจุดคืออะไร พิมพ์เอง เลือกจากรายการ หรือลากคำจากคลัง',
    accent: 'var(--question-type-image-label)',
  },
  {
    href: '/questions/new/composite',
    type: 'composite' as QuestionType,
    icon: Blocks,
    title: 'โจทย์ผสม (หลายรูปแบบ)',
    desc: 'รวมคำถามถูก-ผิด เติมคำ เรียงลำดับ ปรนัย ฯลฯ ไว้ในโจทย์เดียวกัน ภายใต้โจทย์หลักเดียว',
    accent: 'var(--question-type-composite)',
  },
]

export default function NewQuestionTypePage() {
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์ใหม่</h1>
        <p className="text-sm text-muted-foreground mt-1">
          เลือกประเภทโจทย์ที่ต้องการสร้าง หรือกด “ดูตัวอย่าง” เพื่อดูมุมมองนักเรียน
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 @min-[42rem]:grid-cols-2 @min-[64rem]:grid-cols-3">
        {QUESTION_TYPES.map((type) => {
          const Icon = type.icon
          return (
            <Card
              key={type.href}
              radius="md"
              padding="none"
              interactive
              style={{ '--question-accent': type.accent } as CSSProperties}
              className={styles.card}
            >
              <Link href={type.href} className={styles.link}>
                <Icon aria-hidden className="col-start-1 row-start-1 mt-2.5 size-6" />
                <h2 className="col-start-2 row-start-1 self-center text-sm font-semibold">{type.title}</h2>
                <p className="col-span-2 col-start-2 row-start-2 text-xs leading-relaxed text-foreground/75">{type.desc}</p>
              </Link>
              <div className="relative z-10 col-start-3 row-start-1 self-start">
                <SamplePreview typeTitle={type.title} samples={SAMPLE_QUESTIONS[type.type]} />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

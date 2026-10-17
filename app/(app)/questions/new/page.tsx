import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Shuffle, ListChecks, ArrowLeftRight, FileText, CheckSquare, AlignLeft, ArrowUpDown, FileUp, Blocks, Table2, MapPin, ArrowRight } from 'lucide-react'
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
    desc: 'กำหนดคำตอบเอง หรือสร้างโจทย์จากสมการพร้อมสุ่มตัวเลข',
    accent: 'var(--question-type-numeric)',
  },
  {
    href: '/questions/new/mcq',
    type: 'mcq' as QuestionType,
    icon: ListChecks,
    title: 'ปรนัย (เลือกตอบ)',
    desc: 'กำหนดตัวเลือก 2–6 ข้อ ให้นักเรียนเลือกคำตอบที่ถูกต้อง',
    accent: 'var(--question-type-mcq)',
  },
  {
    href: '/questions/new/true-false',
    type: 'true_false' as QuestionType,
    icon: CheckSquare,
    title: 'ถูก-ผิด',
    desc: 'ให้นักเรียนตัดสินว่าข้อความแต่ละข้อถูกหรือผิด',
    accent: 'var(--question-type-true-false)',
  },
  {
    href: '/questions/new/fill-blank',
    type: 'fill_blank' as QuestionType,
    icon: AlignLeft,
    title: 'เติมคำในช่องว่าง',
    desc: 'เว้นช่องในข้อความ ให้นักเรียนเติมคำหรือวลีที่ขาดหายไป',
    accent: 'var(--question-type-fill-blank)',
  },
  {
    href: '/questions/new/ordering',
    type: 'ordering' as QuestionType,
    icon: ArrowUpDown,
    title: 'เรียงลำดับ',
    desc: 'จัดลำดับขั้นตอน รายการ หรือเหตุการณ์ให้ถูกต้อง',
    accent: 'var(--question-type-ordering)',
  },
  {
    href: '/questions/new/matching',
    type: 'matching' as QuestionType,
    icon: ArrowLeftRight,
    title: 'จับคู่',
    desc: 'จับคู่ข้อมูลสองชุดด้วยการลากวางหรือโยงเส้น',
    accent: 'var(--question-type-matching)',
  },
  {
    href: '/questions/new/essay',
    type: 'essay' as QuestionType,
    icon: FileText,
    title: 'อัตนัย (บรรยาย)',
    desc: 'ให้นักเรียนเขียนคำตอบอิสระ ครูตรวจและให้คะแนนเอง',
    accent: 'var(--question-type-essay)',
  },
  {
    href: '/questions/new/file-upload',
    type: 'file_upload' as QuestionType,
    icon: FileUp,
    title: 'ส่งไฟล์งาน',
    desc: 'แนบคำสั่ง รูปภาพ หรือ PDF แล้วให้นักเรียนส่งไฟล์คำตอบ',
    accent: 'var(--question-type-file-upload)',
  },
  {
    href: '/questions/new/classify',
    type: 'classify' as QuestionType,
    icon: Table2,
    title: 'ตารางจำแนก',
    desc: 'จำแนกข้อมูลในตาราง โดยเลือกคำตอบให้แต่ละช่อง',
    accent: 'var(--question-type-classify)',
  },
  {
    href: '/questions/new/image-label',
    type: 'image_label' as QuestionType,
    icon: MapPin,
    title: 'เติมคำในรูป',
    desc: 'วางช่องคำตอบบนรูป ให้พิมพ์ เลือก หรือลากคำมาตอบ',
    accent: 'var(--question-type-image-label)',
  },
  {
    href: '/questions/new/composite',
    type: 'composite' as QuestionType,
    icon: Blocks,
    title: 'โจทย์ผสม (หลายรูปแบบ)',
    desc: 'รวมคำถามหลายรูปแบบไว้ภายใต้โจทย์หลักเดียว',
    accent: 'var(--question-type-composite)',
  },
]

export default function NewQuestionTypePage() {
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์ใหม่</h1>
        <p className="text-sm text-muted-foreground mt-1">
          เลือกประเภทโจทย์เพื่อเริ่มสร้าง หรือกด “ดูตัวอย่างโจทย์” เพื่อทดลองตอบในมุมมองนักเรียน
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
              <div className={styles.header}>
                <Icon aria-hidden="true" focusable="false" strokeWidth={1.35} className={styles.watermark} />
                <h2 className={styles.title}>{type.title}</h2>
              </div>
              <div className={styles.body}>
                <p className={styles.description}>{type.desc}</p>
                <div className={styles.actions}>
                  <div className={styles.previewAction}>
                    <SamplePreview typeTitle={type.title} samples={SAMPLE_QUESTIONS[type.type]} />
                  </div>
                  <Link href={type.href} className={styles.link} aria-label={`สร้างโจทย์${type.title}`}>
                    สร้างโจทย์
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { Shuffle, ListChecks, ArrowLeftRight, FileText, CheckSquare, AlignLeft, ArrowUpDown, ChevronRight, FileUp, Blocks } from 'lucide-react'

const QUESTION_TYPES = [
  {
    href: '/questions/new/random',
    icon: Shuffle,
    title: 'เติมคำตอบตัวเลข',
    desc: 'สร้างจากสมการ เขียนสมการเอง หรือกำหนดคำตอบตายตัว — เลือกได้ในหน้าเดียว',
    color: 'bg-tint-1/10 border-tint-1/20 text-tint-1',
    iconColor: 'text-tint-1',
  },
  {
    href: '/questions/new/mcq',
    icon: ListChecks,
    title: 'ปรนัย (เลือกตอบ)',
    desc: 'ตัวเลือก 2–6 ข้อ นักเรียนเลือกคำตอบที่ถูกต้องจากรายการ',
    color: 'bg-success/10 border-success/20 text-success',
    iconColor: 'text-success',
  },
  {
    href: '/questions/new/true-false',
    icon: CheckSquare,
    title: 'ถูก-ผิด',
    desc: 'นักเรียนตัดสินว่าข้อความแต่ละข้อถูกหรือผิด',
    color: 'bg-tint-4/10 border-tint-4/20 text-tint-4',
    iconColor: 'text-tint-4',
  },
  {
    href: '/questions/new/fill-blank',
    icon: AlignLeft,
    title: 'เติมคำในช่องว่าง',
    desc: 'ข้อความพร้อมช่องว่าง นักเรียนพิมพ์คำหรือวลีที่ขาดหายไป',
    color: 'bg-tint-2/10 border-tint-2/20 text-tint-2',
    iconColor: 'text-tint-2',
  },
  {
    href: '/questions/new/ordering',
    icon: ArrowUpDown,
    title: 'เรียงลำดับ',
    desc: 'นักเรียนเรียงรายการ ขั้นตอน หรือเหตุการณ์ให้ถูกลำดับ',
    color: 'bg-warning/10 border-warning/20 text-warning',
    iconColor: 'text-warning',
  },
  {
    href: '/questions/new/matching',
    icon: ArrowLeftRight,
    title: 'จับคู่',
    desc: 'นักเรียนจับคู่รายการสองชุดที่สัมพันธ์กัน',
    color: 'bg-flag/10 border-flag/20 text-flag',
    iconColor: 'text-flag',
  },
  {
    href: '/questions/new/essay',
    icon: FileText,
    title: 'อัตนัย (บรรยาย)',
    desc: 'นักเรียนเขียนคำตอบอิสระ ครูตรวจและให้คะแนนเอง',
    color: 'bg-tint-3/10 border-tint-3/20 text-tint-3',
    iconColor: 'text-tint-3',
  },
  {
    href: '/questions/new/file-upload',
    icon: FileUp,
    title: 'ส่งไฟล์งาน',
    desc: 'แนบไฟล์รูปภาพหรือ PDF พร้อมคำสั่ง ให้นักเรียนส่งไฟล์คำตอบกลับมา',
    color: 'bg-tint-2/10 border-tint-2/20 text-tint-2',
    iconColor: 'text-tint-2',
  },
  {
    href: '/questions/new/composite',
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
        <p className="text-sm text-muted-foreground mt-1">เลือกประเภทโจทย์ที่ต้องการสร้าง</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUESTION_TYPES.map((type) => {
          const Icon = type.icon
          return (
            <Link
              key={type.href}
              href={type.href}
              className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md ${type.color}`}
            >
              <div className={`mt-0.5 ${type.iconColor}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{type.title}</p>
                <p className="text-xs mt-0.5 opacity-75 leading-relaxed">{type.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0 mt-0.5" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

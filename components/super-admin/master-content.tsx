'use client'

import { useState } from 'react'
import {
  BookOpen,
  Send,
  CheckCircle2,
  Globe,
  Lock,
  Tag,
  Search,
  Plus,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

type ContentStatus = 'public' | 'draft' | 'pushed'

interface MasterBundle {
  id: string
  title: string
  description: string
  subject: string
  level: string
  questionCount: number
  tags: string[]
  status: ContentStatus
  pushedAt: string | null
  createdAt: string
  createdBy: string
}

const BUNDLES: MasterBundle[] = [
  {
    id: 'MB001',
    title: 'ชุดข้อสอบฟิสิกส์มาตรฐาน ม.4 ภาคต้น',
    description:
      'ครอบคลุมหัวข้อ การเคลื่อนที่แนวตรง แรงและกฎการเคลื่อนที่ของนิวตัน และงานและพลังงาน',
    subject: 'ฟิสิกส์',
    level: 'ม.4',
    questionCount: 120,
    tags: ['PISA', 'มาตรฐานชาติ', 'โอลิมปิก'],
    status: 'pushed',
    pushedAt: '2026-04-01 10:00',
    createdAt: '2026-03-15',
    createdBy: 'sa@korkru.app',
  },
  {
    id: 'MB002',
    title: 'โจทย์แนว PISA วิทยาศาสตร์ ชุดที่ 1',
    description:
      'โจทย์บริบทชีวิตจริง ทดสอบการคิดเชิงวิทยาศาสตร์ การใช้เหตุผล และการแก้ปัญหาในสถานการณ์จริง',
    subject: 'วิทยาศาสตร์',
    level: 'ม.ปลาย',
    questionCount: 60,
    tags: ['PISA', 'บริบทชีวิตจริง'],
    status: 'pushed',
    pushedAt: '2026-04-15 14:30',
    createdAt: '2026-04-01',
    createdBy: 'sa@korkru.app',
  },
  {
    id: 'MB003',
    title: 'ชุดข้อสอบฟิสิกส์โอลิมปิก ระดับประเทศ ชุดที่ 2',
    description:
      'โจทย์ระดับยากสำหรับนักเรียนที่เตรียมสอบโอลิมปิกวิชาการ ครอบคลุม Mechanics, Electromagnetism, Optics',
    subject: 'ฟิสิกส์',
    level: 'โอลิมปิก',
    questionCount: 80,
    tags: ['โอลิมปิก', 'ระดับยาก', 'IPhO'],
    status: 'public',
    pushedAt: null,
    createdAt: '2026-05-01',
    createdBy: 'sa@korkru.app',
  },
  {
    id: 'MB004',
    title: 'ชุดทบทวน ม.5 ฟิสิกส์ ภาค 2',
    description:
      'ทบทวนหัวข้อ คลื่นกล เสียง แสงและทัศนศาสตร์ และฟิสิกส์นิวเคลียร์เบื้องต้น',
    subject: 'ฟิสิกส์',
    level: 'ม.5',
    questionCount: 95,
    tags: ['ทบทวน', 'มาตรฐานชาติ'],
    status: 'draft',
    pushedAt: null,
    createdAt: '2026-05-10',
    createdBy: 'sa@korkru.app',
  },
  {
    id: 'MB005',
    title: 'โจทย์ฟิสิกส์แนว สสวท. ม.6 ชุดสมบูรณ์',
    description:
      'ข้อสอบครอบคลุมเนื้อหาทั้งหมดในหลักสูตร สสวท. สำหรับชั้น ม.6 พร้อมเฉลยละเอียด',
    subject: 'ฟิสิกส์',
    level: 'ม.6',
    questionCount: 150,
    tags: ['สสวท.', 'ม.6', 'มาตรฐานชาติ'],
    status: 'draft',
    pushedAt: null,
    createdAt: '2026-05-12',
    createdBy: 'sa@korkru.app',
  },
]

const STATUS_CONFIG: Record<ContentStatus, { label: string; cls: string; icon: React.ElementType }> = {
  pushed: {
    label: 'Push แล้ว',
    cls: 'bg-success/10 text-success',
    icon: CheckCircle2,
  },
  public: {
    label: 'Public',
    cls: 'bg-primary/10 text-primary',
    icon: Globe,
  },
  draft: {
    label: 'Draft',
    cls: 'bg-muted text-muted-foreground',
    icon: Lock,
  },
}

function BundleCard({ bundle, onPush }: { bundle: MasterBundle; onPush: (id: string) => void }) {
  const sc = STATUS_CONFIG[bundle.status]
  const StatusIcon = sc.icon

  return (
    <Card radius="md" padding="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground leading-snug truncate">
              {bundle.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {bundle.subject} · {bundle.level} · {bundle.questionCount} ข้อ · สร้างเมื่อ{' '}
              {bundle.createdAt}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
            sc.cls,
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {sc.label}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {bundle.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {bundle.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
          >
            <Tag className="h-2.5 w-2.5" />
            {tag}
          </span>
        ))}
      </div>

      {bundle.pushedAt && (
        <p className="mt-2 text-xs text-success">
          Push ไปยัง Public Bank เมื่อ {bundle.pushedAt}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {bundle.status !== 'pushed' && (
          <button
            onClick={() => onPush(bundle.id)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Send className="h-3.5 w-3.5" />
            Push to Public Bank
          </button>
        )}
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          แก้ไข
        </button>
        {bundle.status === 'pushed' && (
          <span className="text-xs text-muted-foreground">
            ข้อสอบชุดนี้ปรากฏในบัญชีของทุกสถาบันแล้ว
          </span>
        )}
      </div>
    </Card>
  )
}

export function MasterContent() {
  const [bundles, setBundles] = useState(BUNDLES)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('All')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [pushConfirm, setPushConfirm] = useState<string | null>(null)

  const filtered = bundles.filter((b) => {
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.subject.toLowerCase().includes(search.toLowerCase()) ||
      b.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    const matchLevel = levelFilter === 'All' || b.level === levelFilter
    return matchSearch && matchLevel
  })

  function handlePush(id: string) {
    setPushConfirm(id)
  }

  function confirmPush() {
    if (!pushConfirm) return
    setBundles((prev) =>
      prev.map((b) =>
        b.id === pushConfirm
          ? {
              ...b,
              status: 'pushed' as ContentStatus,
              pushedAt: new Date().toLocaleString('th-TH', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
            }
          : b,
      ),
    )
    setPushConfirm(null)
  }

  const pushedCount = bundles.filter((b) => b.status === 'pushed').length
  const totalQuestions = bundles
    .filter((b) => b.status === 'pushed')
    .reduce((s, b) => s + b.questionCount, 0)

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 sm:max-w-lg">
        {[
          { label: 'ชุดข้อสอบทั้งหมด', value: bundles.length.toString() },
          { label: 'Push แล้ว', value: pushedCount.toString() },
          { label: 'ข้อที่แจกจ่ายแล้ว', value: totalQuestions.toLocaleString() },
        ].map((item) => (
          <Card radius="md" padding="md" key={item.label}>
            <p className="text-2xl font-bold text-foreground">{item.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
          </Card>
        ))}
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 dark:border-primary/50">
        <Layers className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-primary">
            Public Bank คืออะไร?
          </p>
          <p className="text-xs text-primary mt-0.5">
            เมื่อ Super Admin กด "Push to Public Bank" ชุดข้อสอบนั้นจะปรากฏในบัญชีของทุกสถาบันทันที
            เป็นจุดขายของแพลตฟอร์มที่ผู้ใช้ทุกคนได้รับประโยชน์ร่วมกัน
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อชุด, วิชา, หรือ Tag" className="w-full pl-9 pr-4 text-foreground dark:placeholder:text-muted-foreground"
          />
        </div>
        <NativeSelect
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)} className="text-muted-foreground"
        >
          <option value="All">ทุกระดับ</option>
          <option value="ม.4">ม.4</option>
          <option value="ม.5">ม.5</option>
          <option value="ม.6">ม.6</option>
          <option value="ม.ปลาย">ม.ปลาย</option>
          <option value="โอลิมปิก">โอลิมปิก</option>
        </NativeSelect>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          สร้างชุดใหม่
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card radius="md" padding="lg" className=" space-y-4">
          <h3 className="font-semibold text-foreground">
            สร้างชุดข้อสอบมาตรฐานใหม่
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                ชื่อชุดข้อสอบ
              </label>
              <Input
                placeholder="เช่น ชุดข้อสอบฟิสิกส์มาตรฐาน ม.6 ภาค 1" className="mt-1 w-full text-foreground dark:placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                ระดับชั้น
              </label>
              <NativeSelect className="mt-1 w-full text-muted-foreground">
                <option>ม.4</option>
                <option>ม.5</option>
                <option>ม.6</option>
                <option>ม.ปลาย</option>
                <option>โอลิมปิก</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                คำอธิบาย
              </label>
              <Textarea
                rows={3}
                placeholder="อธิบายเนื้อหาและขอบเขตของชุดข้อสอบนี้" className="mt-1 w-full text-foreground dark:placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              บันทึก Draft
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        </Card>
      )}

      {/* Bundle List */}
      <div className="space-y-3">
        {filtered.map((bundle) => (
          <BundleCard key={bundle.id} bundle={bundle} onPush={handlePush} />
        ))}
        {filtered.length === 0 && (
          <Card radius="md" className="p-12 text-center">
            <p className="text-sm text-muted-foreground">ไม่พบชุดข้อสอบที่ตรงกับเงื่อนไข</p>
          </Card>
        )}
      </div>

      {/* Confirm Push Dialog */}
      {pushConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
          <Card padding="xl" elevation="xl" className="w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">
                ยืนยัน Push to Public Bank
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              ชุดข้อสอบ "
              <strong>
                {bundles.find((b) => b.id === pushConfirm)?.title}
              </strong>
              " จะปรากฏในบัญชีของทุกสถาบัน ({BUNDLES.length} สถาบัน) ทันที
              การกระทำนี้ไม่สามารถยกเลิกได้โดยง่าย
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={confirmPush}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                ยืนยัน Push
              </button>
              <button
                onClick={() => setPushConfirm(null)}
                className="flex-1 rounded-lg border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

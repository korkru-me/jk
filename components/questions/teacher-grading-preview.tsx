'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Clock3, Pencil, Camera, FileText, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RichText } from '@/components/ui/rich-text'
import type { SubmittedFile } from '@/lib/types'

export type GradingStatus = 'correct' | 'wrong' | 'pending'

export interface GradingRow {
  /** ป้ายข้อย่อย เช่น "ก)" หรือ "ช่อง 2" — เว้นว่างเมื่อโจทย์มีคำตอบเดียว */
  label?: string
  studentAnswer: string
  /** null = ไม่มีเฉลยให้เทียบ (อัตนัย, ช่องพิมพ์เอง, ส่งไฟล์งาน) */
  correctAnswer?: string | null
  /** หน่วยของคำตอบ (เป็น HTML ได้ เหมือน AnswerPart.unit) */
  unit?: string
  status: GradingStatus
  /** ข้อย่อยนี้มีช่องแนบรูปวิธีทำ — แสดงรูปที่แนบ หรือกรอบว่างเมื่อไม่ได้แนบ */
  workImageSlot?: boolean
  /** รูปวิธีทำที่ครูลองแนบดูในหน้าตัวอย่าง (object URL ของแท็บนี้) */
  workImage?: string | null
  /** ไฟล์งานที่ครูลองแนบดู — โจทย์ชนิดส่งไฟล์งาน */
  files?: SubmittedFile[]
}

export interface TeacherGradingPreviewProps {
  questionText: string
  rows: GradingRow[]
  /** คะแนนที่ระบบตรวจให้เองแล้ว */
  autoScore: number
  /** คะแนนเต็มตามโครงสร้างโจทย์ ก่อนครูปรับรายข้อตอนสร้างงาน */
  maxScore: number
  /** อธิบายว่าครูต้องตรวจอะไรในข้อนี้ */
  manualNote: string
  onBack: () => void
}

const STATUS_META: Record<GradingStatus, { icon: typeof CheckCircle2; wrap: string; text: string; label: string }> = {
  correct: { icon: CheckCircle2, wrap: 'bg-success/10 text-success', text: 'text-success', label: 'ถูก' },
  wrong:   { icon: XCircle,      wrap: 'bg-destructive/10 text-destructive', text: 'text-destructive', label: 'ผิด' },
  pending: { icon: Clock3,       wrap: 'bg-warning/10 text-warning', text: 'text-warning', label: 'รอครูตรวจ' },
}

function Unit({ html }: { html: string }) {
  return <RichText text={html} className="[&_p]:inline text-muted-foreground" />
}

/**
 * ป้ายคะแนนที่กดแก้ได้ — ท่าเดียวกับ ScoreEditor ในหน้าตรวจจริง แต่เก็บค่าไว้
 * ในหน่วยความจำของหน้านี้เท่านั้น ไม่มี submission ให้บันทึกลง
 *
 * ให้กดได้จริงเพราะการแก้คะแนนคือสิ่งเดียวที่ครู "ทำ" ที่หน้าตรวจ ป้ายที่กดไม่ได้
 * จึงไม่ได้สอนอะไรเลย · รับทศนิยม เพราะกรณีที่ครูเจอบ่อยคือตอบเลขถูกแต่วิธีทำ
 * ผิด (หรือกลับกัน) แล้วอยากให้ 0.5 จาก 1 ไม่ใช่ให้เต็มหรือให้ศูนย์
 */
function EditableScore({ autoScore, maxScore, pending }: {
  autoScore: number
  maxScore: number
  pending: boolean
}) {
  const [override, setOverride] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const shown = override ?? autoScore

  function save() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxScore) {
      toast.error(`คะแนนต้องอยู่ระหว่าง 0-${maxScore}`)
      return
    }
    setOverride(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={maxScore}
          step="any"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            // กันไม่ให้ปุ่มลอยไปถึง Dialog ที่ครอบอยู่ — Escape ที่นั่นแปลว่า
            // "ปิดตัวอย่างทั้งหน้า" ซึ่งจะพาคำตอบที่ครูเพิ่งลองตอบหายไปด้วย
            // ทั้งที่ครูตั้งใจแค่ยกเลิกการพิมพ์คะแนน
            if (e.key !== 'Enter' && e.key !== 'Escape') return
            e.preventDefault()
            e.stopPropagation()
            if (e.key === 'Enter') save()
            else setEditing(false)
          }}
          autoFocus
          className="w-16 h-7 text-center border-primary/20"
        />
        <span className="text-xs text-muted-foreground">/{maxScore}</span>
        <Button type="button" variant="ghost" size="icon-xs" onClick={save} aria-label="บันทึกคะแนน">
          <Check className="text-success" />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => setEditing(false)} aria-label="ยกเลิก">
          <X className="text-muted-foreground" />
        </Button>
      </span>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={() => { setDraft(String(shown)); setEditing(true) }}
      title="กดเพื่อพิมพ์คะแนนใหม่ ใส่ทศนิยมได้ เช่น 0.5"
      className="rounded-full border border-dashed border-primary/20 text-primary hover:bg-primary/10 font-semibold"
    >
      <Pencil className="w-3 h-3" />
      {pending && override === null ? `รอผล/${maxScore}` : `${shown}/${maxScore}`}
      {override !== null && <span className="font-normal text-muted-foreground">· แก้แล้ว</span>}
    </Button>
  )
}

/**
 * หน้าตรวจของครู แบบจำลอง — โครงเดียวกับการ์ดรายข้อใน `/submissions/[id]`
 * (วงกลมสถานะ, ป้ายคะแนนที่ครูกดแก้ได้, คำตอบเทียบเฉลย, รูปวิธีทำ) โดยรับ
 * คำตอบที่ครูเพิ่งลองตอบในหน้าตัวอย่างมาแสดง
 *
 * เป็นภาพจำลองล้วน ๆ ไม่มี submission จริงให้แก้คะแนน จึงไม่ต่อ server action
 * ใด ๆ และป้ายคะแนนที่นี่กดไม่ได้ — ข้อความท้ายการ์ดบอกผู้ใช้ตรง ๆ ว่าของจริง
 * อยู่ที่ไหน แทนที่จะปล่อยให้เข้าใจว่ากดแก้ตรงนี้ได้แล้วไม่มีอะไรเกิดขึ้น
 */
export function TeacherGradingPreview({
  questionText, rows, autoScore, maxScore, manualNote, onBack,
}: TeacherGradingPreviewProps) {
  const pendingCount = rows.filter(r => r.status === 'pending').length
  const overall: GradingStatus = pendingCount > 0
    ? 'pending'
    : rows.every(r => r.status === 'correct') ? 'correct' : 'wrong'
  const meta = STATUS_META[overall]
  const OverallIcon = meta.icon

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ← กลับไปมุมมองนักเรียน
        </Button>
        <span className="text-xs text-muted-foreground">จำลองจากคำตอบที่คุณเพิ่งลองตอบ</span>
      </div>

      <Card edge="border" padding="lg" className="border-l-4 border-l-primary space-y-3">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.wrap}`}>
            <OverallIcon size={16} />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-foreground">ข้อ 1</p>
              <span className="text-xs text-muted-foreground">โจทย์ที่กำลังสร้าง</span>
              <span className="ml-auto">
                <EditableScore
                  autoScore={autoScore}
                  maxScore={maxScore}
                  pending={pendingCount > 0 && autoScore === 0}
                />
              </span>
            </div>
            <RichText text={questionText} className="text-sm text-muted-foreground" />
          </div>
        </div>

        <div className="pl-11 space-y-2.5 text-sm">
          {rows.map((row, i) => {
            const rowMeta = STATUS_META[row.status]
            return (
              <div
                key={i}
                className={`pl-3 border-l-2 space-y-0.5 ${row.status === 'pending' ? 'border-warning/20' : 'border-border'}`}
              >
                {(row.label || row.status === 'pending') && (
                  <p className={`text-xs font-semibold ${row.status === 'pending' ? 'text-warning' : 'text-muted-foreground'}`}>
                    {row.label}
                    {row.label && row.status === 'pending' && ' — '}
                    {row.status === 'pending' && 'รอครูตรวจ'}
                  </p>
                )}
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">คำตอบนักเรียน:</span>
                  <span className={`font-medium break-words ${row.status === 'pending' ? 'text-foreground' : rowMeta.text}`}>
                    {row.studentAnswer || '—'} {row.unit && <Unit html={row.unit} />}
                  </span>
                </div>
                {row.correctAnswer != null && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">เฉลย:</span>
                    <span className="font-medium text-foreground">
                      {row.correctAnswer} {row.unit && <Unit html={row.unit} />}
                    </span>
                  </div>
                )}
                {row.workImageSlot && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-muted-foreground text-xs">รูปวิธีทำ:</span>
                    {row.workImage ? (
                      <a href={row.workImage} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.workImage}
                          alt="รูปวิธีทำ"
                          className="w-20 h-20 rounded-lg object-cover border border-border hover:opacity-90 transition-opacity"
                        />
                      </a>
                    ) : (
                      <Card
                        radius="sm"
                        edge="dashed"
                        className="w-20 h-20 flex flex-col items-center justify-center gap-1 text-muted-foreground"
                      >
                        <Camera className="w-4 h-4" />
                        <span className="text-[9px] leading-tight text-center">ไม่ได้แนบ</span>
                      </Card>
                    )}
                  </div>
                )}
                {row.files && row.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {row.files.map(f => (
                      f.type.startsWith('image/') ? (
                        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.name}
                            className="w-20 h-20 rounded-lg object-cover border border-border hover:opacity-90 transition-opacity" />
                        </a>
                      ) : (
                        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border border-border bg-muted hover:bg-accent transition-colors max-w-[160px]">
                          <FileText size={14} className="shrink-0 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                        </a>
                      )
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="pl-11 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ครูทำอะไรได้ในหน้านี้</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{manualNote}</p>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground leading-relaxed bg-muted rounded-lg px-3 py-2">
        <span className="font-medium text-foreground">กดที่คะแนนมุมขวาเพื่อลองพิมพ์คะแนนใหม่ได้</span> ใส่ทศนิยมได้
        เช่น ให้ 0.5 หรือ 0.6 จาก {maxScore} เมื่อคำตอบถูกแต่วิธีทำผิด หรือวิธีทำถูกแต่คำตอบผิด ·
        ที่นี่เป็นภาพจำลอง ตัวเลขที่พิมพ์จึงไม่ถูกบันทึก ของจริงอยู่ที่
        <span className="font-medium text-foreground"> หน้าผลการส่งของนักเรียนแต่ละคน </span>
        หลังนักเรียนส่งงานแล้ว กดที่คะแนนแล้วพิมพ์ใหม่ได้ทีละข้อแบบเดียวกันนี้ ·
        คะแนนเต็มต่อข้อ ({maxScore} คะแนนตามโครงสร้างโจทย์) ปรับได้ตอนสร้างงาน
      </p>
    </div>
  )
}

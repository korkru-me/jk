'use client'

import { useRef } from 'react'
import {
  Upload, Droplets, Leaf, Columns2, Copy,
  ScanLine, ShieldCheck, FileKey2, FileText,
  ArchiveIcon, TableIcon, ChevronDown,
  Image as ImageIcon, X,
} from 'lucide-react'
import type { PrintSettings } from './export-client'
import { Input } from '@/components/ui/input'

interface Props {
  settings: PrintSettings
  onPatch: (p: Partial<PrintSettings>) => void
  onLogoUpload: (file: File) => void
  onGenerateZip: () => void
  onExportStats: () => void
  questionCount: number
  studentCount: number
}

function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border py-5 px-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full text-left group"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${checked ? 'bg-foreground' : 'bg-muted'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </button>
  )
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground mb-1">
      {children}
    </label>
  )
}

export function PrintSettingsSidebar({
  settings, onPatch, onLogoUpload,
  onGenerateZip, onExportStats,
  questionCount, studentCount,
}: Props) {
  const logoInputRef = useRef<HTMLInputElement>(null)

  const totalPages = settings.copies * (1 + (settings.attachOMR ? 1 : 0))
  const estimatedTime = Math.ceil(settings.copies * 0.4)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
        <p className="text-sm font-bold text-foreground">ตั้งค่าการพิมพ์</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {questionCount} ข้อ · {studentCount > 0 ? `${studentCount} คน` : `${settings.copies} ชุด`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">

        {/* ─── 1. Document & Brand ───────────────────── */}
        <Section title="แบรนด์และลายน้ำ" icon={ImageIcon}>

          {/* Logo upload */}
          <div>
            <Label>โลโก้สถาบัน</Label>
            {settings.logoUrl ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={settings.logoUrl} alt="Logo" className="h-14 w-auto object-contain border border-border rounded-xl p-2 bg-muted" />
                <button
                  onClick={() => onPatch({ logoUrl: null })}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-ring hover:text-muted-foreground transition-colors text-xs"
              >
                <Upload className="w-4 h-4" />
                คลิกเพื่ออัปโหลดโลโก้ (PNG, JPG)
              </button>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) onLogoUpload(f)
              }}
            />
          </div>

          {/* Institution name */}
          <div>
            <Label>ชื่อสถาบัน</Label>
            <Input
              type="text"
              value={settings.institutionName}
              onChange={e => onPatch({ institutionName: e.target.value })} className="w-full text-foreground"
            />
          </div>

          {/* Watermark */}
          <div>
            <Label>ข้อความลายน้ำ (Watermark)</Label>
            <Input
              type="text"
              value={settings.watermarkText}
              onChange={e => onPatch({ watermarkText: e.target.value })}
              placeholder="เช่น ห้ามถ่ายเอกสาร หรือ DRAFT" className="w-full text-foreground"
            />
          </div>

          {/* Watermark opacity */}
          {settings.watermarkText && (
            <div>
              <div className="flex justify-between mb-1">
                <Label>ความโปร่งใส</Label>
                <span className="text-xs font-medium text-muted-foreground">{settings.watermarkOpacity}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                value={settings.watermarkOpacity}
                onChange={e => onPatch({ watermarkOpacity: Number(e.target.value) })}
                className="w-full accent-foreground cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/40 mt-0.5">
                <span>จาง</span><span>เข้ม</span>
              </div>
            </div>
          )}
        </Section>

        {/* ─── 2. Layout ─────────────────────────────── */}
        <Section title="จัดหน้าและโหมดพิมพ์" icon={Leaf}>

          <Toggle
            checked={settings.ecoMode}
            onChange={v => onPatch({ ecoMode: v })}
            label="Eco-Print Mode"
            description="ลดฟอนต์ + บีบระยะบรรทัด ประหยัดกระดาษ ~20%"
          />

          <div>
            <Label>รูปแบบคอลัมน์</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {([1, 2] as const).map(col => (
                <button
                  key={col}
                  onClick={() => onPatch({ columns: col })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    settings.columns === col
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-ring'
                  }`}
                >
                  <Columns2 className="w-4 h-4" />
                  {col} คอลัมน์
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ─── 3. Dynamic Variable Generator ────────── */}
        <Section title="จำนวนชุดข้อสอบ" icon={Copy}>
          <div>
            <Label htmlFor="copies">จำนวนชุด (แต่ละชุดมีตัวเลขตัวแปรต่างกัน)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="copies"
                type="number"
                min={1}
                max={500}
                value={settings.copies}
                onChange={e => onPatch({ copies: Math.max(1, Math.min(500, Number(e.target.value))) })} className="w-24 text-2xl font-bold text-foreground text-center border-2"
              />
              <div className="text-xs text-muted-foreground leading-relaxed">
                ชุด<br />
                ~{totalPages} หน้ารวม
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              ระบบจะสุ่มค่าตัวแปรในโจทย์ (เช่น มวล ความเร็ว แรง) ให้แต่ละชุดมีคำตอบต่างกัน เพื่อป้องกันการลอกข้อสอบ
            </p>
          </div>
        </Section>

        {/* ─── 4. OMR ───────────────────────────────── */}
        <Section title="กระดาษคำตอบแบบฝน (OMR)" icon={ScanLine}>
          <Toggle
            checked={settings.attachOMR}
            onChange={v => onPatch({ attachOMR: v, previewPage: v ? 'omr' : 'exam' })}
            label="แนบกระดาษ OMR"
            description="เพิ่มกระดาษฝน ก ข ค ง ไว้หน้าสุดท้าย พร้อม QR Code"
          />
          {settings.attachOMR && (
            <div className="p-3 bg-primary/10 rounded-xl">
              <p className="text-xs text-primary leading-relaxed">
                กระดาษ OMR จะมี Barcode ประจำตัวนักเรียน และ QR Code เพื่อส่งคำตอบออนไลน์
              </p>
            </div>
          )}
        </Section>

        {/* ─── 5. Security ──────────────────────────── */}
        <Section title="ความปลอดภัยเอกสาร" icon={ShieldCheck}>
          <Toggle
            checked={settings.printExamId}
            onChange={v => onPatch({ printExamId: v })}
            label="พิมพ์รหัสชุดข้อสอบที่ขอบกระดาษ"
            description="แสดง Exam ID + ชื่อนักเรียนทุกหน้า ป้องกันการถ่ายสำเนา"
          />
        </Section>

        {/* ─── 6. Answer Key ────────────────────────── */}
        <Section title="รูปแบบเฉลย" icon={FileKey2}>
          <div className="space-y-2">
            {([
              { value: 'none',     label: 'ไม่พิมพ์เฉลย',          desc: 'พิมพ์เฉพาะโจทย์' },
              { value: 'quick',    label: 'Quick Key',              desc: 'ตารางเฉลย ก ข ค ง เท่านั้น' },
              { value: 'detailed', label: 'Detailed Solution',      desc: 'แสดงวิธีทำอย่างละเอียด' },
            ] as const).map(opt => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  settings.answerKeyType === opt.value
                    ? 'border-foreground bg-foreground'
                    : 'border-border group-hover:border-ring'
                }`}>
                  {settings.answerKeyType === opt.value && (
                    <div className="w-1.5 h-1.5 rounded-full bg-card" />
                  )}
                </div>
                <div onClick={() => onPatch({ answerKeyType: opt.value })}>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </Section>
      </div>

      {/* ─── Export Actions (sticky bottom) ────────── */}
      <div className="sticky bottom-0 bg-card border-t border-border px-5 py-4 space-y-2.5">
        {/* Summary badge */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          พร้อมสร้าง {settings.copies} ชุด · ~{estimatedTime} วินาที
        </div>

        {/* Primary: Generate ZIP */}
        <button
          onClick={onGenerateZip}
          className="w-full flex items-center justify-center gap-2.5 py-3 bg-foreground text-background text-sm font-bold rounded-2xl hover:bg-foreground active:scale-[0.98] transition-all shadow-lg shadow-foreground/20"
        >
          <ArchiveIcon className="w-4 h-4" />
          Generate &amp; Download All (ZIP)
        </button>

        {/* Secondary: Export stats */}
        <button
          onClick={onExportStats}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 border border-border text-muted-foreground text-sm font-medium rounded-2xl hover:bg-muted transition-colors"
        >
          <TableIcon className="w-4 h-4 text-success" />
          ส่งออกสถิติคะแนน (CSV)
        </button>
      </div>
    </div>
  )
}

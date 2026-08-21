'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Upload, Palette, Image as ImageIcon, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, icon: Icon, children }: {
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon size={15} className="text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </Card>
  )
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function DropZone({
  label,
  hint,
  preview,
  onFile,
  onClear,
}: {
  label: string
  hint: string
  preview: string | null
  onFile: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) onFile(file)
    else toast.error('กรุณาเลือกไฟล์รูปภาพ')
  }, [onFile])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  if (preview) {
    return (
      <div className="relative rounded-2xl border-2 border-border overflow-hidden bg-muted/30 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="preview" className="w-full h-40 object-contain" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs bg-card text-black px-3 py-1.5 rounded-lg font-medium hover:bg-card/90 transition-colors"
          >
            <RefreshCw size={12} /> เปลี่ยนรูป
          </button>
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 text-xs bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg font-medium hover:bg-destructive/90 transition-colors"
          >
            <X size={12} /> ลบ
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      </div>
    )
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-2xl border-2 border-dashed h-40 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
        dragging
          ? 'border-primary bg-primary/8'
          : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
        <Upload size={18} className="text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  )
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#ef4444', '#0ea5e9',
]

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-10 h-10 rounded-xl border-2 border-border transition-transform hover:scale-110 shadow-sm"
          style={{ backgroundColor: value }}
          title="คลิกเพื่อเลือกสี"
        />
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="sr-only"
        />
        <code className="text-xs font-mono bg-muted px-2 py-1 rounded-md border">{value.toUpperCase()}</code>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
              value === c ? 'border-foreground scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function BrandPreview({ logoPreview, primaryColor, orgName }: {
  logoPreview: string | null
  primaryColor: string
  orgName: string
}) {
  return (
    <Card elevation="sm" className=" overflow-hidden">
      {/* Mock topbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ backgroundColor: primaryColor + '18' }}>
        {logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoPreview} alt="logo" className="h-6 object-contain" />
        ) : (
          <div className="h-6 w-20 rounded bg-muted/60 flex items-center justify-center text-[10px] text-muted-foreground font-bold">
            LOGO
          </div>
        )}
        <p className="text-xs font-semibold truncate">{orgName}</p>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="h-2 w-14 rounded-full bg-muted" />
          <div className="h-6 w-6 rounded-full" style={{ backgroundColor: primaryColor }} />
        </div>
      </div>
      {/* Mock content */}
      <div className="p-4 space-y-2">
        <div className="h-2 w-32 rounded-full bg-muted" />
        <div className="h-2 w-48 rounded-full bg-muted/60" />
        <div className="mt-3 h-8 w-28 rounded-lg text-white text-[10px] flex items-center justify-center font-medium"
          style={{ backgroundColor: primaryColor }}>
          ดูตัวอย่างปุ่ม
        </div>
      </div>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BrandingSettings() {
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [bgPreview, setBgPreview] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#3b82f6')
  const [orgName] = useState('ศูนย์ฟิสิกส์โอลิมปิก')

  function fileToPreview(file: File, setter: (v: string) => void) {
    if (file.size > 5 * 1024 * 1024) { toast.error('ขนาดไฟล์ต้องไม่เกิน 5MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setter(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleSave() {
    toast.success('บันทึกการตั้งค่าแบรนด์สำเร็จ ✓')
  }

  return (
    <div className="space-y-5">

      {/* ── Logo Upload ──────────────────────────────────────────────────── */}
      <SectionCard title="โลโก้สถาบัน" description="ไฟล์ PNG หรือ SVG แนะนำขนาด 400×120px" icon={Upload}>
        <DropZone
          label="ลากไฟล์มาวางหรือคลิกเพื่อเลือก"
          hint="PNG, SVG, WebP · ไม่เกิน 5MB"
          preview={logoPreview}
          onFile={f => fileToPreview(f, setLogoPreview)}
          onClear={() => setLogoPreview(null)}
        />
      </SectionCard>

      {/* ── Primary Color ────────────────────────────────────────────────── */}
      <SectionCard title="สีหลักขององค์กร" description="ใช้สำหรับปุ่ม, เมนูที่เลือก, และส่วนเน้น" icon={Palette}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ColorPicker
            label="Primary Theme Color"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <div>
            <p className="text-sm font-medium mb-3">ตัวอย่างการแสดงผล</p>
            <BrandPreview
              logoPreview={logoPreview}
              primaryColor={primaryColor}
              orgName={orgName}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Login Page Background ─────────────────────────────────────────── */}
      <SectionCard title="พื้นหลังหน้าล็อกอิน" description="ภาพที่จะแสดงในหน้าล็อกอินของสถาบัน" icon={ImageIcon}>
        <DropZone
          label="ลากภาพพื้นหลังมาวางหรือคลิกเพื่อเลือก"
          hint="JPEG, PNG, WebP · แนะนำ 1920×1080px · ไม่เกิน 5MB"
          preview={bgPreview}
          onFile={f => fileToPreview(f, setBgPreview)}
          onClear={() => setBgPreview(null)}
        />
        {bgPreview && (
          <div className="mt-3 rounded-xl overflow-hidden border h-32 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgPreview} alt="bg preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="bg-card/90 rounded-xl px-6 py-3 text-center">
                <p className="text-xs font-bold">ล็อกอินเข้าสู่ระบบ</p>
                <div className="mt-1 h-2 w-24 rounded-full bg-muted mx-auto" />
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="min-w-[140px]">
          บันทึกการตั้งค่าแบรนด์
        </Button>
      </div>
    </div>
  )
}

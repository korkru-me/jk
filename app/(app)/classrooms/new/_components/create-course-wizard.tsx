'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Check, ChevronRight, ChevronLeft, Users, Globe, UserCheck, Lock,
  CalendarDays, Clock, X, Tag, Upload, Plus,
  ArrowLeftRight, GraduationCap, BookOpen, HelpCircle, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClassroom } from '@/lib/actions/classrooms'
import {
  ACCESS_LABEL, ACCESS_BADGE, GRADE_SUGGESTIONS, getTermSuggestions, getSmartTermDefault,
  composeDescription, COVER_PRESETS,
} from '@/app/(app)/classrooms/_components/classroom-meta'
import { AccessTypePicker, TagInput, CreatableCombobox } from '@/app/(app)/classrooms/_components/classroom-meta-fields'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { ClassroomType } from '@/lib/types'
import { Card } from '@/components/ui/card'

// ─── Static Data ──────────────────────────────────────────────────────────────

// ─── Schema ───────────────────────────────────────────────────────────────────

const wizardSchema = z.object({
  classroomType:   z.enum(['subject', 'homeroom']),
  cover:           z.string(),
  coverImageUrl:   z.string(),
  name:            z.string().min(1, 'กรุณากรอกชื่อห้องเรียน').max(100, 'ชื่อห้องเรียนไม่เกิน 100 ตัวอักษร'),
  description:     z.string().max(500, 'คำอธิบายไม่เกิน 500 ตัวอักษร'),
  gradeLevel:      z.string(),
  academicTerm:    z.string(),
  tags:            z.array(z.string()),
  accessType:      z.enum(['open', 'request', 'closed']),
  capacityEnabled: z.boolean(),
  maxCapacity:     z.string(),
  startDate:       z.string(),
  endDate:         z.string(),
})

type WizardData = z.infer<typeof wizardSchema>

const DEFAULT_VALUES: WizardData = {
  classroomType:   'subject',
  cover:           COVER_PRESETS[0].id,
  coverImageUrl:   '',
  name:            '',
  description:     '',
  gradeLevel:      '',
  academicTerm:    getSmartTermDefault(),
  tags:            [],
  accessType:      'open',
  capacityEnabled: false,
  maxCapacity:     '30',
  startDate:       '',
  endDate:         '',
}

const STEPS = [
  { id: 0, label: 'หน้าปกและข้อมูล' },
  { id: 1, label: 'การเข้าร่วม' },
]

const STEP_FIELDS: Record<number, (keyof WizardData)[]> = {
  0: ['name'],
  1: [],
}

function canProceed(step: number, values: WizardData): boolean {
  if (step === 0) return values.name.trim().length > 0
  return true
}

// ─── Primitive Sub-components ─────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-xs text-destructive mt-1.5">
      <Info className="w-3 h-3 shrink-0" />
      {message}
    </p>
  )
}

// ─── Cover Design Section ─────────────────────────────────────────────────────

function CoverDesignSection({
  cover, coverImageUrl, onCoverChange, onImageChange,
}: {
  cover: string
  coverImageUrl: string
  onCoverChange: (id: string) => void
  onImageChange: (u: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">ธีมสี</Label>
        <div className="flex flex-wrap gap-2.5">
          {COVER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={cover === preset.id}
              onClick={() => onCoverChange(preset.id)}
              className={cn(
                'w-8 h-8 rounded-full transition-all hover:scale-110',
                preset.solid,
                cover === preset.id
                  ? 'scale-110 shadow-md ring-2 ring-offset-2 ring-ring'
                  : 'opacity-70 hover:opacity-100',
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">
          รูปภาพหน้าปก
          <span className="text-xs text-muted-foreground font-normal ml-1">(ไม่บังคับ — แทนที่สีหน้าปก)</span>
        </Label>
        <ImageUploadZone value={coverImageUrl} onChange={onImageChange} />
      </div>
    </div>
  )
}

// ─── Image Upload Zone ────────────────────────────────────────────────────────

function ImageUploadZone({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('กรุณาเลือกไฟล์รูปภาพ'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('ไฟล์ต้องมีขนาดไม่เกิน 5MB'); return }
    onChange(URL.createObjectURL(file))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  if (value) {
    return (
      <div className="relative rounded-xl overflow-hidden group">
        <img src={value} alt="cover preview" className="w-full h-24 object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-overlay text-white flex items-center justify-center hover:bg-overlay transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
        isDragging
          ? 'border-primary bg-primary/10 scale-[1.01]'
          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30',
      )}
    >
      <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        ลากวางรูปภาพ หรือ{' '}
        <span className="text-primary font-medium">คลิกเพื่อเลือก</span>
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, WebP — สูงสุด 5MB</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}

// ─── Step Indicator (clickable completed steps) ───────────────────────────────

function StepIndicator({
  current,
  onStepClick,
}: {
  current: number
  onStepClick: (step: number) => void
}) {
  return (
    <div className="flex items-start justify-center">
      {STEPS.map((step, idx) => {
        const done = current > step.id
        const active = current === step.id

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={!done}
                onClick={() => done && onStepClick(step.id)}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300',
                  done
                    ? 'bg-primary border-primary text-primary-foreground dark:bg-primary dark:border-primary cursor-pointer hover:bg-primary/90 hover:border-primary hover:scale-105'
                    : active
                    ? 'border-primary text-primary bg-primary/10 dark:border-primary'
                    : 'border-border text-muted-foreground bg-background cursor-default',
                )}
                title={done ? `กลับไปขั้นตอน: ${step.label}` : undefined}
              >
                {done ? <Check className="w-4 h-4" /> : String(step.id + 1)}
              </button>
              <span className={cn(
                'text-[11px] font-medium whitespace-nowrap hidden sm:block',
                active ? 'text-primary' : done ? 'text-primary/70 dark:text-primary/60' : 'text-muted-foreground',
              )}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'h-0.5 w-12 sm:w-20 mx-1.5 mb-5 transition-colors duration-300',
                current > step.id ? 'bg-primary dark:bg-primary' : 'bg-border',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Classroom Preview Card (right side, sticky) ─────────────────────────────

function ClassroomPreviewCard({ values }: { values: WizardData }) {
  const preset = COVER_PRESETS.find(p => p.id === values.cover) ?? null
  const hasCover = values.coverImageUrl !== ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">ตัวอย่าง Live Preview</p>
      </div>

      <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
        <div
          className={cn(
            'relative h-36 flex flex-col justify-end p-5 overflow-hidden',
            !hasCover && (preset ? `${preset.surface} ${preset.text}` : 'bg-muted text-muted-foreground'),
          )}
          style={hasCover
            ? { backgroundImage: `url(${values.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined}
        >
          {hasCover && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />}
          <div className="relative">
            <p className={cn(
              'font-bold text-lg leading-tight truncate',
              hasCover && 'text-white drop-shadow-sm',
            )}>
              {values.name.trim() || 'ชื่อห้องเรียน'}
            </p>
            {(values.gradeLevel || values.academicTerm) && (
              <p className={cn('text-xs mt-0.5', hasCover ? 'text-white opacity-80' : preset?.textMuted)}>
                {[values.gradeLevel, values.academicTerm].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="bg-card px-4 py-3 space-y-3">
          {values.description.trim() && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {values.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', ACCESS_BADGE[values.accessType])}>
              {ACCESS_LABEL[values.accessType]}
            </span>
          </div>
          {values.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {values.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                  {tag}
                </span>
              ))}
              {values.tags.length > 5 && (
                <span className="text-xs text-muted-foreground">+{values.tags.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">ข้อมูลการตั้งค่า</p>
        <div className="space-y-1.5">
          {values.capacityEnabled && values.maxCapacity && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>จำกัด {values.maxCapacity} คน</span>
            </div>
          )}
          {values.startDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span>
                เปิด {values.startDate}
                {values.endDate ? ` → ${values.endDate}` : ''}
              </span>
            </div>
          )}
          {!values.capacityEnabled && !values.startDate && (
            <p className="text-xs text-muted-foreground/50 italic">กรอกข้อมูลเพิ่มเติมในขั้นตอนถัดไป</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 0: Cover Design & Metadata ─────────────────────────────────────────

function ClassroomTypeSection({ value, onChange }: { value: ClassroomType; onChange: (v: ClassroomType) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">ประเภทห้องเรียน</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('subject')}
          className={cn(
            'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200',
            value === 'subject'
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-card hover:border-muted-foreground/30',
          )}
        >
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', value === 'subject' ? 'bg-card/60' : 'bg-muted')}>
            <BookOpen className={cn('w-4 h-4', value === 'subject' ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', value === 'subject' ? 'text-primary' : 'text-foreground')}>ห้องเรียนวิชา</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">มอบหมายการบ้าน สอบ ให้คะแนน</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange('homeroom')}
          className={cn(
            'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200',
            value === 'homeroom'
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-card hover:border-muted-foreground/30',
          )}
        >
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', value === 'homeroom' ? 'bg-card/60' : 'bg-muted')}>
            <Users className={cn('w-4 h-4', value === 'homeroom' ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', value === 'homeroom' ? 'text-primary' : 'text-foreground')}>ห้อง Homeroom</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">ครูที่ปรึกษาติดตามการส่งงานทุกวิชา</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function Step0Content({
  control,
  errors,
  values,
  onClassroomTypeChange,
  onCoverChange,
  onCoverImageChange,
  onTagsChange,
}: {
  control: ReturnType<typeof useForm<WizardData>>['control']
  errors: ReturnType<typeof useForm<WizardData>>['formState']['errors']
  values: WizardData
  onClassroomTypeChange: (v: ClassroomType) => void
  onCoverChange: (id: string) => void
  onCoverImageChange: (u: string) => void
  onTagsChange: (t: string[]) => void
}) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-lg font-bold text-foreground">การออกแบบหน้าปกและข้อมูล</h2>
        <p className="text-sm text-muted-foreground mt-0.5">ตั้งชื่อ เลือกธีม และกรอกรายละเอียดห้องเรียน</p>
      </div>

      <ClassroomTypeSection value={values.classroomType} onChange={onClassroomTypeChange} />

      <CoverDesignSection
        cover={values.cover}
        coverImageUrl={values.coverImageUrl}
        onCoverChange={onCoverChange}
        onImageChange={onCoverImageChange}
      />

      <div className="space-y-1.5">
        <Label htmlFor="cls-name">
          ชื่อห้องเรียน <span className="text-destructive">*</span>
        </Label>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              {...field}
              id="cls-name"
              placeholder="เช่น ฟิสิกส์ ม.4/1 ภาคเรียน 1"
              autoFocus
              className="h-10"
            />
          )}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cls-desc">
          คำอธิบายรายวิชา
          <span className="text-xs text-muted-foreground font-normal ml-1">(ไม่บังคับ)</span>
        </Label>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Textarea
              {...field}
              id="cls-desc"
              placeholder="อธิบายเนื้อหาที่จะเรียน เป้าหมาย หรือรายละเอียดที่เป็นประโยชน์..."
              rows={3}
              className="resize-none"
            />
          )}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="grade-combobox">ระดับชั้น</Label>
          <Controller
            control={control}
            name="gradeLevel"
            render={({ field }) => (
              <CreatableCombobox
                value={field.value}
                onChange={field.onChange}
                options={GRADE_SUGGESTIONS}
                placeholder="เช่น ม.4/1 หรือพิมพ์เองได้"
              />
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="term-combobox">ปีการศึกษา / ภาคเรียน</Label>
          <Controller
            control={control}
            name="academicTerm"
            render={({ field }) => (
              <CreatableCombobox
                value={field.value}
                onChange={field.onChange}
                options={getTermSuggestions()}
                placeholder="เช่น 1/2569"
              />
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            แท็กรายวิชา
            <span className="text-xs text-muted-foreground font-normal">(ไม่บังคับ)</span>
          </Label>
          <TooltipIcon text="แท็กช่วยให้นักเรียนค้นหาคอร์สได้ง่ายขึ้น เช่น ฟิสิกส์, กลศาสตร์, ม.4" />
        </div>
        <TagInput tags={values.tags} onChange={onTagsChange} />
      </div>
    </div>
  )
}

function TooltipIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
        aria-label="คำอธิบาย"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute left-6 -top-1 z-50 w-56 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 pointer-events-none">
          <p className="text-xs text-popover-foreground leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}

// ─── Step 1: Enrollment & Lifecycle ──────────────────────────────────────────

function Step1Content({
  control,
  values,
  onToggleCapacity,
}: {
  control: ReturnType<typeof useForm<WizardData>>['control']
  values: WizardData
  onToggleCapacity: (v: boolean) => void
}) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-lg font-bold text-foreground">การเข้าร่วมและระยะเวลา</h2>
        <p className="text-sm text-muted-foreground mt-0.5">กำหนดวิธีเข้าร่วมและช่วงเวลาของห้องเรียน</p>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">ประเภทการเข้าร่วม</Label>
        <Controller
          control={control}
          name="accessType"
          render={({ field }) => (
            <AccessTypePicker value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">จำกัดจำนวนที่นั่ง</p>
              <p className="text-xs text-muted-foreground">ล็อกอัตโนมัติเมื่อนักเรียนเต็มจำนวน</p>
            </div>
          </div>
          <ToggleSwitch checked={values.capacityEnabled} onChange={onToggleCapacity} />
        </div>
        {values.capacityEnabled && (
          <div className="pt-1 space-y-1.5 border-t border-border">
            <Label htmlFor="max-cap" className="text-sm pt-3 block">จำนวนที่นั่งสูงสุด</Label>
            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="maxCapacity"
                render={({ field }) => (
                  <Input {...field} id="max-cap" type="number" min={1} max={500} className="h-10 w-28 text-center text-base font-semibold" placeholder="30" />
                )}
              />
              <span className="text-sm text-muted-foreground">คน</span>
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-warning" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">ระยะเวลาของห้องเรียน</p>
            <p className="text-xs text-muted-foreground">ไม่บังคับ — หากไม่กำหนดวันสิ้นสุด ห้องเรียนจะเปิดตลอด</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="start-date" className="text-sm">วันเปิดคอร์ส</Label>
            <Controller control={control} name="startDate" render={({ field }) => (
              <Input {...field} id="start-date" type="date" className="h-10" />
            )} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date" className="text-sm">วันปิดคอร์ส</Label>
            <Controller control={control} name="endDate" render={({ field }) => (
              <Input {...field} id="end-date" type="date" className="h-10" />
            )} />
          </div>
        </div>
        {(values.startDate || values.endDate) && (
          <div className="flex items-start gap-2.5 text-xs text-warning bg-warning/10 rounded-xl px-3.5 py-3 border border-warning/20">
            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>เมื่อถึงวันปิดคอร์ส ระบบจะเปลี่ยนเป็น <strong>Read-only</strong> — นักเรียนดูประวัติได้แต่ส่งคำตอบไม่ได้</p>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function CreateCourseWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  })

  const { control, watch, setValue, formState: { errors } } = form
  const values = watch()

  const isNextEnabled = canProceed(currentStep, values) && !isPending

  async function handleNext() {
    const valid = await form.trigger(STEP_FIELDS[currentStep])
    if (!valid) return
    if (currentStep === 1) {
      if (values.capacityEnabled && (!values.maxCapacity || Number(values.maxCapacity) < 1)) {
        toast.error('กรุณากรอกจำนวนที่นั่งที่ถูกต้อง')
        return
      }
      if (values.startDate && values.endDate && values.startDate > values.endDate) {
        toast.error('วันเปิดคอร์สต้องอยู่ก่อนวันปิดคอร์ส')
        return
      }
    }
    setCurrentStep((prev) => prev + 1)
  }

  function handleBack() { setCurrentStep((prev) => prev - 1) }

  function handleStepClick(step: number) {
    if (step < currentStep) setCurrentStep(step)
  }

  function handleSubmit() {
    const data = values

    // The description encoding is shared with the settings dialog — see
    // classroom-meta.ts.
    const description = composeDescription({
      description:     data.description,
      cover:           data.cover,
      gradeLevel:      data.gradeLevel,
      academicTerm:    data.academicTerm,
      tags:            data.tags,
      accessType:      data.accessType,
      capacityEnabled: data.capacityEnabled,
      maxCapacity:     data.maxCapacity,
      startDate:       data.startDate,
      endDate:         data.endDate,
    })

    startTransition(async () => {
      try {
        const res = await createClassroom({
          name: data.name.trim(),
          description,
          classroomType: data.classroomType,
        })
        if (res?.error) {
          toast.error(res.error)
          return
        }
        toast.success('สร้างห้องเรียนสำเร็จ! กำลังเปลี่ยนหน้า...')
        setTimeout(() => { window.location.href = '/classrooms' }, 800)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error('เกิดข้อผิดพลาดที่ไม่คาดคิด: ' + msg)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">
      {/* ── Left: Form ── */}
      <Card elevation="sm" className="overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-foreground">สร้างห้องเรียนใหม่</h1>
            <p className="text-sm text-muted-foreground mt-0.5">ขั้นตอน {currentStep + 1} จาก {STEPS.length}</p>
          </div>
          <StepIndicator current={currentStep} onStepClick={handleStepClick} />
        </div>

        {/* Step Content */}
        <div className="px-6 py-7">
          {currentStep === 0 && (
            <Step0Content
              control={control}
              errors={errors}
              values={values}
              onClassroomTypeChange={(v) => setValue('classroomType', v)}
              onCoverChange={(id) => setValue('cover', id)}
              onCoverImageChange={(u) => setValue('coverImageUrl', u)}
              onTagsChange={(t) => setValue('tags', t)}
            />
          )}
          {currentStep === 1 && (
            <Step1Content
              control={control}
              values={values}
              onToggleCapacity={(v) => setValue('capacityEnabled', v)}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex items-center justify-between border-t border-border pt-5">
          <div>
            {currentStep > 0 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={isPending}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                ย้อนกลับ
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!isNextEnabled}
                title={!isNextEnabled ? 'กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อน' : undefined}
              >
                ถัดไป
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!isNextEnabled}
                className="bg-success hover:bg-success/90 disabled:bg-success/40 text-success-foreground min-w-[160px]"
              >
                <Check className="w-4 h-4 mr-1.5" />
                {isPending ? 'กำลังสร้างห้องเรียน...' : 'ยืนยันสร้างห้องเรียน'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Right: Live Preview ── */}
      <div className="hidden lg:block">
        <Card elevation="sm" padding="lg" className="sticky top-8">
          <ClassroomPreviewCard values={values} />
        </Card>
      </div>
    </div>
  )
}

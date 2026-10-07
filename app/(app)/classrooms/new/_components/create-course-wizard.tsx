'use client'

import { useState, useTransition, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Check, ChevronDown, ChevronRight, ChevronLeft, Clock, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClassroom, duplicateClassroom } from '@/lib/actions/classrooms'
import {
  GRADE_SUGGESTIONS, getTermSuggestions, getSmartTermDefault,
  composeDescription, COVER_PRESETS,
} from '@/app/(app)/classrooms/_components/classroom-meta'
import { AccessTypePicker, CreatableCombobox } from '@/app/(app)/classrooms/_components/classroom-meta-fields'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { ClassroomType } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ClassroomIconPicker } from '@/components/classrooms/classroom-icon-picker'
import { ClassroomCoverUpload, type ClassroomCoverUploadHandler } from '@/components/classrooms/classroom-cover-upload'
import { DEFAULT_CLASSROOM_ICON, classroomIconKey, isClassroomIconKey, type ClassroomIconKey } from '@/lib/classroom-icons'

// ─── Static Data ──────────────────────────────────────────────────────────────

// ─── Schema ───────────────────────────────────────────────────────────────────

const wizardSchema = z.object({
  classroomType:   z.enum(['subject', 'homeroom']),
  cover:           z.string(),
  iconKey:         z.custom<ClassroomIconKey>(isClassroomIconKey, 'กรุณาเลือกไอคอนจากตัวเลือกที่มี'),
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

export type WizardData = z.infer<typeof wizardSchema>

const DEFAULT_VALUES: WizardData = {
  classroomType:   'subject',
  cover:           COVER_PRESETS[0].id,
  iconKey:         DEFAULT_CLASSROOM_ICON,
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
  cover, coverImageUrl, onCoverChange, onImageChange, uploadCoverImage,
}: {
  cover: string
  coverImageUrl: string
  onCoverChange: (id: string) => void
  onImageChange: (u: string) => void
  uploadCoverImage?: ClassroomCoverUploadHandler
}) {
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const selectedPreset = COVER_PRESETS.find(preset => preset.id === cover) ?? COVER_PRESETS[0]

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">ธีมสี</Label>
        <Collapsible open={themePickerOpen} onOpenChange={setThemePickerOpen}>
          <CollapsibleTrigger
            render={<Button type="button" variant="outline" className="h-10 w-full justify-start gap-3" />}
            aria-label={`ธีมสี: ${selectedPreset.label}`}
          >
            <span className={cn('size-5 shrink-0 rounded-full ring-1 ring-border', selectedPreset.solid)} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{selectedPreset.label}</span>
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', themePickerOpen && 'rotate-180')} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card padding="sm" radius="sm" className="mt-2 flex flex-wrap gap-2">
              {COVER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  aria-label={preset.label}
                  aria-pressed={cover === preset.id}
                  onClick={() => {
                    onCoverChange(preset.id)
                    setThemePickerOpen(false)
                  }}
                  className={cn(
                    'size-8 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    preset.solid,
                    cover === preset.id
                      ? 'shadow-sm ring-2 ring-ring ring-offset-2'
                      : 'opacity-70 hover:opacity-100',
                  )}
                />
              ))}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          รูปภาพหน้าปก
          <span className="ml-1 text-xs font-normal text-muted-foreground">(ไม่บังคับ)</span>
        </Label>
        <ClassroomCoverUpload value={coverImageUrl} onChange={onImageChange} uploadFile={uploadCoverImage} />
      </div>
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
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!done}
                onClick={() => done && onStepClick(step.id)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                  done
                    ? 'cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary/90 dark:border-primary dark:bg-primary'
                    : active
                    ? 'border-primary text-primary bg-primary/10 dark:border-primary'
                    : 'border-border text-muted-foreground bg-background cursor-default',
                )}
                title={done ? `กลับไปขั้นตอน: ${step.label}` : undefined}
              >
                {done ? <Check className="size-3.5" /> : String(step.id + 1)}
              </button>
              <span className={cn(
                'hidden whitespace-nowrap text-[11px] font-medium sm:block',
                active ? 'text-primary' : done ? 'text-primary/70 dark:text-primary/60' : 'text-muted-foreground',
              )}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'mx-1.5 mb-4 h-px w-10 transition-colors sm:w-16',
                current > step.id ? 'bg-primary dark:bg-primary' : 'bg-border',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 0: Cover Design & Metadata ─────────────────────────────────────────

function ClassroomTypeSection({
  value, onChange, disabled = false,
}: {
  value: ClassroomType
  onChange: (v: ClassroomType) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">ประเภทห้องเรียน</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('subject')}
          aria-pressed={value === 'subject'}
          className={cn(
            'flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors',
            disabled && 'cursor-not-allowed opacity-70',
            value === 'subject'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:border-muted-foreground/30',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className={cn('font-semibold text-sm', value === 'subject' ? 'text-primary' : 'text-foreground')}>ห้องเรียน</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">มอบหมายการบ้าน สอบ และให้คะแนน</p>
          </div>
          {value === 'subject' && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('homeroom')}
          aria-pressed={value === 'homeroom'}
          className={cn(
            'flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors',
            disabled && 'cursor-not-allowed opacity-70',
            value === 'homeroom'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:border-muted-foreground/30',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className={cn('font-semibold text-sm', value === 'homeroom' ? 'text-primary' : 'text-foreground')}>ห้อง Homeroom</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">ติดตามการส่งงานของนักเรียนทุกวิชา</p>
          </div>
          {value === 'homeroom' && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
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
  onIconChange,
  onCoverImageChange,
  uploadCoverImage,
  classroomTypeLocked,
}: {
  control: ReturnType<typeof useForm<WizardData>>['control']
  errors: ReturnType<typeof useForm<WizardData>>['formState']['errors']
  values: WizardData
  onClassroomTypeChange: (v: ClassroomType) => void
  onCoverChange: (id: string) => void
  onIconChange: (key: ClassroomIconKey) => void
  onCoverImageChange: (u: string) => void
  uploadCoverImage?: ClassroomCoverUploadHandler
  classroomTypeLocked?: boolean
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">หน้าปกและข้อมูลห้องเรียน</h2>

      <ClassroomTypeSection
        value={values.classroomType}
        onChange={onClassroomTypeChange}
        disabled={classroomTypeLocked}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <span className="ml-1 text-xs font-normal text-muted-foreground">(ไม่บังคับ)</span>
          </Label>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <Textarea
                {...field}
                id="cls-desc"
                placeholder="เนื้อหา เป้าหมาย หรือรายละเอียดที่เป็นประโยชน์"
                rows={2}
                className="min-h-10 resize-none"
              />
            )}
          />
          <FieldError message={errors.description?.message} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <ClassroomIconPicker value={values.iconKey} onValueChange={onIconChange} compact />

      <CoverDesignSection
        cover={values.cover}
        coverImageUrl={values.coverImageUrl}
        onCoverChange={onCoverChange}
        onImageChange={onCoverImageChange}
        uploadCoverImage={uploadCoverImage}
      />
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
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">การเข้าร่วมและระยะเวลา</h2>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">ประเภทการเข้าร่วม</Label>
        <Controller
          control={control}
          name="accessType"
          render={({ field }) => (
            <AccessTypePicker value={field.value} onChange={field.onChange} compact />
          )}
        />
      </div>

      <Card padding="md" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p id="capacity-label" className="text-sm font-semibold text-foreground">จำกัดจำนวนที่นั่ง</p>
            <p className="text-xs text-muted-foreground">ปิดรับอัตโนมัติเมื่อครบจำนวน</p>
          </div>
          <ToggleSwitch checked={values.capacityEnabled} onChange={onToggleCapacity} aria-labelledby="capacity-label" />
        </div>
        {values.capacityEnabled && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="max-cap" className="text-sm">จำนวนที่นั่งสูงสุด</Label>
              <Controller
                control={control}
                name="maxCapacity"
                render={({ field }) => (
                  <Input {...field} id="max-cap" type="number" min={1} max={500} className="h-10 w-28 text-center font-semibold" placeholder="30" />
                )}
              />
            </div>
            <span className="pb-2.5 text-sm text-muted-foreground">คน</span>
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm font-semibold text-foreground">ระยะเวลาของห้องเรียน</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              <p>เมื่อถึงวันปิดคอร์ส ระบบจะเปลี่ยนเป็น <strong>Read-only</strong> — นักเรียนดูประวัติได้แต่ส่งคำตอบไม่ได้</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

/** The dev-only screen lab injects local mutations instead of touching Supabase. */
export interface CreateCourseWizardActions {
  createClassroom: typeof createClassroom
  duplicateClassroom: typeof duplicateClassroom
  uploadCoverImage?: ClassroomCoverUploadHandler
  onCreated?: () => void
}

export function CreateCourseWizard({
  duplicateSourceId,
  initialValues,
  actions,
}: {
  duplicateSourceId?: string
  initialValues?: Partial<WizardData>
  actions?: CreateCourseWizardActions
}) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: { ...DEFAULT_VALUES, ...initialValues, iconKey: classroomIconKey(initialValues?.iconKey) },
    mode: 'onTouched',
  })

  const { control, watch, setValue, formState: { errors } } = form
  const values = watch()

  const isNextEnabled = canProceed(currentStep, values) && !isPending

  function validateEnrollment() {
    if (values.capacityEnabled && (!values.maxCapacity || Number(values.maxCapacity) < 1)) {
      toast.error('กรุณากรอกจำนวนที่นั่งที่ถูกต้อง')
      return false
    }
    if (values.startDate && values.endDate && values.startDate > values.endDate) {
      toast.error('วันเปิดคอร์สต้องอยู่ก่อนวันปิดคอร์ส')
      return false
    }
    return true
  }

  async function handleNext() {
    const valid = await form.trigger(STEP_FIELDS[currentStep])
    if (!valid) return
    if (currentStep === 1 && !validateEnrollment()) return
    setCurrentStep((prev) => prev + 1)
  }

  function handleBack() { setCurrentStep((prev) => prev - 1) }

  function handleStepClick(step: number) {
    if (step < currentStep) setCurrentStep(step)
  }

  function handleSubmit() {
    if (!validateEnrollment()) return
    const data = values

    // The description encoding is shared with the settings dialog — see
    // classroom-meta.ts.
    const description = composeDescription({
      description:     data.description,
      cover:           data.cover,
      coverImageUrl:   data.coverImageUrl,
      iconKey:         data.iconKey,
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
        const res = duplicateSourceId
          ? await (actions?.duplicateClassroom ?? duplicateClassroom)(duplicateSourceId, {
              name: data.name.trim(),
              description,
            })
          : await (actions?.createClassroom ?? createClassroom)({
              name: data.name.trim(),
              description,
              classroomType: data.classroomType,
            })
        if ('error' in res) {
          toast.error(res.error)
          return
        }
        const copiedAssignments = 'copiedAssignments' in res && typeof res.copiedAssignments === 'number'
          ? res.copiedAssignments
          : 0
        toast.success(duplicateSourceId
          ? `สร้างสำเนาห้องเรียนแล้ว${copiedAssignments > 0 ? ` · เก็บงาน ${copiedAssignments} ชิ้นเป็นแบบร่าง` : ''}`
          : 'สร้างห้องเรียนสำเร็จ! กำลังเปลี่ยนหน้า...')
        if (actions?.onCreated) actions.onCreated()
        else setTimeout(() => { window.location.href = '/classrooms' }, 800)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error('เกิดข้อผิดพลาดที่ไม่คาดคิด: ' + msg)
      }
    })
  }

  return (
    <div data-classroom-create-wizard className="w-full">
      <header className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {duplicateSourceId ? 'ตรวจสอบข้อมูลสำเนาห้องเรียน' : 'สร้างห้องเรียนใหม่'}
          </h1>
          <p className="text-xs text-muted-foreground">ขั้นตอน {currentStep + 1} จาก {STEPS.length}</p>
        </div>
        <div className="self-center sm:self-auto">
          <StepIndicator current={currentStep} onStepClick={handleStepClick} />
        </div>
      </header>

      <div className="py-4">
        {currentStep === 0 && (
          <Step0Content
            control={control}
            errors={errors}
            values={values}
            onClassroomTypeChange={(v) => setValue('classroomType', v)}
            onCoverChange={(id) => setValue('cover', id)}
            onIconChange={(key) => setValue('iconKey', key, { shouldDirty: true })}
            onCoverImageChange={(u) => setValue('coverImageUrl', u)}
            uploadCoverImage={actions?.uploadCoverImage}
            classroomTypeLocked={!!duplicateSourceId}
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

      <footer className="flex items-center justify-between border-t border-border pt-4">
        <div>
          {currentStep > 0 && (
            <Button type="button" variant="outline" onClick={handleBack} disabled={isPending}>
              <ChevronLeft className="mr-1 size-4" />
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
              <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isNextEnabled}
              className="min-w-40 bg-success text-success-foreground hover:bg-success/90 disabled:bg-success/40"
            >
              <Check className="mr-1.5 size-4" />
              {isPending
                ? 'กำลังสร้างห้องเรียน...'
                : duplicateSourceId ? 'ยืนยันสร้างสำเนา' : 'ยืนยันสร้างห้องเรียน'}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

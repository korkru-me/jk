'use client'

import { useState, useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, ChevronDown, Clock, Info } from 'lucide-react'
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
import { DEFAULT_CLASSROOM_ICON, classroomIconKey, isClassroomIconKey, type ClassroomIconKey } from '@/lib/classroom-icons'

// ─── Static Data ──────────────────────────────────────────────────────────────

// ─── Schema ───────────────────────────────────────────────────────────────────

const wizardSchema = z.object({
  classroomType:   z.enum(['subject', 'homeroom']),
  cover:           z.string(),
  iconKey:         z.custom<ClassroomIconKey>(isClassroomIconKey, 'กรุณาเลือกไอคอนจากตัวเลือกที่มี'),
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
  iconKey, cover, onIconChange, onCoverChange,
}: {
  iconKey: ClassroomIconKey
  cover: string
  onIconChange: (key: ClassroomIconKey) => void
  onCoverChange: (id: string) => void
}) {
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const selectedPreset = COVER_PRESETS.find(preset => preset.id === cover) ?? COVER_PRESETS[0]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ClassroomIconPicker value={iconKey} onValueChange={onIconChange} compact />

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

    </div>
  )
}

// ─── Classroom form ──────────────────────────────────────────────────────────

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

function ClassroomFormContent({
  control,
  errors,
  values,
  onClassroomTypeChange,
  onCoverChange,
  onIconChange,
  onToggleCapacity,
  classroomTypeLocked,
}: {
  control: ReturnType<typeof useForm<WizardData>>['control']
  errors: ReturnType<typeof useForm<WizardData>>['formState']['errors']
  values: WizardData
  onClassroomTypeChange: (v: ClassroomType) => void
  onCoverChange: (id: string) => void
  onIconChange: (key: ClassroomIconKey) => void
  onToggleCapacity: (v: boolean) => void
  classroomTypeLocked?: boolean
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">ข้อมูลห้องเรียน</h2>

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

      <CoverDesignSection
        iconKey={values.iconKey}
        cover={values.cover}
        onIconChange={onIconChange}
        onCoverChange={onCoverChange}
      />

      <div className="border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">การเข้าร่วมและระยะเวลา</h2>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">ประเภทการเข้าร่วม</Label>
        <Controller
          control={control}
          name="accessType"
          render={({ field }) => (
            <AccessTypePicker
              value={field.value}
              onChange={field.onChange}
              columns={2}
              compact
              includeClosed={false}
            />
          )}
        />
      </div>

      <Card padding="md" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p id="capacity-label" className="text-sm font-semibold text-foreground">จำกัดจำนวนที่นั่ง</p>
              <p className="text-xs text-muted-foreground">ปิดรับอัตโนมัติเมื่อครบจำนวน</p>
            </div>
            <ToggleSwitch checked={values.capacityEnabled} onChange={onToggleCapacity} aria-labelledby="capacity-label" />
          </div>
          {values.capacityEnabled && (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="max-cap" className="text-sm">จำนวนที่นั่งสูงสุด</Label>
                <Controller
                  control={control}
                  name="maxCapacity"
                  render={({ field }) => (
                    <Input {...field} id="max-cap" type="number" min={1} max={500} className="h-10 text-center font-semibold" placeholder="30" />
                  )}
                />
              </div>
              <span className="pb-2.5 text-sm text-muted-foreground">คน</span>
            </div>
          )}
        </div>

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

        {(values.startDate || values.endDate) && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning lg:col-span-3">
            <Clock className="mt-0.5 size-3.5 shrink-0" />
            <p>เมื่อถึงวันปิดคอร์ส ระบบจะเปลี่ยนเป็น <strong>Read-only</strong> — นักเรียนดูประวัติได้แต่ส่งคำตอบไม่ได้</p>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

/** The dev-only screen lab injects local mutations instead of touching Supabase. */
export interface CreateCourseWizardActions {
  createClassroom: typeof createClassroom
  duplicateClassroom: typeof duplicateClassroom
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
  const [isPending, startTransition] = useTransition()

  const initialAccessType = initialValues?.accessType === 'closed'
    ? DEFAULT_VALUES.accessType
    : initialValues?.accessType

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      ...DEFAULT_VALUES,
      ...initialValues,
      accessType: initialAccessType ?? DEFAULT_VALUES.accessType,
      iconKey: classroomIconKey(initialValues?.iconKey),
    },
    mode: 'onTouched',
  })

  const { control, watch, setValue, formState: { errors } } = form
  const values = watch()

  const canSubmit = values.name.trim().length > 0 && !isPending

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

  async function handleSubmit() {
    const valid = await form.trigger()
    if (!valid) return
    if (!validateEnrollment()) return
    const data = values

    // The description encoding is shared with the settings dialog — see
    // classroom-meta.ts.
    const description = composeDescription({
      description:     data.description,
      cover:           data.cover,
      coverImageUrl:   '',
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
      <header className="border-b border-border pb-3">
        <h1 className="text-lg font-bold text-foreground">
          {duplicateSourceId ? 'ตรวจสอบข้อมูลสำเนาห้องเรียน' : 'สร้างห้องเรียนใหม่'}
        </h1>
      </header>

      <div className="py-4">
        <ClassroomFormContent
          control={control}
          errors={errors}
          values={values}
          onClassroomTypeChange={(v) => setValue('classroomType', v)}
          onCoverChange={(id) => setValue('cover', id)}
          onIconChange={(key) => setValue('iconKey', key, { shouldDirty: true })}
          onToggleCapacity={(v) => setValue('capacityEnabled', v)}
          classroomTypeLocked={!!duplicateSourceId}
        />
      </div>

      <footer className="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          title={!canSubmit ? 'กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อน' : undefined}
          className="min-w-40 bg-success text-success-foreground hover:bg-success/90 disabled:bg-success/40"
        >
          <Check className="mr-1.5 size-4" />
          {isPending
            ? 'กำลังสร้างห้องเรียน...'
            : duplicateSourceId ? 'ยืนยันสร้างสำเนา' : 'ยืนยันสร้างห้องเรียน'}
        </Button>
      </footer>
    </div>
  )
}

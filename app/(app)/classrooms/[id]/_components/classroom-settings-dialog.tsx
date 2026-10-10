'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import type { DialogRootChangeEventDetails } from '@base-ui/react/dialog'
import {
  Settings, Users, CalendarDays, Clock, School, Home, Info, Palette,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSidebarCompact } from '@/components/layout/sidebar-display'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { updateClassroom } from '@/lib/actions/classrooms'
import type { Classroom } from '@/lib/types'
import {
  composeDescription, parseDescription, GRADE_SUGGESTIONS, getTermSuggestions,
  coverOf,
  type ClassroomMeta,
} from '@/app/(app)/classrooms/_components/classroom-meta'
import { AccessTypePicker, CreatableCombobox } from '@/app/(app)/classrooms/_components/classroom-meta-fields'
import { DeleteClassroomButton } from '@/components/classrooms/delete-classroom-button'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomIconPicker } from '@/components/classrooms/classroom-icon-picker'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { ClassroomCoverPatternPicker } from '@/components/classrooms/classroom-cover-pattern-picker'
import { ClassroomCoverThemePicker } from '@/components/classrooms/classroom-cover-theme-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function ClassroomSettingsDialog({
  classroom, onCover = false, placement = 'banner',
}: {
  classroom: Classroom
  /** True when the banner behind the trigger is a tinted cover rather than the
   *  dark default — the trigger then inherits the banner's colour instead of
   *  the light-on-dark tokens. */
  onCover?: boolean
  /** The contextual sidebar uses a quieter, full-width navigation treatment. */
  placement?: 'banner' | 'sidebar'
}) {
  const compact = useSidebarCompact() && placement === 'sidebar'
  const dialogContentRef = useRef<HTMLDivElement>(null)
  const savedMeta = useMemo(
    () => parseDescription(classroom.description),
    [classroom.description],
  )
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(classroom.name)
  const [meta, setMeta] = useState<ClassroomMeta>(() => savedMeta)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isHomeroom = classroom.classroom_type === 'homeroom'

  function set<K extends keyof ClassroomMeta>(key: K, value: ClassroomMeta[K]) {
    setMeta(prev => ({ ...prev, [key]: value }))
  }

  // Classrooms created before cover colours were persisted have none saved;
  // the preview stays on the neutral surface until a teacher picks one.
  const cover = coverOf(meta)
  const hasUnsavedChanges = name.trim() !== classroom.name.trim()
    || composeDescription(meta) !== composeDescription(savedMeta)

  function resetDraft() {
    setName(classroom.name)
    setMeta(savedMeta)
  }

  function requestClose(eventDetails?: DialogRootChangeEventDetails) {
    // A failed request must leave the draft available for another attempt.
    if (isPending) {
      eventDetails?.cancel()
      return
    }

    if (hasUnsavedChanges) {
      eventDetails?.cancel()
      setConfirmingDiscard(true)
      return
    }

    setOpen(false)
  }

  // Re-seed from the server copy on every open so a cancelled edit — or a
  // change made in another tab — never lingers into the next visit.
  function handleOpenChange(next: boolean, eventDetails: DialogRootChangeEventDetails) {
    if (next) {
      resetDraft()
      setConfirmingDiscard(false)
      setOpen(true)
      return
    }

    requestClose(eventDetails)
  }

  function discardChanges() {
    resetDraft()
    setOpen(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('กรุณากรอกชื่อห้องเรียน'); return }
    if (meta.capacityEnabled && (!meta.maxCapacity || Number(meta.maxCapacity) < 1)) {
      toast.error('กรุณาระบุจำนวนที่นั่งอย่างน้อย 1 คน'); return
    }
    if (meta.startDate && meta.endDate && meta.startDate > meta.endDate) {
      toast.error('วันปิดคอร์สต้องอยู่หลังวันเปิดคอร์ส'); return
    }
    startTransition(async () => {
      const res = await updateClassroom(classroom.id, {
        name: name.trim(),
        description: composeDescription(meta),
      })
      if ('error' in res) toast.error(res.error)
      else { toast.success('บันทึกการตั้งค่าแล้ว'); setOpen(false) }
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant={placement === 'sidebar' ? 'ghost' : 'outline'}
            aria-label="ตั้งค่าห้องเรียน"
            title={compact ? 'ตั้งค่าห้องเรียน' : undefined}
            className={cn(
              placement === 'sidebar'
                ? 'w-full justify-start transition-colors'
                : 'gap-1.5 bg-transparent',
              placement === 'banner' && (
                onCover
                  ? 'border-current text-current hover:bg-current/10 hover:text-current'
                  : 'border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground'
              ),
              compact && 'md:justify-center md:px-0',
            )}
          />
        }
      >
        <Settings data-icon="inline-start" />
        <span className={cn(compact && 'md:sr-only')}>ตั้งค่าห้องเรียน</span>
      </DialogTrigger>

      <DialogContent
        ref={dialogContentRef}
        initialFocus={() => {
          const content = dialogContentRef.current
          if (!content) return true

          // Focusing a field farther down used to reopen this long dialog in
          // the middle. Focus the popup itself and reset its own scroll area.
          content.scrollTop = 0
          return content
        }}
        data-classroom-settings-content
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>ตั้งค่าห้องเรียน</DialogTitle>
          <DialogDescription>
            แก้ไขได้ทุกอย่างที่กรอกตอนสร้างห้องเรียน ยกเว้นประเภทห้องเรียนและรหัสห้องเรียน
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-1">
          {/* ── Identity (read-only) ── */}
          <Card
            padding="sm"
            radius="md"
            data-classroom-settings-identity
            className="flex flex-wrap items-center gap-x-6 gap-y-2"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {isHomeroom
                  ? <Home className="size-4 text-muted-foreground" aria-hidden="true" />
                  : <School className="size-4 text-muted-foreground" aria-hidden="true" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ประเภทห้องเรียน</p>
                <p className="text-sm font-medium">{isHomeroom ? 'ห้อง Homeroom' : 'ห้องเรียน'}</p>
              </div>
            </div>
            <div className="sm:ml-auto">
              <p className="text-xs text-muted-foreground">รหัสห้องเรียน</p>
              <p className="font-mono font-bold tracking-[0.2em]">{classroom.class_code}</p>
            </div>
            <p className="flex basis-full items-start gap-1.5 text-xs leading-4 text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              สองอย่างนี้เปลี่ยนไม่ได้ — นักเรียนใช้รหัสเข้าร่วมอยู่ และการเปลี่ยนประเภทจะทำให้งานที่มอบหมายไว้ใช้ไม่ได้
            </p>
          </Card>

          {/* ── Cover ── */}
          <div data-classroom-settings-cover className="flex flex-col gap-2">
            <Label className="flex items-center gap-1.5">
              <Palette className="size-3.5 text-muted-foreground" aria-hidden="true" />
              ปกห้องเรียน
            </Label>
            <div
              className={cn(
                'relative flex h-14 items-center overflow-hidden rounded-xl border px-4 transition-colors',
                cover ? `${cover.surface} ${cover.text}` : 'bg-muted border-border text-muted-foreground',
              )}
            >
              <ClassroomCoverPattern
                patternKey={meta.coverPattern}
                placement="end"
                className="pointer-events-none absolute inset-0 size-full opacity-55"
              />
              <ClassroomIcon iconKey={meta.iconKey} className="relative z-10 mr-2.5 size-6 shrink-0" />
              <p className="relative z-10 truncate text-base font-bold">{name || 'ชื่อห้องเรียน'}</p>
            </div>
            <div className="grid items-start gap-2 sm:grid-cols-2">
              <ClassroomCoverPatternPicker
                value={meta.coverPattern}
                onValueChange={key => set('coverPattern', key)}
                disabled={isPending}
                compact
                previewClassName={cover ? `${cover.surface} ${cover.text}` : undefined}
              />
              <ClassroomCoverThemePicker
                value={meta.cover}
                onValueChange={value => set('cover', value)}
                disabled={isPending}
                allowAuto
              />
            </div>

            <ClassroomIconPicker
              value={meta.iconKey}
              onValueChange={key => set('iconKey', key)}
              disabled={isPending}
              compact
            />
          </div>

          {/* ── Basics ── */}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">ชื่อห้องเรียน <span className="text-destructive">*</span></Label>
              <Input
                id="settings-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={isHomeroom ? 'เช่น ที่ปรึกษา ม.4/1' : 'เช่น ฟิสิกส์ ม.4/1'}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-desc">
                คำอธิบายรายวิชา
                <span className="text-xs text-muted-foreground font-normal ml-1">(ไม่บังคับ)</span>
              </Label>
              <Textarea
                id="settings-desc"
                value={meta.description}
                onChange={e => set('description', e.target.value)}
                placeholder="อธิบายเนื้อหาที่จะเรียน เป้าหมาย หรือรายละเอียดที่เป็นประโยชน์..."
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>ระดับชั้น</Label>
                <CreatableCombobox
                  value={meta.gradeLevel}
                  onChange={v => set('gradeLevel', v)}
                  options={GRADE_SUGGESTIONS}
                  placeholder="เช่น ม.4/1 หรือพิมพ์เองได้"
                />
              </div>
              <div className="space-y-1.5">
                <Label>ปีการศึกษา / ภาคเรียน</Label>
                <CreatableCombobox
                  value={meta.academicTerm}
                  onChange={v => set('academicTerm', v)}
                  options={getTermSuggestions()}
                  placeholder="เช่น 1/2569"
                />
              </div>
            </div>

          </div>

          {/* ── Enrollment ── */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">ประเภทการเข้าร่วม</Label>
            <AccessTypePicker value={meta.accessType} onChange={v => set('accessType', v)} compact />
          </div>

          <Card padding="lg" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <p id="settings-capacity-label" className="font-medium text-sm text-foreground">จำกัดจำนวนที่นั่ง</p>
                <ToggleSwitch
                  checked={meta.capacityEnabled}
                  onChange={v => set('capacityEnabled', v)}
                  aria-labelledby="settings-capacity-label"
                />
              </div>
            </div>
            {meta.capacityEnabled && (
              <div className="pt-1 space-y-1.5 border-t border-border">
                <Label htmlFor="settings-cap" className="text-sm pt-3 block">จำนวนที่นั่งสูงสุด</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="settings-cap"
                    type="number"
                    min={1}
                    max={500}
                    value={meta.maxCapacity}
                    onChange={e => set('maxCapacity', e.target.value)}
                    className="h-10 w-28 text-center text-base font-semibold"
                    placeholder="30"
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
                <Label htmlFor="settings-start" className="text-sm">วันเปิดคอร์ส</Label>
                <Input
                  id="settings-start"
                  type="date"
                  value={meta.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-end" className="text-sm">วันปิดคอร์ส</Label>
                <Input
                  id="settings-end"
                  type="date"
                  value={meta.endDate}
                  onChange={e => set('endDate', e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            {(meta.startDate || meta.endDate) && (
              <div className="flex items-start gap-2.5 text-xs text-warning bg-warning/10 rounded-xl px-3.5 py-3 border border-warning/20">
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p>เมื่อถึงวันปิดคอร์ส ระบบจะเปลี่ยนเป็น <strong>Read-only</strong> — นักเรียนดูประวัติได้แต่ส่งคำตอบไม่ได้</p>
              </div>
            )}
          </Card>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </Button>
            <Button type="button" variant="outline" onClick={() => requestClose()} disabled={isPending}>
              ยกเลิก
            </Button>
          </div>
        </form>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-destructive">พื้นที่อันตราย</p>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            ย้ายห้องเรียนไปถังขยะพร้อมข้อมูลภายในทั้งหมด และกู้คืนได้ภายใน 30 วันก่อนลบถาวร
          </p>
          <DeleteClassroomButton id={classroom.id} />
        </div>
      </DialogContent>
      </Dialog>

      {/* A sibling root keeps the confirmation's own backdrop dismissible;
          Base UI intentionally suppresses backdrops for nested dialog roots. */}
      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="ปิดโดยไม่บันทึกการตั้งค่า?"
        description="คุณมีการแก้ไขที่ยังไม่ได้บันทึก หากปิดตอนนี้ สิ่งที่แก้ไขจะหายไป ส่วนการตั้งค่าห้องเรียนที่บันทึกไว้เดิมจะยังอยู่"
        confirmLabel="ปิดโดยไม่บันทึก"
        cancelLabel="กลับไปตั้งค่าต่อ"
        variant="destructive"
        onConfirm={discardChanges}
        finalFocus={dialogContentRef}
      />
    </>
  )
}

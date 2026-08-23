'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, Archive, Users, CalendarDays, Clock, Tag, BookOpen, Home, Info, Palette, Check, Ban,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { updateClassroom, archiveClassroom } from '@/lib/actions/classrooms'
import type { Classroom } from '@/lib/types'
import {
  composeDescription, parseDescription, GRADE_SUGGESTIONS, getTermSuggestions,
  COVER_PRESETS, coverOf,
  type ClassroomMeta,
} from '@/app/(app)/classrooms/_components/classroom-meta'
import {
  AccessTypePicker, TagInput, CreatableCombobox,
} from '@/app/(app)/classrooms/_components/classroom-meta-fields'

export function ClassroomSettingsDialog({
  classroom, onCover = false,
}: {
  classroom: Classroom
  /** True when the banner behind the trigger is a tinted cover rather than the
   *  dark default — the trigger then inherits the banner's colour instead of
   *  the light-on-dark tokens. */
  onCover?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(classroom.name)
  const [meta, setMeta] = useState<ClassroomMeta>(() => parseDescription(classroom.description))
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()

  const isHomeroom = classroom.classroom_type === 'homeroom'

  function set<K extends keyof ClassroomMeta>(key: K, value: ClassroomMeta[K]) {
    setMeta(prev => ({ ...prev, [key]: value }))
  }

  // Classrooms created before covers were persisted have none saved; the
  // preview stays on the neutral surface until a teacher picks one.
  const cover = coverOf(meta)

  function clearCover() {
    setMeta(prev => ({ ...prev, cover: '' }))
  }

  // Re-seed from the server copy on every open so a cancelled edit — or a
  // change made in another tab — never lingers into the next visit.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(classroom.name)
      setMeta(parseDescription(classroom.description))
    }
    setOpen(next)
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
      if (res?.error) toast.error(res.error)
      else { toast.success('บันทึกการตั้งค่าแล้ว'); setOpen(false) }
    })
  }

  async function handleArchive() {
    const ok = await confirm({
      title: 'เก็บห้องเรียนนี้เข้าคลัง?',
      description: 'ห้องเรียนจะหายจากรายการหลัก แต่กู้คืนได้ภายหลังจากหน้าถังขยะ',
      confirmLabel: 'เก็บเข้าคลัง',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await archiveClassroom(classroom.id)
      if (res?.error) toast.error(res.error)
      else { toast.success('เก็บห้องเรียนเข้าคลังแล้ว'); setOpen(false); router.push('/classrooms') }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className={cn(
              'gap-1.5 bg-transparent',
              onCover
                ? 'border-current text-current hover:bg-current/10 hover:text-current'
                : 'border-surface-inverse-border text-surface-inverse-foreground hover:bg-surface-inverse-foreground/10 hover:text-surface-inverse-foreground',
            )}
          />
        }
      >
        <Settings className="w-3.5 h-3.5" /> ตั้งค่าห้องเรียน
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ตั้งค่าห้องเรียน</DialogTitle>
          <DialogDescription>
            แก้ไขได้ทุกอย่างที่กรอกตอนสร้างห้องเรียน ยกเว้นประเภทห้องเรียนและรหัสห้องเรียน
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-7 pt-1">
          {/* ── Identity (read-only) ── */}
          <Card padding="lg" className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                {isHomeroom
                  ? <Home className="w-4 h-4 text-muted-foreground" />
                  : <BookOpen className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ประเภทห้องเรียน</p>
                <p className="text-sm font-medium">{isHomeroom ? 'ห้อง Homeroom' : 'ห้องเรียนวิชา'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">รหัสห้องเรียน</p>
              <p className="font-mono font-bold tracking-[0.2em]">{classroom.class_code}</p>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground basis-full">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              สองอย่างนี้เปลี่ยนไม่ได้ — นักเรียนใช้รหัสเข้าร่วมอยู่ และการเปลี่ยนประเภทจะทำให้งานที่มอบหมายไว้ใช้ไม่ได้
            </p>
          </Card>

          {/* ── Cover ── */}
          <div className="space-y-2.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              สีหน้าปก
              <span className="text-xs text-muted-foreground font-normal">
                (เลือกวงแรกเพื่อใช้สีอัตโนมัติ)
              </span>
            </Label>
            <div
              className={cn(
                'h-20 rounded-2xl border-2 flex items-center px-5 transition-colors',
                cover ? `${cover.surface} ${cover.text}` : 'bg-muted border-border text-muted-foreground',
              )}
            >
              <p className="font-bold text-lg truncate">{name || 'ชื่อห้องเรียน'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <IconButton
                type="button"
                onClick={clearCover}
                label="ใช้สีอัตโนมัติ"
                aria-pressed={!cover}
                className={cn(
                  'w-9 h-9 rounded-full bg-muted text-muted-foreground hover:bg-muted transition-all',
                  !cover ? 'ring-2 ring-offset-2 ring-ring scale-110' : 'opacity-70 hover:opacity-100',
                )}
              >
                <Ban className="w-4 h-4" />
              </IconButton>
              {COVER_PRESETS.map(preset => {
                const isSelected = meta.cover === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => set('cover', preset.id)}
                    title={preset.label}
                    aria-label={preset.label}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                      preset.solid,
                      isSelected ? 'ring-2 ring-offset-2 ring-ring scale-110' : 'opacity-70 hover:opacity-100',
                    )}
                  >
                    {isSelected && <Check className="w-4 h-4 text-background" />}
                  </button>
                )
              })}
            </div>
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
                autoFocus
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

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                แท็กรายวิชา
                <span className="text-xs text-muted-foreground font-normal">(ไม่บังคับ)</span>
              </Label>
              <TagInput tags={meta.tags} onChange={t => set('tags', t)} />
            </div>
          </div>

          {/* ── Enrollment ── */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">ประเภทการเข้าร่วม</Label>
            <AccessTypePicker value={meta.accessType} onChange={v => set('accessType', v)} />
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
              <ToggleSwitch checked={meta.capacityEnabled} onChange={v => set('capacityEnabled', v)} />
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              ยกเลิก
            </Button>
          </div>
        </form>

        <div className={cn('border-t border-border pt-4')}>
          <p className="text-sm font-medium">เก็บเข้าคลัง</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            ซ่อนห้องเรียนจากรายการหลักโดยไม่ลบข้อมูล กู้คืนได้จากหน้าคลังห้องเรียน
          </p>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleArchive} disabled={isPending}>
            <Archive className="w-3.5 h-3.5" /> เก็บห้องเรียนเข้าคลัง
          </Button>
        </div>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  )
}

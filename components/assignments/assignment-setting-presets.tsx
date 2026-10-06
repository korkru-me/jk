'use client'

import { createContext, useContext, useId, useRef, useState, useTransition, type ReactNode } from 'react'
import { Bookmark, ChevronDown, Pencil, RotateCcw, Save, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  assignmentPresetDefaults, assignmentPresetSettingsSchema,
  type AssignmentPresetActionResult, type AssignmentPresetBootstrap,
  type AssignmentPresetSettings, type AssignmentSettingPreset,
} from '@/lib/assignment-setting-presets'
import {
  saveAssignmentSettingPreset, renameAssignmentSettingPreset,
  deleteAssignmentSettingPreset, setDefaultAssignmentSettingPreset,
  loadAssignmentSettingPresets,
} from '@/lib/actions/assignment-setting-presets'
import type { AssignmentType } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

export interface AssignmentPresetActions {
  save: typeof saveAssignmentSettingPreset
  rename: typeof renameAssignmentSettingPreset
  delete: typeof deleteAssignmentSettingPreset
  setDefault: typeof setDefaultAssignmentSettingPreset
  load: typeof loadAssignmentSettingPresets
}

const defaultActions: AssignmentPresetActions = {
  save: saveAssignmentSettingPreset,
  rename: renameAssignmentSettingPreset,
  delete: deleteAssignmentSettingPreset,
  setDefault: setDefaultAssignmentSettingPreset,
  load: loadAssignmentSettingPresets,
}

const SETTING_LABELS: Record<keyof AssignmentPresetSettings, string> = {
  duration_minutes: 'เวลาทำ (นาที)', shuffle_questions: 'สลับลำดับโจทย์',
  shuffle_options: 'สลับตัวเลือก', shared_random_values: 'ตัวเลขชุดเดียวกัน',
  show_results: 'การแสดงผลลัพธ์', show_solutions: 'แสดงเฉลยวิธีทำ',
  max_attempts: 'จำนวนครั้งที่ทำได้', score_strategy: 'วิธีเลือกคะแนน',
  retry_scope: 'โจทย์ในรอบใหม่', questions_per_page: 'จำนวนข้อต่อหนึ่งหน้า',
  instant_check: 'ตรวจคำตอบทีละข้อ', instant_check_answer_key: 'แสดงคำตอบหลังตรวจ',
  calculator_enabled: 'เครื่องคิดเลข', scratchpad_enabled: 'กระดาษทด',
  proctoring_enabled: 'ตรวจจับการออกนอกหน้าสอบ', fullscreen_required: 'เต็มหน้าจอ',
  block_clipboard: 'ป้องกันคัดลอกและวาง', exam_watermark_enabled: 'ลายน้ำข้อสอบ',
  secure_browser_mode: 'เบราว์เซอร์ที่ใช้สอบ', android_exam_mode: 'การสอบบน Android',
  completion_rule: 'เงื่อนไขจบงาน', streak_target: 'จำนวนข้อถูกติดต่อกัน',
  streak_question_cap: 'ขีดจำกัดจำนวนข้อของการฝึก', streak_recycle_pool: 'วนโจทย์ในคลัง',
  passing_type: 'ชนิดเกณฑ์ผ่าน', passing_value: 'เกณฑ์ผ่าน',
  random_question_count: 'จำนวนโจทย์ที่สุ่มให้', display_max_score: 'คะแนนเต็มที่แสดงผล',
  show_question_sections: 'แสดงแฟ้มย่อย', require_work_image: 'แนบรูปแสดงวิธีทำ',
}

const VALUE_LABELS: Record<string, string> = {
  immediate: 'ทันทีหลังส่ง', after_due: 'หลังพ้นกำหนดส่ง', score_only: 'เฉพาะคะแนน',
  never: 'ไม่แสดง', best: 'ครั้งที่ดีที่สุด', average: 'เฉลี่ยทุกครั้ง', latest: 'ครั้งล่าสุด',
  all: 'ทุกข้อ', wrong_only: 'เฉพาะข้อที่ผิด', browser: 'เบราว์เซอร์ปกติ',
  seb_required: 'Safe Exam Browser', blocked: 'ไม่อนุญาต', monitored: 'อนุญาตพร้อมตรวจจับ',
  fixed: 'ทำครบ / ผ่านเกณฑ์', streak: 'ถูกติดต่อกัน', score: 'คะแนน', percent: 'เปอร์เซ็นต์',
}

function valueLabel(value: AssignmentPresetSettings[keyof AssignmentPresetSettings]) {
  if (value === null) return 'ไม่กำหนด'
  if (typeof value === 'boolean') return value ? 'เปิด' : 'ปิด'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'ค่าที่กรอกยังไม่ถูกต้อง'
  return VALUE_LABELS[value] ?? value
}

function changedKeys(a: AssignmentPresetSettings, b: AssignmentPresetSettings) {
  return (Object.keys(SETTING_LABELS) as (keyof AssignmentPresetSettings)[])
    .filter(key => !Object.is(a[key], b[key]))
}

interface Props {
  type: AssignmentType
  bootstrap?: AssignmentPresetBootstrap
  settings: AssignmentPresetSettings
  onApply: (settings: AssignmentPresetSettings) => void
  isCopy: boolean
  disabled?: boolean
  actions?: AssignmentPresetActions
  children: ReactNode
}

const PresetPartsContext = createContext<{ recall: ReactNode; save: ReactNode } | null>(null)

export function AssignmentSettingPresetsRecall() {
  const parts = useContext(PresetPartsContext)
  if (!parts) throw new Error('Assignment settings require their provider')
  return parts.recall
}

export function AssignmentSettingPresetsSave() {
  const parts = useContext(PresetPartsContext)
  if (!parts) throw new Error('Assignment settings require their provider')
  return parts.save
}

/** Preset data and mutations accept settings only, never work content or secrets.
 *  Keep this controller mounted while its recall/save views change wizard steps. */
export function AssignmentSettingPresetsProvider({
  type, bootstrap, settings, onApply, isCopy, disabled = false, actions = defaultActions, children,
}: Props) {
  const id = useId()
  const [data, setData] = useState<AssignmentPresetBootstrap>(bootstrap ?? {
    presets: [], defaultPresetId: null, error: 'ยังโหลดชุดการตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง',
  })
  const [selectedId, setSelectedId] = useState<string | null>(
    isCopy ? null : bootstrap?.defaultPresetId ?? null,
  )
  // A save destination is not a recalled source: choosing it must not apply settings.
  const [saveTargetId, setSaveTargetId] = useState<string | null>(null)
  const [currentOrigin, setCurrentOrigin] = useState<'copy' | 'current' | null>(isCopy ? 'copy' : null)
  const [baseline, setBaseline] = useState(settings)
  const [error, setError] = useState<string | null>(data.error)
  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<'new' | 'rename' | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const busyRef = useRef(false)
  const [confirm, confirmation] = useConfirm()
  const selected = data.presets.find(preset => preset.id === selectedId) ?? null
  const saveTarget = data.presets.find(preset => preset.id === saveTargetId) ?? null
  const saveTargetDirty = saveTarget !== null && changedKeys(settings, saveTarget.settings).length > 0
  const dirty = changedKeys(settings, baseline).length > 0
  const busy = disabled || isPending
  const unavailable = data.error !== null || needsReload
  const typeLabel = type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'
  const recalledSettingLabel = currentOrigin === 'copy'
    ? 'ค่าจากงานต้นฉบับ'
    : currentOrigin === 'current'
      ? 'ค่าของงานนี้'
      : selected
        ? `${selected.name}${data.defaultPresetId === selected.id ? ' · ค่าเริ่มต้น' : ''}`
        : `ค่าระบบ${data.defaultPresetId === null ? ' · ค่าเริ่มต้น' : ''}`

  function run(
    operation: () => Promise<AssignmentPresetActionResult>,
    successMessage: string,
    after?: (next: AssignmentPresetBootstrap) => void,
    isReload = false,
  ) {
    if (busy || busyRef.current) return
    busyRef.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await operation()
        if ('error' in result) { setError(result.error); setNeedsReload(true); return }
        if (result.data.error) { setData(result.data); setError(result.data.error); setNeedsReload(true); return }
        setData(result.data)
        if (isReload) setNeedsReload(false)
        after?.(result.data)
        if (successMessage) toast.success(successMessage)
      } catch {
        setError('เชื่อมต่อไม่สำเร็จ ผลการบันทึกยังไม่ยืนยัน ข้อมูลที่กรอกยังอยู่ กรุณาโหลดรายการใหม่ก่อนลองบันทึกซ้ำ')
        setNeedsReload(true)
      } finally {
        busyRef.current = false
      }
    })
  }

  async function applySelection(nextId: string | null) {
    if (busy || unavailable) return
    const preset = nextId ? data.presets.find(item => item.id === nextId) : null
    if (nextId && !preset) { setError('ไม่พบชุดนี้ กรุณาโหลดรายการใหม่'); return }
    const next = preset?.settings ?? assignmentPresetDefaults(type)
    const keys = changedKeys(settings, next)
    if (dirty && keys.length > 0) {
      const accepted = await confirm({
        title: `ใช้${preset ? `ชุด “${preset.name}”` : 'ค่าระบบ'}แทนการตั้งค่าปัจจุบัน?`,
        description: (
          <div className="flex flex-col gap-3">
            <p>เฉพาะการตั้งค่าด้านล่างจะเปลี่ยน ชื่องาน โจทย์ คะแนนรายข้อ ห้องเรียน กำหนดการ และรหัสผ่านยังอยู่เดิม ชุดที่บันทึกไว้ไม่เปลี่ยน</p>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {keys.map(key => <li key={key}>{SETTING_LABELS[key]}: {valueLabel(settings[key])} → {valueLabel(next[key])}</li>)}
            </ul>
          </div>
        ),
        confirmLabel: 'ใช้การตั้งค่านี้',
      })
      if (!accepted) return
    }
    onApply(next)
    setSelectedId(nextId)
    setSaveTargetId(null)
    setCurrentOrigin(null)
    setBaseline(next)
    setError(null)
  }

  function validatedSettings() {
    const parsed = assignmentPresetSettingsSchema.safeParse(settings)
    if (!parsed.success) {
      setError('ยังบันทึกชุดไม่ได้ กรุณาตรวจเวลา จำนวนข้อ จำนวนครั้ง และเกณฑ์ผ่านให้ถูกต้องก่อน')
      return null
    }
    return parsed.data
  }

  function submitName() {
    if (busy || unavailable) return
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 60) { setNameError('กรอกชื่อชุด 1–60 ตัวอักษร'); return }
    if (data.presets.some(preset => preset.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase()
      && (dialog === 'new' || preset.id !== saveTarget?.id))) {
      setNameError('มีชื่อชุดนี้แล้ว กรุณาใช้ชื่ออื่น')
      return
    }
    if (dialog === 'rename') {
      if (!saveTarget) { setNameError('ไม่พบชุดนี้ กรุณาปิดหน้าต่างและโหลดรายการใหม่'); return }
      run(() => actions.rename({ type, id: saveTarget.id, expectedRevision: saveTarget.revision, name: cleanName }),
        'เปลี่ยนชื่อชุดแล้ว', () => setDialog(null))
      return
    }
    const snapshot = validatedSettings()
    if (!snapshot || data.presets.length >= 3) return
    run(() => actions.save({ type, name: cleanName, settings: snapshot }), 'บันทึกชุดการตั้งค่าแล้ว', next => {
      const created = next.presets.find(preset => !data.presets.some(old => old.id === preset.id))
      setSelectedId(created?.id ?? null)
      setSaveTargetId(created?.id ?? null)
      setCurrentOrigin(null)
      setBaseline(snapshot)
      setDialog(null)
    })
  }

  async function updateSelected(preset: AssignmentSettingPreset) {
    const snapshot = validatedSettings()
    if (!snapshot) return
    if (!(await confirm({
      title: `อัปเดตชุด “${preset.name}”?`,
      description: 'แทนการตั้งค่าในชุดนี้ด้วยค่าที่กรอกอยู่ งานเดิมที่สร้างไปแล้ว โจทย์ และคะแนนนักเรียนไม่เปลี่ยน',
      confirmLabel: 'อัปเดตชุด',
    }))) return
    run(() => actions.save({ type, id: preset.id, expectedRevision: preset.revision,
      name: preset.name, settings: snapshot }), 'อัปเดตชุดการตั้งค่าแล้ว', () => {
        setSelectedId(preset.id)
        setCurrentOrigin(null)
        setBaseline(snapshot)
      })
  }

  async function removeSelected(preset: AssignmentSettingPreset) {
    if (!(await confirm({
      title: `ลบชุด “${preset.name}”?`,
      description: `ชุดนี้จะถูกลบ${data.defaultPresetId === preset.id ? ' และงานใหม่จะกลับไปใช้ค่าระบบเป็นค่าเริ่มต้น' : ''} งานเดิมและค่าที่กรอกในงานนี้ยังอยู่ ไม่ลบโจทย์หรือคะแนนนักเรียน`,
      confirmLabel: 'ลบชุดการตั้งค่า', variant: 'destructive',
    }))) return
    run(() => actions.delete({ type, id: preset.id, expectedRevision: preset.revision }), 'ลบชุดการตั้งค่าแล้ว', () => {
      setSaveTargetId(null)
      if (selectedId === preset.id) { setSelectedId(null); setCurrentOrigin('current') }
    })
  }

  function reload() {
    run(() => actions.load(type), 'โหลดรายการแล้ว', next => {
      // Refresh metadata only, never replace the current assignment draft.
      if (selectedId && !next.presets.some(preset => preset.id === selectedId)) { setSelectedId(null); setCurrentOrigin('current') }
      if (saveTargetId && !next.presets.some(preset => preset.id === saveTargetId)) setSaveTargetId(null)
    }, true)
  }

  const status = <>
    {isPending && <p role="status" className="text-sm text-muted-foreground">กำลังบันทึกหรือโหลดชุดการตั้งค่า…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>

  const recall = (
    <Card padding="lg" className="min-w-0" aria-busy={isPending}>
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 text-left">
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="flex items-center gap-2 font-semibold">
              <Bookmark className="size-4 shrink-0" aria-hidden="true" />
              เรียกใช้การตั้งค่าเดิม · {typeLabel}
            </span>
            <span data-assignment-description className="text-sm font-normal text-muted-foreground">{recalledSettingLabel}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <div className="flex flex-col gap-4 pt-4">
            <FieldGroup className="gap-3">
              <Field data-disabled={busy || unavailable}>
                <FieldLabel htmlFor={`${id}-selection`}>ใช้การตั้งค่า</FieldLabel>
                <NativeSelect id={`${id}-selection`} value={currentOrigin ? '__current' : selectedId ?? '__system'}
                  disabled={busy || unavailable} onChange={event => void applySelection(event.target.value === '__system' ? null : event.target.value)}>
                  {currentOrigin && <option value="__current" disabled>{currentOrigin === 'copy' ? 'ค่าจากงานต้นฉบับ' : 'ค่าของงานนี้'}</option>}
                  <option value="__system">ค่าระบบ{data.defaultPresetId === null ? ' · ค่าเริ่มต้น' : ''}</option>
                  {data.presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}{data.defaultPresetId === preset.id ? ' · ค่าเริ่มต้น' : ''}</option>)}
                </NativeSelect>
                <FieldDescription>เลือกชุดส่วนตัวมาใช้กับงานนี้ หรือเริ่มจากค่าระบบ บันทึกการตั้งค่าไว้ใช้ครั้งต่อไปได้ในขั้นสุดท้าย</FieldDescription>
              </Field>
            </FieldGroup>
            {currentOrigin === 'copy' && <p data-assignment-description className="text-sm text-muted-foreground">สำเนาใช้การตั้งค่าจากงานต้นฉบับ ไม่โหลดชุดเริ่มต้นทับ</p>}
            {dirty && <p data-assignment-description className="text-sm text-muted-foreground" role="status">ปรับการตั้งค่าสำหรับงานนี้แล้ว · ชุดที่บันทึกไว้ยังไม่เปลี่ยน</p>}
            <div className="flex flex-wrap gap-2">
              {selected && <Button type="button" variant="outline" size="sm" disabled={busy || unavailable} onClick={() => void applySelection(selected.id)}><RotateCcw data-icon="inline-start" />เรียกชุดนี้อีกครั้ง</Button>}
              <Button type="button" variant="outline" size="sm" disabled={busy || unavailable} onClick={() => void applySelection(null)}><RotateCcw data-icon="inline-start" />ใช้ค่าระบบ</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reload}>โหลดรายการใหม่</Button>
            </div>
            {status}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )

  const save = (
    <Card padding="lg" className="flex min-w-0 flex-col gap-4" aria-busy={isPending}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Bookmark className="size-4" aria-hidden="true" />บันทึกการตั้งค่าไว้ใช้ครั้งต่อไปไหม?</h2>
        <div className="flex items-center gap-2"><Badge variant="secondary">ไม่บังคับ</Badge>{!unavailable && <Badge variant="secondary">{data.presets.length}/3 ชุด</Badge>}</div>
      </div>
      <p data-assignment-description className="text-sm text-muted-foreground">เก็บเฉพาะการตั้งค่า{typeLabel}ในบัญชีคุณ ไม่เก็บชื่องาน โจทย์ คะแนนรายข้อ ผู้รับ วันส่ง หรือรหัสผ่าน ข้ามส่วนนี้แล้วสร้างงานได้ตามปกติ</p>
      <FieldGroup className="gap-3">
        <Field data-disabled={busy || unavailable}>
          <FieldLabel htmlFor={`${id}-save-target`}>บันทึกการตั้งค่าเป็น</FieldLabel>
          <NativeSelect id={`${id}-save-target`} value={saveTargetId ?? '__new'} disabled={busy || unavailable}
            onChange={event => { setSaveTargetId(event.target.value === '__new' ? null : event.target.value); setError(null) }}>
            <option value="__new">ชุดใหม่</option>
            {data.presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}{data.defaultPresetId === preset.id ? ' · ค่าเริ่มต้น' : ''}</option>)}
          </NativeSelect>
          <FieldDescription>เลือกชุดเดิมเพื่ออัปเดตด้วยค่าของงานนี้ การเลือกตรงนี้ไม่เรียกค่าเก่ามาทับฟอร์ม และยังไม่บันทึกจนกดปุ่ม</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        {saveTarget ? <>
          <Button type="button" size="sm" disabled={busy || unavailable || !saveTargetDirty} onClick={() => void updateSelected(saveTarget)}><Save data-icon="inline-start" />อัปเดตชุดนี้</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || unavailable} onClick={() => { setName(saveTarget.name); setNameError(null); setDialog('rename') }}><Pencil data-icon="inline-start" />เปลี่ยนชื่อ</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || unavailable || data.defaultPresetId === saveTarget.id} onClick={() => run(() => actions.setDefault({ type, id: saveTarget.id, expectedRevision: saveTarget.revision }), 'ตั้งเป็นค่าเริ่มต้นสำหรับงานใหม่แล้ว')}><Star data-icon="inline-start" />ตั้งเป็นค่าเริ่มต้น</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || unavailable} onClick={() => void removeSelected(saveTarget)}><Trash2 data-icon="inline-start" />ลบชุด</Button>
        </> : <Button type="button" size="sm" disabled={busy || unavailable || data.presets.length >= 3} onClick={() => { setName(''); setNameError(null); setDialog('new') }}><Save data-icon="inline-start" />บันทึกเป็นชุดใหม่</Button>}
        {data.defaultPresetId !== null && <Button type="button" variant="outline" size="sm" disabled={busy || unavailable} onClick={() => run(() => actions.setDefault({ type, id: null }), 'ใช้ค่าระบบเป็นค่าเริ่มต้นสำหรับงานใหม่แล้ว')}><Star data-icon="inline-start" />ตั้งค่าระบบเป็นค่าเริ่มต้น</Button>}
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reload}>โหลดรายการใหม่</Button>
      </div>
      {!unavailable && data.presets.length >= 3 && <p data-assignment-description className="text-sm text-muted-foreground">ครบ 3 ชุดแล้ว เลือกอัปเดตชุดเดิมหรือลบชุดที่ไม่ใช้ก่อนบันทึกชุดใหม่ ระบบไม่ลบให้เอง</p>}
      {status}
    </Card>
  )

  return (
    <PresetPartsContext.Provider value={{ recall, save }}>
      {children}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open && !isPending) setDialog(null) }}>
        <DialogContent showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>{dialog === 'rename' ? 'เปลี่ยนชื่อชุดการตั้งค่า' : `บันทึกชุดการตั้งค่า${typeLabel}`}</DialogTitle>
            <DialogDescription className="sr-only">เก็บเฉพาะการตั้งค่า ไม่ได้บันทึกหรือมอบหมายงานนี้</DialogDescription>
          </DialogHeader>
          <form onSubmit={event => { event.preventDefault(); submitName() }} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={nameError !== null} data-disabled={isPending}>
                <FieldLabel htmlFor={`${id}-name`}>ชื่อชุด</FieldLabel>
                <Input id={`${id}-name`} value={name} maxLength={60} autoFocus disabled={isPending} aria-invalid={nameError !== null}
                  onChange={event => { setName(event.target.value); setNameError(null) }} placeholder="เช่น ฝึกทีละข้อ หรือสอบกลางภาค" />
                {nameError && <p role="alert" className="text-sm text-destructive">{nameError}</p>}
              </Field>
            </FieldGroup>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {needsReload && <Button type="button" variant="outline" disabled={isPending} onClick={reload}>โหลดรายการก่อนลองใหม่</Button>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setDialog(null)}>ยกเลิก</Button>
              <Button type="submit" disabled={isPending || needsReload || !name.trim()}>{isPending ? 'กำลังบันทึก…' : 'บันทึกชุด'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirmation}
    </PresetPartsContext.Provider>
  )
}

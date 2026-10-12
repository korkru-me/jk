'use client'

import { createContext, useContext, useId, useRef, useState, useTransition, type ReactNode } from 'react'
import type { DialogRootChangeEventDetails } from '@base-ui/react/dialog'
import { BookmarkPlus, Check, ChevronDown, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  assignmentPresetDefaults, assignmentPresetSettingsSchema, ASSIGNMENT_PRESET_LIMIT,
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
import { ConfirmDialog, useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDismissOnOutsideClick } from '@/hooks/use-dismiss-on-outside-click'

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
  instant_check: 'ตรวจคำตอบทีละข้อ', instant_check_answer_key: 'แสดงเฉลยหลังจากกดตรวจคำตอบ',
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
  const [saveSlot, setSaveSlot] = useState<number | null>(null)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [currentOrigin, setCurrentOrigin] = useState<'copy' | 'current' | null>(isCopy ? 'copy' : null)
  const [baseline, setBaseline] = useState(settings)
  const [error, setError] = useState<string | null>(data.error)
  const [isPending, startTransition] = useTransition()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [recallOpen, setRecallOpen] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const busyRef = useRef(false)
  const dialogContentRef = useRef<HTMLDivElement>(null)
  const recallRef = useRef<HTMLDivElement>(null)
  const saveTriggerRef = useRef<HTMLButtonElement>(null)
  const [confirm, confirmation] = useConfirm()
  const selected = data.presets.find(preset => preset.id === selectedId) ?? null
  const saveTarget = data.presets.find(preset => preset.slot === saveSlot) ?? null
  const nextAvailableSlot = Array.from({ length: ASSIGNMENT_PRESET_LIMIT }, (_, index) => index + 1)
    .find(slot => !data.presets.some(preset => preset.slot === slot)) ?? null
  const saveTargetDirty = saveTarget !== null && changedKeys(settings, saveTarget.settings).length > 0
  const saveTargetNameDirty = saveTarget !== null && name.trim() !== saveTarget.name
  const saveTargetDefaultDirty = saveSlot !== null
    && saveAsDefault !== (saveTarget !== null && data.defaultPresetId === saveTarget.id)
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

  useDismissOnOutsideClick(recallOpen, recallRef, () => setRecallOpen(false))

  function reconcileLoadedData(next: AssignmentPresetBootstrap) {
    setData(next)
    if (selectedId && !next.presets.some(preset => preset.id === selectedId)) {
      setSelectedId(null)
      setCurrentOrigin('current')
    }
    if (saveSlot !== null) {
      const refreshedTarget = next.presets.find(preset => preset.slot === saveSlot)
      if (!refreshedTarget && saveSlot !== nextAvailableSlot) {
        setSaveSlot(null)
        setName('')
        setSaveAsDefault(false)
      }
    }
  }

  async function refreshAfterError(message: string) {
    setError(message)
    setNeedsReload(true)
    try {
      const refreshed = await actions.load(type)
      if ('error' in refreshed || refreshed.data.error) return
      reconcileLoadedData(refreshed.data)
      setNeedsReload(false)
    } catch {
      // Keep the draft and the explicit error. A later open retries automatically.
    }
  }

  function run(
    operation: () => Promise<AssignmentPresetActionResult>,
    successMessage: string,
    after?: (next: AssignmentPresetBootstrap) => void,
  ) {
    if (busy || busyRef.current) return
    busyRef.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await operation()
        if ('error' in result) { await refreshAfterError(result.error); return }
        if (result.data.error) { await refreshAfterError(result.data.error); return }
        reconcileLoadedData(result.data)
        setNeedsReload(false)
        after?.(result.data)
        if (successMessage) toast.success(successMessage)
      } catch {
        await refreshAfterError('เชื่อมต่อไม่สำเร็จ ผลการบันทึกยังไม่ยืนยัน ข้อมูลที่กรอกยังอยู่ กรุณารอสักครู่แล้วลองอีกครั้ง')
      } finally {
        busyRef.current = false
      }
    })
  }

  async function applySelection(nextId: string | null) {
    if (busy || unavailable) return
    const preset = nextId ? data.presets.find(item => item.id === nextId) : null
    if (nextId && !preset) {
      void refreshAfterError('ไม่พบชุดการตั้งค่านี้ ระบบกำลังตรวจสอบข้อมูลล่าสุด กรุณาลองอีกครั้ง')
      return
    }
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
    setSaveSlot(null)
    setSaveAsDefault(false)
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

  function selectSaveSlot(slot: number) {
    const preset = data.presets.find(item => item.slot === slot) ?? null
    setSaveSlot(slot)
    setName(preset?.name ?? '')
    setSaveAsDefault(preset !== null && data.defaultPresetId === preset.id)
    setNameError(null)
    setError(null)
  }

  function handleSaveDialogOpenChange(open: boolean, eventDetails: DialogRootChangeEventDetails) {
    if (!open && isPending) {
      eventDetails.cancel()
      return
    }
    if (!open && eventDetails.reason === 'outside-press') {
      eventDetails.cancel()
      setConfirmingClose(true)
      return
    }
    if (open) {
      setSaveSlot(null)
      setName('')
      setSaveAsDefault(false)
      setNameError(null)
      setConfirmingClose(false)
      if (unavailable) void refreshAfterError(error ?? 'ยังตรวจสอบชุดการตั้งค่าล่าสุดไม่ได้ กรุณารอสักครู่แล้วลองอีกครั้ง')
    }
    setSaveDialogOpen(open)
  }

  function closeSaveDialogWithoutSaving() {
    setConfirmingClose(false)
    setSaveDialogOpen(false)
  }

  function validatedName() {
    if (busy || unavailable) return
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 60) { setNameError('กรอกชื่อชุด 1–60 ตัวอักษร'); return }
    if (data.presets.some(preset => preset.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase()
      && preset.id !== saveTarget?.id)) {
      setNameError('มีชื่อชุดนี้แล้ว กรุณาใช้ชื่ออื่น')
      return
    }
    return cleanName
  }

  async function saveSelectedSlot() {
    const cleanName = validatedName()
    if (!cleanName || saveSlot === null) return
    const snapshot = validatedSettings()
    if (!snapshot) return
    if (!saveTarget && saveSlot !== nextAvailableSlot) return
    if (saveTarget && !(await confirm({
      title: `บันทึกทับช่องที่ ${saveTarget.slot}?`,
      description: `ชื่อและการตั้งค่าในชุด “${saveTarget.name}” จะถูกแทนที่ งานที่สร้างไปแล้ว โจทย์ และคะแนนนักเรียนจะไม่เปลี่ยนแปลง`,
      confirmLabel: 'บันทึกทับช่องนี้',
    }))) return

    run(async () => {
      let result: AssignmentPresetActionResult = saveTarget
        ? await actions.save({
          type, id: saveTarget.id, expectedRevision: saveTarget.revision,
          name: cleanName, settings: snapshot,
        })
        : await actions.save({ type, name: cleanName, settings: snapshot })
      if ('error' in result || result.data.error) return result

      const saved = saveTarget
        ? result.data.presets.find(preset => preset.id === saveTarget.id)
        : result.data.presets.find(preset => !data.presets.some(old => old.id === preset.id))
      if (!saved) return { error: 'บันทึกแล้ว แต่ยังยืนยันช่องบันทึกไม่ได้ ระบบกำลังตรวจสอบข้อมูลล่าสุด' }

      if (saveAsDefault && result.data.defaultPresetId !== saved.id) {
        result = await actions.setDefault({ type, id: saved.id, expectedRevision: saved.revision })
      } else if (!saveAsDefault && result.data.defaultPresetId === saved.id) {
        result = await actions.setDefault({ type, id: null })
      }
      return result
    }, `บันทึกการตั้งค่าในช่องที่ ${saveSlot} แล้ว`, next => {
      const saved = saveTarget
        ? next.presets.find(preset => preset.id === saveTarget.id)
        : next.presets.find(preset => !data.presets.some(old => old.id === preset.id))
      setSelectedId(saved?.id ?? selectedId)
      setSaveSlot(saved?.slot ?? saveSlot)
      setName(saved?.name ?? cleanName)
      setSaveAsDefault(saved ? next.defaultPresetId === saved.id : saveAsDefault)
      setCurrentOrigin(null)
      setBaseline(snapshot)
      setSaveDialogOpen(false)
    })
  }

  async function removeSelected(preset: AssignmentSettingPreset) {
    if (!(await confirm({
      title: `ลบชุด “${preset.name}”?`,
      description: `ชุดนี้จะถูกลบ${data.defaultPresetId === preset.id ? ' และงานใหม่จะกลับไปใช้ค่าระบบเป็นค่าเริ่มต้น' : ''} งานเดิมและค่าที่กรอกในงานนี้ยังอยู่ ไม่ลบโจทย์หรือคะแนนนักเรียน`,
      confirmLabel: 'ลบชุดการตั้งค่า', variant: 'destructive',
    }))) return
    run(() => actions.delete({ type, id: preset.id, expectedRevision: preset.revision }), 'ลบชุดการตั้งค่าแล้ว', () => {
      setSaveSlot(preset.slot)
      setName('')
      setSaveAsDefault(false)
      if (selectedId === preset.id) { setSelectedId(null); setCurrentOrigin('current') }
    })
  }

  const status = <>
    {isPending && <p role="status" className="text-sm text-muted-foreground">กำลังดำเนินการกับชุดการตั้งค่า…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>

  const recall = (
    <Card ref={recallRef} padding="md" className="min-w-0" aria-busy={isPending}>
      <Collapsible open={recallOpen} onOpenChange={setRecallOpen}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 text-left">
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="text-sm font-semibold">
              เรียกใช้การตั้งค่าเดิม · {typeLabel}
            </span>
            <span data-assignment-description className="text-sm font-normal text-muted-foreground">{recalledSettingLabel}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <div className="flex flex-col gap-3 pt-3">
            <FieldGroup className="max-w-xl gap-3">
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
            {status}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )

  const save = (
    <DialogTrigger render={<Button ref={saveTriggerRef} type="button" variant="outline" disabled={busy} className="w-full sm:w-auto" />}>
      <BookmarkPlus data-icon="inline-start" />
      บันทึกการตั้งค่า
    </DialogTrigger>
  )

  return (
    <>
      <Dialog open={saveDialogOpen} onOpenChange={handleSaveDialogOpenChange}>
        <PresetPartsContext.Provider value={{ recall, save }}>
          {children}
          <DialogContent ref={dialogContentRef} showCloseButton={!isPending} className="sm:max-w-lg" aria-busy={isPending}>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3 pr-8">
                <DialogTitle>บันทึกการตั้งค่าไว้ใช้ครั้งต่อไป</DialogTitle>
                {!unavailable && <Badge variant="secondary" className="shrink-0">{data.presets.length}/{ASSIGNMENT_PRESET_LIMIT} ชุด</Badge>}
              </div>
            </DialogHeader>
            <form onSubmit={event => { event.preventDefault(); void saveSelectedSlot() }} className="flex flex-col gap-4">
              <FieldGroup className="gap-4">
                <Field data-disabled={busy || unavailable}>
                  <FieldLabel id={`${id}-slot-label`}>เลือกช่องบันทึก</FieldLabel>
                  <ToggleGroup
                    value={saveSlot === null ? [] : [String(saveSlot)]}
                    onValueChange={values => {
                      const slot = Number(values[0])
                      if (Number.isInteger(slot)) selectSaveSlot(slot)
                    }}
                    disabled={busy || unavailable}
                    variant="outline"
                    aria-labelledby={`${id}-slot-label`}
                    className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
                  >
                    {Array.from({ length: ASSIGNMENT_PRESET_LIMIT }, (_, index) => index + 1).map(slot => {
                      const preset = data.presets.find(item => item.slot === slot) ?? null
                      const isAvailable = preset !== null || slot === nextAvailableSlot
                      const isDefault = preset !== null && data.defaultPresetId === preset.id
                      return (
                        <ToggleGroupItem
                          key={slot}
                          value={String(slot)}
                          disabled={!isAvailable}
                          aria-label={preset
                            ? `ช่องที่ ${slot} ${preset.name}${isDefault ? ' ค่าเริ่มต้น' : ''}`
                            : `ช่องที่ ${slot} ว่าง`}
                          className="h-auto min-h-14 w-full min-w-0 items-center justify-start whitespace-normal rounded-xl border-border px-3 py-2 text-left aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-foreground data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                        >
                          <span className="flex w-full min-w-0 items-center justify-between gap-2">
                            <span className="flex min-w-0 flex-col items-start gap-0.5">
                              <span className="text-[11px] leading-none text-muted-foreground">ช่องที่ {slot}</span>
                              <span className="max-w-full truncate text-sm font-medium leading-tight text-foreground">{preset?.name ?? 'ว่าง'}</span>
                            </span>
                            {isDefault
                              ? <Star className="shrink-0 fill-current text-primary" aria-label="ค่าเริ่มต้น" />
                              : saveSlot === slot && <Check className="shrink-0 text-primary" aria-hidden="true" />}
                          </span>
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                </Field>
                {saveSlot !== null && <>
                  <Field data-invalid={nameError !== null} data-disabled={busy || unavailable}>
                    <FieldLabel htmlFor={`${id}-name`}>ชื่อชุดการตั้งค่า</FieldLabel>
                    <Input id={`${id}-name`} value={name} maxLength={60} autoFocus
                      disabled={busy || unavailable}
                      aria-invalid={nameError !== null}
                      onChange={event => { setName(event.target.value); setNameError(null) }} placeholder="เช่น ฝึกทีละข้อ หรือสอบกลางภาค" />
                    <FieldError>{nameError}</FieldError>
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <Toggle type="button" variant="primary" pressed={saveAsDefault}
                      disabled={busy || unavailable} onPressedChange={setSaveAsDefault}>
                      <Star data-icon="inline-start" />
                      ตั้งเป็นค่าเริ่มต้น
                    </Toggle>
                    {saveTarget && <Button type="button" variant="outline" size="sm" disabled={busy || unavailable}
                      onClick={() => void removeSelected(saveTarget)}>
                      <Trash2 data-icon="inline-start" />ลบชุด
                    </Button>}
                  </div>
                </>}
              </FieldGroup>
              {status}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={isPending} onClick={() => setSaveDialogOpen(false)}>ยกเลิก</Button>
                <Button type="submit" disabled={busy || unavailable || saveSlot === null || !name.trim()
                  || (saveTarget !== null && !saveTargetDirty && !saveTargetNameDirty && !saveTargetDefaultDirty)}>
                  {isPending ? 'กำลังบันทึก…' : saveTarget ? 'บันทึกทับช่องนี้' : 'บันทึกในช่องนี้'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </PresetPartsContext.Provider>
      </Dialog>

      {/* Sibling roots preserve the confirmation backdrop and return focus to
          the still-open settings dialog, matching the app's other edit flows. */}
      {confirmation}
      <ConfirmDialog
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        title="ปิดโดยไม่บันทึกชุดการตั้งค่าหรือไม่?"
        description="ชื่อชุดและการเปลี่ยนแปลงที่ยังไม่ได้บันทึกจะถูกยกเลิก แบบร่างงานและชุดเดิมจะไม่เปลี่ยนแปลง"
        confirmLabel="ปิดโดยไม่บันทึก"
        cancelLabel="กลับไปตั้งค่าต่อ"
        variant="destructive"
        onConfirm={closeSaveDialogWithoutSaving}
        finalFocus={() => saveDialogOpen ? dialogContentRef.current : saveTriggerRef.current}
      />
    </>
  )
}

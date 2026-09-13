'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { checkIocItemsReady, formatStandardLabel } from '@/lib/ioc-form'
import {
  saveIocFormExperts,
  saveIocFormStandards,
  setIocFormSource,
} from '@/lib/actions/ioc-forms'
import type { IocFormSourceKind, IocSignatureMode } from '@/lib/types'

export interface IocEditorSources {
  measurements: { id: string; label: string; question_count: number }[]
  assignments: { id: string; label: string; question_count: number }[]
  sets: { id: string; label: string; question_count: number; question_ids: string[] }[]
}

interface EditorItem {
  id: string
  order_index: number
  item_label: string
  section_label: string
  group_intro: string
  prompt: string
  choices: string[]
  standard_id: string | null
}

interface EditorStandard {
  id: string
  order_index: number
  code: string
  description: string
}

interface EditorExpert {
  id: string
  expert_order: number
  display_name: string
  position_title: string
  affiliation: string
}

interface DraftStandard {
  key: string
  id: string | null
  code: string
  description: string
}

interface DraftExpert {
  key: string
  id: string | null
  display_name: string
  position_title: string
  affiliation: string
}

const STEP_LABELS = ['หัวเอกสาร', 'เลือกข้อสอบ', 'มาตรฐานและตัวชี้วัด', 'ผู้ทรงคุณวุฒิและลายเซ็น']

function newKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Strips the editor's rich text down to something a one-line preview can show. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function IocFormEditor({
  form,
  items,
  standards,
  experts,
  sources,
}: {
  form: {
    id: string
    status: string
    source_kind: IocFormSourceKind
    measurement_id: string | null
    assignment_id: string | null
    author_signature_mode: IocSignatureMode
    frozen: boolean
  }
  items: EditorItem[]
  standards: EditorStandard[]
  experts: EditorExpert[]
  sources: IocEditorSources
}) {
  const hasItems = items.length > 0
  const readiness = useMemo(() => checkIocItemsReady(items), [items])
  const [step, setStep] = useState(() => (hasItems ? (readiness.ready ? 3 : 2) : 1))

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="ขั้นตอนของฟอร์ม">
        {STEP_LABELS.map((label, index) => (
          <Button
            key={label}
            size="sm"
            variant={index === step ? 'default' : 'outline'}
            aria-current={index === step ? 'step' : undefined}
            onClick={() => setStep(index)}
          >
            <span className="mr-2 text-xs">{index + 1}</span>
            {label}
          </Button>
        ))}
      </nav>

      {step === 0 ? <HeaderStep formId={form.id} /> : null}
      {step === 1 ? <SourceStep form={form} items={items} sources={sources} onDone={() => setStep(2)} /> : null}
      {step === 2 ? (
        <StandardsStep
          formId={form.id}
          frozen={form.frozen}
          items={items}
          standards={standards}
          onDone={() => setStep(3)}
        />
      ) : null}
      {step === 3 ? <ExpertsStep form={form} experts={experts} readiness={readiness} /> : null}
    </div>
  )
}

function HeaderStep({ formId }: { formId: string }) {
  return (
    <Card padding="lg" className="space-y-3">
      <h2 className="font-semibold text-foreground">หัวเอกสารและเกณฑ์</h2>
      <p className="text-sm text-muted-foreground">
        ชื่อแบบทดสอบ รายวิชา โรงเรียน ผู้ออกข้อสอบ คำชี้แจง และเกณฑ์การตัดสิน แก้ได้ในหน้าเดียวกับตอนสร้าง
      </p>
      <Button variant="outline" render={<Link href={`/research/ioc/new?form=${formId}`} />}>
        แก้หัวเอกสาร
      </Button>
    </Card>
  )
}

function SourceStep({
  form,
  items,
  sources,
  onDone,
}: {
  form: { id: string; source_kind: IocFormSourceKind; measurement_id: string | null; assignment_id: string | null; frozen: boolean }
  items: EditorItem[]
  sources: IocEditorSources
  onDone: () => void
}) {
  const router = useRouter()
  const [kind, setKind] = useState<IocFormSourceKind>(form.source_kind)
  const [measurementId, setMeasurementId] = useState(form.measurement_id ?? sources.measurements[0]?.id ?? '')
  const [assignmentId, setAssignmentId] = useState(form.assignment_id ?? sources.assignments[0]?.id ?? '')
  const [setId, setSetId] = useState(sources.sets[0]?.id ?? '')
  const [pending, startTransition] = useTransition()

  function apply() {
    const source =
      kind === 'research_measurement'
        ? measurementId ? { kind, measurement_id: measurementId } as const : null
        : kind === 'assignment'
          ? assignmentId ? { kind, assignment_id: assignmentId } as const : null
          : (() => {
              const selected = sources.sets.find(option => option.id === setId)
              return selected ? { kind: 'question_selection', set_id: selected.id, question_ids: selected.question_ids } as const : null
            })()

    if (!source) {
      toast.error('เลือกข้อสอบก่อน')
      return
    }

    startTransition(async () => {
      const result = await setIocFormSource({ form_id: form.id, source })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      const prefilled = ('prefilled_count' in result ? result.prefilled_count : 0) ?? 0
      const itemCount = ('item_count' in result ? result.item_count : 0) ?? 0
      toast.success(
        prefilled > 0
          ? `นำข้อสอบเข้าฟอร์มแล้ว ${itemCount} ข้อ · เติมตัวชี้วัดให้อัตโนมัติ ${prefilled} ข้อจากที่เคยบันทึกไว้`
          : `นำข้อสอบเข้าฟอร์มแล้ว ${itemCount} ข้อ`,
      )
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-4">
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="font-semibold text-foreground">ข้อสอบมาจากไหน</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกได้ทางเดียว เปลี่ยนได้จนกว่าจะส่งลิงก์ให้ผู้ทรงคุณวุฒิ · ระบบคัดลอกโจทย์ หัวข้อตอน โจทย์ร่วม และเลขข้อมาให้ครบ
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SourceChoice
            checked={kind === 'research_measurement'}
            onSelect={() => setKind('research_measurement')}
            title="ข้อสอบของโครงการวิจัย"
            detail="ข้อสอบก่อนเรียนหรือหลังเรียนที่ตรึงไว้แล้ว"
            disabled={form.frozen || sources.measurements.length === 0}
            emptyHint="ยังไม่มีโครงการวิจัยที่มีข้อสอบออนไลน์"
          />
          <SourceChoice
            checked={kind === 'assignment'}
            onSelect={() => setKind('assignment')}
            title="งานที่มอบหมายในห้องเรียน"
            detail="ข้อสอบที่นักเรียนทำจริง"
            disabled={form.frozen || sources.assignments.length === 0}
            emptyHint="ยังไม่มีงานที่มีข้อสอบ"
          />
          <SourceChoice
            checked={kind === 'question_selection'}
            onSelect={() => setKind('question_selection')}
            title="แฟ้มโจทย์"
            detail="สำหรับข้อสอบที่ยังไม่ได้มอบหมาย"
            disabled={form.frozen || sources.sets.length === 0}
            emptyHint="ยังไม่มีแฟ้มโจทย์ที่มีข้อ"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ioc-source-option">ชุดข้อสอบ</Label>
          {kind === 'research_measurement' ? (
            <SourceSelect
              id="ioc-source-option"
              value={measurementId}
              onChange={setMeasurementId}
              options={sources.measurements}
            />
          ) : null}
          {kind === 'assignment' ? (
            <SourceSelect id="ioc-source-option" value={assignmentId} onChange={setAssignmentId} options={sources.assignments} />
          ) : null}
          {kind === 'question_selection' ? (
            <SourceSelect id="ioc-source-option" value={setId} onChange={setSetId} options={sources.sets} />
          ) : null}
        </div>

        {items.length > 0 ? (
          <p className="text-sm text-warning">
            ฟอร์มนี้มีข้อสอบอยู่แล้ว {items.length} ข้อ การเลือกชุดใหม่จะแทนที่ทั้งหมด ตัวชี้วัดที่พิมพ์ไว้ยังอยู่
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={apply} disabled={pending || form.frozen}>
            {pending ? 'กำลังนำเข้า…' : 'ใช้ข้อสอบชุดนี้'}
          </Button>
        </div>
      </Card>

      {items.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold text-foreground">ข้อสอบในฟอร์ม {items.length} ข้อ</h3>
            <p className="mt-1 text-sm text-muted-foreground">เรียงตามลำดับที่จะพิมพ์ในเอกสาร</p>
          </div>
          <ul className="divide-y">
            {items.map(item => (
              <li key={item.id} className="space-y-1 px-4 py-3">
                {item.section_label ? (
                  <p className="text-xs font-bold text-muted-foreground">{item.section_label}</p>
                ) : null}
                {item.group_intro ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    โจทย์ร่วม · {plainText(item.group_intro).slice(0, 160)}
                  </p>
                ) : null}
                <p className="text-sm text-foreground">
                  <span className="font-bold text-muted-foreground">{item.item_label}.</span>{' '}
                  {plainText(item.prompt).slice(0, 180) || '(ไม่มีข้อความโจทย์)'}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

function SourceChoice({
  checked,
  onSelect,
  title,
  detail,
  disabled,
  emptyHint,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail: string
  disabled: boolean
  emptyHint: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
        checked ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        name="ioc-source-kind"
        className="mt-1 size-4"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{disabled ? emptyHint : detail}</span>
      </span>
    </label>
  )
}

function SourceSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: { id: string; label: string; question_count: number }[]
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีตัวเลือกในหมวดนี้</p>
  }
  return (
    <NativeSelect id={id} value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => (
        <option key={option.id} value={option.id}>
          {option.label} — {option.question_count} ข้อ
        </option>
      ))}
    </NativeSelect>
  )
}

function StandardsStep({
  formId,
  frozen,
  items,
  standards,
  onDone,
}: {
  formId: string
  frozen: boolean
  items: EditorItem[]
  standards: EditorStandard[]
  onDone: () => void
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftStandard[]>(() =>
    standards.map(standard => ({
      key: standard.id,
      id: standard.id,
      code: standard.code,
      description: standard.description,
    })),
  )
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(items.map(item => [item.id, item.standard_id])),
  )
  const [remember, setRemember] = useState(true)
  const [pending, startTransition] = useTransition()

  const matchedCount = Object.values(assignments).filter(Boolean).length
  const keyById = useMemo(
    () => new Map(drafts.filter(draft => draft.id).map(draft => [draft.id as string, draft.key])),
    [drafts],
  )

  function assignmentKeyOf(itemId: string): string {
    const standardId = assignments[itemId]
    if (!standardId) return ''
    return keyById.get(standardId) ?? standardId
  }

  function addStandard() {
    setDrafts(current => [...current, { key: newKey(), id: null, code: '', description: '' }])
  }

  function updateStandard(key: string, patch: Partial<DraftStandard>) {
    setDrafts(current => current.map(draft => (draft.key === key ? { ...draft, ...patch } : draft)))
  }

  function removeStandard(key: string) {
    setDrafts(current => current.filter(draft => draft.key !== key))
    setAssignments(current => {
      const next = { ...current }
      for (const [itemId, standardId] of Object.entries(next)) {
        if (standardId && keyById.get(standardId) === key) next[itemId] = null
      }
      return next
    })
  }

  function fillEmptyWith(key: string) {
    const draft = drafts.find(entry => entry.key === key)
    if (!draft) return
    setAssignments(current => {
      const next = { ...current }
      for (const item of items) {
        if (!next[item.id]) next[item.id] = draft.id ?? key
      }
      return next
    })
    toast.success('เติมตัวชี้วัดให้ข้อที่ยังว่างแล้ว')
  }

  function save() {
    const payloadStandards = drafts.map(draft => ({
      key: draft.key,
      id: draft.id,
      code: draft.code,
      description: draft.description,
    }))

    startTransition(async () => {
      const result = await saveIocFormStandards({
        form_id: formId,
        standards: payloadStandards,
        assignments: items.map(item => {
          const value = assignments[item.id]
          if (!value) return { item_id: item.id, standard_key: null }
          return { item_id: item.id, standard_key: keyById.get(value) ?? value }
        }),
        remember,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      const remembered = ('remembered_count' in result ? result.remembered_count : 0) ?? 0
      toast.success(
        remembered > 0
          ? `บันทึกแล้ว · จำตัวชี้วัดไว้กับโจทย์ ${remembered} ข้อสำหรับฟอร์มครั้งหน้า`
          : 'บันทึกการจับคู่ตัวชี้วัดแล้ว',
      )
      router.refresh()
      onDone()
    })
  }

  if (items.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-muted-foreground">เลือกข้อสอบในขั้นที่ 2 ก่อน แล้วจึงจับคู่ตัวชี้วัดได้</p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card padding="lg" className="space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">ตัวชี้วัดในฟอร์มนี้</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            พิมพ์ครั้งเดียวแล้วจ่ายให้หลายข้อ · ข้อที่ใช้ตัวชี้วัดเดียวกันจะถูกผสานเป็นช่องเดียวในเอกสาร
          </p>
        </div>

        {drafts.map(draft => (
          <div key={draft.key} className="space-y-2 rounded-xl border p-3">
            <Input
              value={draft.code}
              placeholder="รหัส เช่น ค 3.1 ม.6/1"
              disabled={frozen}
              onChange={event => updateStandard(draft.key, { code: event.target.value })}
            />
            <Textarea
              value={draft.description}
              placeholder="คำอธิบายตัวชี้วัด"
              rows={3}
              disabled={frozen}
              onChange={event => updateStandard(draft.key, { description: event.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={frozen} onClick={() => fillEmptyWith(draft.key)}>
                เติมให้ข้อที่ยังว่าง
              </Button>
              <Button size="sm" variant="ghost" disabled={frozen} onClick={() => removeStandard(draft.key)}>
                ลบ
              </Button>
            </div>
          </div>
        ))}

        <Button variant="outline" disabled={frozen} onClick={addStandard}>+ เพิ่มตัวชี้วัด</Button>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-semibold text-foreground">จับคู่ข้อสอบกับตัวชี้วัด</h2>
            <p className="mt-1 text-sm text-muted-foreground">กรอกแล้ว {matchedCount} จาก {items.length} ข้อ</p>
          </div>
          <Button onClick={save} disabled={pending || frozen}>
            {pending ? 'กำลังบันทึก…' : 'บันทึกการจับคู่'}
          </Button>
        </div>

        <ul className="divide-y">
          {items.map(item => (
            <li key={item.id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_260px] sm:items-center">
              <div>
                <p className="text-sm text-foreground">
                  <span className="font-bold text-muted-foreground">{item.item_label}.</span>{' '}
                  {plainText(item.prompt).slice(0, 120) || '(ไม่มีข้อความโจทย์)'}
                </p>
              </div>
              <NativeSelect
                aria-label={`ตัวชี้วัดของข้อ ${item.item_label}`}
                value={assignmentKeyOf(item.id)}
                disabled={frozen}
                onChange={event => {
                  const key = event.target.value
                  setAssignments(current => ({ ...current, [item.id]: key || null }))
                }}
              >
                <option value="">ยังไม่ได้เลือกตัวชี้วัด</option>
                {drafts.map(draft => (
                  <option key={draft.key} value={draft.id ?? draft.key}>
                    {formatStandardLabel(draft) || 'ตัวชี้วัดที่ยังไม่ได้ตั้งชื่อ'}
                  </option>
                ))}
              </NativeSelect>
            </li>
          ))}
        </ul>

        <label className="flex items-start gap-3 border-t px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={remember}
            disabled={frozen}
            onChange={event => setRemember(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">จำตัวชี้วัดไว้กับโจทย์ในคลัง</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              ครั้งหน้าที่ใช้โจทย์ข้อเดิมทำฟอร์ม IOC ระบบจะเติมตัวชี้วัดให้เอง
            </span>
          </span>
        </label>
      </Card>
    </div>
  )
}

function ExpertsStep({
  form,
  experts,
  readiness,
}: {
  form: { id: string; author_signature_mode: IocSignatureMode; frozen: boolean }
  experts: EditorExpert[]
  readiness: { ready: boolean; missingLabels: string[] }
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftExpert[]>(() =>
    experts.length > 0
      ? experts.map(expert => ({
          key: expert.id,
          id: expert.id,
          display_name: expert.display_name,
          position_title: expert.position_title,
          affiliation: expert.affiliation,
        }))
      : [{ key: newKey(), id: null, display_name: '', position_title: '', affiliation: '' }],
  )
  const [signatureMode, setSignatureMode] = useState<'typed' | 'none'>(
    form.author_signature_mode === 'typed' ? 'typed' : 'none',
  )
  const [pending, startTransition] = useTransition()

  function update(key: string, patch: Partial<DraftExpert>) {
    setDrafts(current => current.map(draft => (draft.key === key ? { ...draft, ...patch } : draft)))
  }

  function save() {
    startTransition(async () => {
      const result = await saveIocFormExperts({
        form_id: form.id,
        experts: drafts.map(draft => ({
          id: draft.id,
          display_name: draft.display_name,
          position_title: draft.position_title,
          affiliation: draft.affiliation,
        })),
        author_signature_mode: signatureMode,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success(`บันทึกผู้ทรงคุณวุฒิ ${result.expert_count} ท่านแล้ว`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="font-semibold text-foreground">ผู้ทรงคุณวุฒิ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ชื่อที่กรอกจะไปอยู่ในวงเล็บใต้เส้นลายเซ็นและในตารางสรุป ลำดับคือ “ผู้ประเมินคนที่ 1, 2, 3…” ตามที่เรียงไว้
          </p>
        </div>

        {drafts.map((draft, index) => (
          <div key={draft.key} className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-center">
            <span className="text-sm font-semibold text-muted-foreground">ผู้ประเมินคนที่ {index + 1}</span>
            <Input
              value={draft.display_name}
              placeholder="ชื่อ-นามสกุล"
              disabled={form.frozen}
              onChange={event => update(draft.key, { display_name: event.target.value })}
            />
            <Input
              value={draft.position_title}
              placeholder="ตำแหน่งและหน่วยงาน (ไม่บังคับ)"
              disabled={form.frozen}
              onChange={event => update(draft.key, { position_title: event.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={form.frozen || drafts.length === 1}
              onClick={() => setDrafts(current => current.filter(entry => entry.key !== draft.key))}
            >
              ลบ
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={form.frozen || drafts.length >= 12}
            onClick={() => setDrafts(current => [...current, { key: newKey(), id: null, display_name: '', position_title: '', affiliation: '' }])}
          >
            + เพิ่มผู้ทรงคุณวุฒิ
          </Button>
          <span className="text-xs text-muted-foreground">
            งานวิจัยส่วนใหญ่ใช้ 3 ท่านและเป็นจำนวนคี่ · ถ้าน้อยกว่า 3 ระบบจะเตือนตอนสรุปผลแต่ไม่ห้าม
          </span>
        </div>
      </Card>

      <Card padding="lg" className="space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">ลายเซ็นผู้ออกข้อสอบ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ตอนนี้เลือกได้ระหว่างพิมพ์ชื่อกับเว้นเส้นประไว้เซ็นด้วยปากกา
            การวาดและอัปโหลดรูปลายเซ็นจะมาพร้อมกับขั้นส่งลิงก์ให้ผู้ทรงคุณวุฒิ
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SignatureChoice
            checked={signatureMode === 'typed'}
            onSelect={() => setSignatureMode('typed')}
            title="พิมพ์ชื่อ"
            detail="พิมพ์ชื่อผู้ออกข้อสอบไว้เหนือเส้น"
            disabled={form.frozen}
          />
          <SignatureChoice
            checked={signatureMode === 'none'}
            onSelect={() => setSignatureMode('none')}
            title="เว้นไว้เซ็นเอง"
            detail="เอกสารพิมพ์เส้นประว่างไว้"
            disabled={form.frozen}
          />
        </div>
      </Card>

      <Card padding="lg" className="space-y-3">
        <h2 className="font-semibold text-foreground">พร้อมส่งให้ผู้ทรงคุณวุฒิหรือยัง</h2>
        <ul className="space-y-1 text-sm">
          <li className={readiness.ready ? 'text-success' : 'text-warning'}>
            {readiness.ready
              ? 'ทุกข้อมีตัวชี้วัดแล้ว'
              : `ยังมีข้อที่ไม่มีตัวชี้วัด: ${readiness.missingLabels.slice(0, 8).join(', ')}${readiness.missingLabels.length > 8 ? '…' : ''}`}
          </li>
          <li className="text-muted-foreground">
            การสร้างลิงก์ ตรึงข้อสอบ และหน้ากรอกของผู้ทรงคุณวุฒิ เป็นงานขั้นถัดไปที่ยังไม่เปิดใช้งาน
          </li>
        </ul>
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending || form.frozen}>
            {pending ? 'กำลังบันทึก…' : 'บันทึกผู้ทรงคุณวุฒิและลายเซ็น'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SignatureChoice({
  checked,
  onSelect,
  title,
  detail,
  disabled,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail: string
  disabled: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
        checked ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input type="radio" name="ioc-signature-mode" className="mt-1 size-4" checked={checked} disabled={disabled} onChange={onSelect} />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}

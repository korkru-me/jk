'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  buildIocDocumentTitle,
  buildIocInstructionText,
  validateIocHeader,
  type IocHeaderField,
  type IocHeaderInput,
} from '@/lib/ioc-form'
import { effectiveIocThreshold, formatIocIndex, type IocPercentRule } from '@/lib/ioc'
import { createIocFormDraft, updateIocFormHeader } from '@/lib/actions/ioc-forms'

export interface IocFormWizardDraft {
  form_id: string | null
  header: IocHeaderInput
  instruction_text: string
  threshold: number
  percent_rule: IocPercentRule
  show_solutions: boolean
}

const STEPS = ['หัวเอกสาร', 'เลือกข้อสอบ', 'มาตรฐานและตัวชี้วัด', 'ผู้ทรงคุณวุฒิและลายเซ็น']

/** Three experts is the usual panel, and the number the hint is written for. */
const HINT_EXPERT_COUNT = 3

export function IocFormWizard({ draft }: { draft: IocFormWizardDraft }) {
  const router = useRouter()
  const [header, setHeader] = useState<IocHeaderInput>(draft.header)
  const [instruction, setInstruction] = useState(draft.instruction_text)
  // Shown the way the document prints it, so 0.5 does not read as a
  // different rule from the 0.50 in the hint underneath.
  const [threshold, setThreshold] = useState(draft.threshold.toFixed(2))
  const [percentRule, setPercentRule] = useState<IocPercentRule>(draft.percent_rule)
  const [showSolutions, setShowSolutions] = useState(draft.show_solutions)
  const [touched, setTouched] = useState(false)
  const [pending, startTransition] = useTransition()

  const validation = useMemo(() => validateIocHeader(header), [header])
  const titleLines = useMemo(() => buildIocDocumentTitle(header), [header])
  const instructionPreview = instruction.trim() || buildIocInstructionText(header)

  const thresholdValue = Number(threshold)
  const thresholdValid = Number.isFinite(thresholdValue) && thresholdValue > 0 && thresholdValue <= 1
  const effective = thresholdValid ? effectiveIocThreshold(thresholdValue, HINT_EXPERT_COUNT) : null

  function setField(field: IocHeaderField, value: string) {
    setHeader(current => ({ ...current, [field]: value }))
  }

  function save() {
    setTouched(true)
    if (!validation.valid) {
      toast.error(Object.values(validation.errors)[0] ?? 'กรอกข้อมูลให้ครบก่อน')
      return
    }
    if (!thresholdValid) {
      toast.error('เกณฑ์ต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 1 เช่น 0.50')
      return
    }

    startTransition(async () => {
      const payload = {
        ...header,
        instruction_text: instruction,
        threshold: thresholdValue,
        percent_rule: percentRule,
        show_solutions: showSolutions,
        classroom_id: null,
        project_id: null,
      }

      const result = draft.form_id
        ? await updateIocFormHeader({ ...payload, form_id: draft.form_id })
        : await createIocFormDraft(payload)

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success('บันทึกหัวเอกสารแล้ว')
      const savedId = 'form_id' in result ? result.form_id : draft.form_id
      router.push(savedId ? `/research/ioc/${savedId}` : '/research/ioc')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">วิจัยการศึกษา › ฟอร์ม IOC</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          {draft.form_id ? 'แก้ไขฟอร์ม IOC' : 'สร้างฟอร์ม IOC'}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          ขั้นที่ 1 จาก 4 — ข้อมูลหัวเอกสาร ทุกช่องนี้จะถูกพิมพ์ลงหัวกระดาษของฟอร์มที่ส่งให้ผู้ทรงคุณวุฒิ
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-lg text-xs font-bold',
                index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {index + 1}
            </span>
            <span className={cn('font-semibold', index === 0 ? 'text-foreground' : 'text-muted-foreground')}>
              {label}
            </span>
            {index < STEPS.length - 1 ? <span className="mx-1 text-muted-foreground">›</span> : null}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card padding="lg" className="space-y-4">
            <div>
              <h2 className="font-semibold text-foreground">หัวเอกสาร</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                เติมให้จากโรงเรียนในบัญชีและโปรไฟล์ของคุณแล้ว แก้ได้ทุกช่อง
              </p>
            </div>

            <Field
              id="ioc-exam-title"
              label="ชื่อแบบทดสอบและช่วงสอบ"
              value={header.exam_title}
              onChange={value => setField('exam_title', value)}
              placeholder="แบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2"
              error={touched ? validation.errors.exam_title : undefined}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="ioc-subject" label="รายวิชา" value={header.subject_name} onChange={value => setField('subject_name', value)} placeholder="คณิตศาสตร์พื้นฐาน 6" />
              <Field id="ioc-subject-code" label="รหัสวิชา" value={header.subject_code} onChange={value => setField('subject_code', value)} placeholder="ค 33102" />
              <Field id="ioc-grade" label="ระดับชั้น" value={header.grade_level} onChange={value => setField('grade_level', value)} placeholder="มัธยมศึกษาปีที่ 6" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="ioc-term" label="ภาคเรียนที่" value={header.term_label} onChange={value => setField('term_label', value)} placeholder="2" />
              <Field
                id="ioc-year"
                label="ปีการศึกษา"
                value={header.academic_year}
                onChange={value => setField('academic_year', value)}
                placeholder="2569"
                inputMode="numeric"
                error={touched ? validation.errors.academic_year : undefined}
              />
            </div>

            <Field id="ioc-school" label="โรงเรียน" value={header.school_name} onChange={value => setField('school_name', value)} placeholder="ชื่อโรงเรียนหรือหน่วยงาน" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="ioc-author"
                label="ผู้ออกข้อสอบ"
                value={header.author_name}
                onChange={value => setField('author_name', value)}
                placeholder="ชื่อ-นามสกุล"
                error={touched ? validation.errors.author_name : undefined}
              />
              <Field id="ioc-author-position" label="ตำแหน่ง (ไม่บังคับ)" value={header.author_position} onChange={value => setField('author_position', value)} placeholder="ครูผู้สอน" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ioc-instruction">คำชี้แจงถึงผู้ทรงคุณวุฒิ</Label>
              <Textarea
                id="ioc-instruction"
                value={instruction}
                onChange={event => setInstruction(event.target.value)}
                placeholder={buildIocInstructionText(header)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                เว้นว่างไว้ได้ ระบบจะใช้ข้อความตั้งต้นที่แสดงในตัวอย่างด้านขวา
              </p>
            </div>
          </Card>

          <Card padding="lg" className="space-y-4">
            <div>
              <h2 className="font-semibold text-foreground">เกณฑ์การตัดสิน</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ใช้คำนวณว่าข้อไหนผ่านและร้อยละความสอดคล้องเป็นเท่าไร เอกสารที่ส่งออกจะพิมพ์กำกับไว้ว่าใช้เกณฑ์นี้
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ioc-threshold">ค่า IOC ที่ถือว่าผ่าน</Label>
                <Input
                  id="ioc-threshold"
                  value={threshold}
                  onChange={event => setThreshold(event.target.value)}
                  inputMode="decimal"
                  aria-invalid={touched && !thresholdValid}
                />
                <p className="text-xs text-muted-foreground">
                  มาตรฐานที่ตำราไทยใช้กันคือ 0.50 ขึ้นไป
                  {effective !== null ? (
                    <> · ถ้ามีผู้ทรง {HINT_EXPERT_COUNT} ท่าน เกณฑ์นี้มีผลเท่ากับ {formatIocIndex(effective)}</>
                  ) : null}
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">วิธีคิดร้อยละความสอดคล้อง</legend>
                <RuleChoice
                  checked={percentRule === 'items_passing'}
                  onSelect={() => setPercentRule('items_passing')}
                  title="จากจำนวนข้อที่ผ่านเกณฑ์"
                  detail="ข้อที่ผ่าน ÷ ข้อทั้งหมด × 100 — ที่ใช้กันทั่วไป"
                />
                <RuleChoice
                  checked={percentRule === 'mean_index'}
                  onSelect={() => setPercentRule('mean_index')}
                  title="จากค่าเฉลี่ยดัชนี"
                  detail="ค่าเฉลี่ย IOC ทุกข้อ × 100"
                />
              </fieldset>
            </div>

            <label className="flex items-start gap-3 rounded-xl border p-3">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={showSolutions}
                onChange={event => setShowSolutions(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">ให้ผู้ทรงคุณวุฒิเห็นเฉลยและแนวคำตอบ</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  ปิดไว้เป็นค่าตั้งต้น เฉลยจะไม่ถูกส่งไปที่เบราว์เซอร์ของผู้ทรงเลย
                </span>
              </span>
            </label>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button variant="ghost" render={<Link href="/research/ioc" />}>ยกเลิก</Button>
            <Button onClick={save} disabled={pending}>
              {pending ? 'กำลังบันทึก…' : 'บันทึกหัวเอกสาร'}
            </Button>
          </div>
        </div>

        <Card padding="lg" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-foreground">ตัวอย่างหัวกระดาษ</h2>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              อัปเดตตามที่พิมพ์
            </span>
          </div>
          <Card padding="md" radius="sm" className="text-sm leading-relaxed">
            {titleLines.length === 0 ? (
              <p className="text-muted-foreground">กรอกชื่อแบบทดสอบเพื่อดูตัวอย่าง</p>
            ) : (
              <div className="space-y-1 text-center font-semibold text-foreground">
                {titleLines.map(line => <p key={line}>{line}</p>)}
              </div>
            )}
            <p className="mt-3 text-foreground">
              <span className="font-semibold">คำชี้แจง</span> {instructionPreview}
            </p>
            <ul className="mt-2 space-y-0.5 pl-6 text-foreground">
              <li>+1 แน่ใจว่าแบบทดสอบสอดคล้องตัวชี้วัด</li>
              <li>0 ไม่แน่ใจว่าแบบทดสอบสอดคล้องกับตัวชี้วัด</li>
              <li>−1 แน่ใจว่าแบบทดสอบไม่สอดคล้องกับตัวชี้วัด</li>
            </ul>
          </Card>
          <p className="text-xs text-muted-foreground">
            เอกสารจริงพิมพ์บนกระดาษ A4 ด้วยฟอนต์ Sarabun · ตัวอย่างนี้แสดงเฉพาะข้อความเพื่อให้ตรวจคำก่อน
          </p>
        </Card>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  inputMode?: 'numeric' | 'decimal' | 'text'
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => onChange(event.target.value)}
      />
      {error ? <p id={`${id}-error`} className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  )
}

function RuleChoice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
        checked ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
      )}
    >
      <input
        type="radio"
        name="ioc-percent-rule"
        className="mt-1 size-4"
        checked={checked}
        onChange={onSelect}
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  iocPrintDocAvailability,
  serializeIocPrintOptions,
  type IocPrintDoc,
  type IocPrintOptions,
} from '@/lib/ioc-print'

interface ExportExpert {
  id: string
  expert_order: number
  display_name: string
  submitted: boolean
  signed: boolean
}

const DOC_LABELS: Record<IocPrintDoc, { title: string; detail: string }> = {
  blank: {
    title: 'ฟอร์มเปล่า',
    detail: 'ยังไม่มีใครกรอก สำหรับผู้ทรงที่ขอกรอกบนกระดาษ หรือเก็บเป็นหลักฐานว่าส่งอะไรไป',
  },
  expert: {
    title: 'ฉบับที่ผู้ทรงกรอกแล้ว',
    detail: 'คำตอบ ข้อเสนอแนะ และลายเซ็นของผู้ประเมินท่านที่เลือก',
  },
  summary: {
    title: 'ตารางสรุปผลการประเมิน',
    detail: 'ดัชนีรายข้อ ร้อยละความสอดคล้อง และย่อหน้าสรุป สำหรับแนบภาคผนวก',
  },
  book: {
    title: 'เล่มรวมทั้งชุด',
    detail: 'ฟอร์มเปล่า + ทุกฉบับที่ผู้ทรงกรอก + ตารางสรุป เรียงต่อกันในไฟล์เดียว',
  },
}

export function IocExportPanel({
  formId,
  hasItems,
  experts,
  authorSignatureAvailable,
}: {
  formId: string
  hasItems: boolean
  experts: ExportExpert[]
  authorSignatureAvailable: boolean
}) {
  const submitted = experts.filter(expert => expert.submitted)
  const availability = iocPrintDocAvailability({ hasItems, submittedExpertCount: submitted.length })

  const [options, setOptions] = useState<IocPrintOptions>({
    doc: availability.summary.available ? 'summary' : 'blank',
    expertId: submitted[0]?.id ?? null,
    authorSignature: authorSignatureAvailable,
    expertSignature: true,
    showComments: true,
    showCriteria: true,
    watermark: true,
  })

  const current = availability[options.doc]
  const query = serializeIocPrintOptions(options)
  const href = `/ioc-print/${formId}?${query}`
  // The Word file is the same document under the same options, so it reads the
  // same query string rather than growing a second set of switches.
  const docxHref = `/api/ioc/${formId}/docx-export?${query}`
  const anySignedExpert = submitted.some(expert => expert.signed)

  function set(patch: Partial<IocPrintOptions>) {
    setOptions(previous => ({ ...previous, ...patch }))
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="font-semibold text-foreground">เลือกเอกสาร</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ทุกเอกสารพิมพ์บนกระดาษ A4 ด้วยฟอนต์ Sarabun แบบที่เอกสารราชการไทยใช้
          </p>
        </div>

        <div className="space-y-2">
          {(Object.keys(DOC_LABELS) as IocPrintDoc[]).map(doc => {
            const entry = availability[doc]
            return (
              <label
                key={doc}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  options.doc === doc ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  !entry.available && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="ioc-doc"
                  className="mt-1 size-4"
                  checked={options.doc === doc}
                  disabled={!entry.available}
                  onChange={() => set({ doc, watermark: doc !== 'summary' })}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{DOC_LABELS[doc].title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {entry.available ? DOC_LABELS[doc].detail : entry.reason}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {options.doc === 'expert' && submitted.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground">พิมพ์ฉบับของ</p>
            {submitted.map(expert => (
              <label
                key={expert.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm transition-colors',
                  options.expertId === expert.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="ioc-expert"
                    className="size-4"
                    checked={options.expertId === expert.id}
                    onChange={() => set({ expertId: expert.id })}
                  />
                  <span className="font-medium text-foreground">
                    ผู้ประเมินคนที่ {expert.expert_order} · {expert.display_name}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {expert.signed ? 'ลงนามแล้ว' : 'เว้นเซ็น'}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="text-xs font-bold text-muted-foreground">ลายเซ็น</p>
          <Toggle
            checked={options.authorSignature}
            disabled={!authorSignatureAvailable}
            onChange={value => set({ authorSignature: value })}
            title="แทรกลายเซ็นผู้ออกข้อสอบ"
            detail={authorSignatureAvailable ? 'ใช้วิธีลงนามที่ตั้งไว้ในฟอร์ม' : 'ฟอร์มนี้เลือกเว้นไว้เซ็นด้วยปากกา'}
          />
          <Toggle
            checked={options.expertSignature}
            disabled={options.doc === 'blank' || !anySignedExpert}
            onChange={value => set({ expertSignature: value })}
            title="แทรกลายเซ็นผู้ทรงคุณวุฒิ"
            detail={
              options.doc === 'blank'
                ? 'ฟอร์มเปล่ายังไม่มีผลประเมิน จึงยังไม่มีลายเซ็นให้แทรก'
                : anySignedExpert
                  ? 'ท่านที่เลือกเว้นเซ็นจะได้เส้นประว่างแทน'
                  : 'ยังไม่มีผู้ทรงท่านใดลงนามอิเล็กทรอนิกส์'
            }
          />

          <p className="mt-3 text-xs font-bold text-muted-foreground">ตัวเลือกอื่น</p>
          <Toggle
            checked={options.showComments}
            disabled={options.doc === 'summary'}
            onChange={value => set({ showComments: value })}
            title="แสดงคอลัมน์ข้อเสนอแนะ"
            detail={options.doc === 'summary' ? 'ตารางสรุปไม่มีคอลัมน์นี้' : undefined}
          />
          <Toggle
            checked={options.showCriteria}
            onChange={value => set({ showCriteria: value })}
            title="พิมพ์เกณฑ์ที่ใช้กำกับท้ายหน้า"
          />
          <Toggle
            checked={options.watermark}
            onChange={value => set({ watermark: value })}
            title="ลายน้ำ “สำเนาเพื่อประเมินความสอดคล้อง”"
            detail={options.doc === 'summary' ? 'ปิดไว้เพราะตารางสรุปเป็นเอกสารแนบรายงาน' : undefined}
          />
        </div>

        <Button
          className="w-full justify-center"
          disabled={!current.available}
          render={<a href={href} target="_blank" rel="noopener noreferrer" />}
        >
          เปิดหน้าพิมพ์
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          หน้าพิมพ์จะเปิดในแท็บใหม่ · ในหน้าต่างพิมพ์ของเบราว์เซอร์ เลือกปลายทาง “บันทึกเป็น PDF”
          และปิด “หัวกระดาษและท้ายกระดาษ” เพื่อให้เลขหน้าของเอกสารเป็นเลขเดียวที่ปรากฏ
        </p>

        <div className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            className="w-full justify-center"
            disabled={!current.available}
            render={<a href={docxHref} />}
          >
            ดาวน์โหลดเป็นไฟล์ Word
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            สำหรับเอกสารที่ต้องแก้ถ้อยคำก่อนยื่น · เนื้อหาและตัวเลขชุดเดียวกับหน้าพิมพ์
            Word แบ่งหน้าและนับเลขหน้าให้เอง จึงยังถูกต้องหลังคุณแก้ · ใช้ฟอนต์ TH SarabunPSK
            ถ้าเครื่องไม่มีฟอนต์นี้ Word จะเลือกฟอนต์อื่นแทนและหน้าตาจะขยับเล็กน้อย
            {' '}<b>รูปภาพและสูตรคณิตศาสตร์ไม่ติดไปกับไฟล์นี้</b> รูปจะขึ้นเป็นข้อความบอกตำแหน่งไว้แทน
            ส่วนสูตรจะเป็นโค้ด LaTeX ตามที่พิมพ์ไว้ · ถ้าข้อสอบมีรูปหรือสูตรมาก ให้ใช้ PDF
          </p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            className="w-full justify-center"
            disabled={!availability.summary.available}
            render={<a href={`/api/ioc/${formId}/summary-export`} />}
          >
            ดาวน์โหลดตารางสรุปเป็น Excel
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            สำหรับวางลงแม่แบบรายงานที่ต้นสังกัดใช้อยู่ · ตัวเลขชุดเดียวกับเอกสารที่พิมพ์
            และมีคอลัมน์ข้อเสนอแนะของผู้ทรงรายข้อ
          </p>
        </div>
      </Card>

      <Card padding="lg" className="space-y-3">
        <h2 className="font-semibold text-foreground">เอกสารนี้มีอะไรบ้าง</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{DOC_LABELS[options.doc].detail}</p>
        <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>• หัวกระดาษ คำชี้แจง และเกณฑ์ +1 / 0 / −1 พิมพ์ตามแบบเอกสารราชการ</li>
          <li>• หัวตารางซ้ำทุกหน้า และไม่มีข้อไหนถูกตัดครึ่งข้ามหน้า</li>
          <li>• เลขหน้าเป็น “หน้า x จาก y” นับต่อเนื่องทั้งเอกสาร</li>
          <li>• ช่องตัวชี้วัดผสานให้อัตโนมัติเมื่อหลายข้อใช้ตัวชี้วัดเดียวกัน</li>
          {options.doc === 'book' ? <li>• เรียงฟอร์มเปล่า ฉบับผู้ทรงทุกท่าน แล้วปิดท้ายด้วยตารางสรุป</li> : null}
        </ul>
        {!current.available ? (
          <p className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-foreground">
            {current.reason}
          </p>
        ) : null}
      </Card>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  title,
  detail,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  title: string
  detail?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('flex items-start gap-3 py-2', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {detail ? <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{detail}</span> : null}
      </span>
    </label>
  )
}

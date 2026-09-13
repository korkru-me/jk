'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { saveIocSummaryText } from '@/lib/actions/ioc-forms'
import { formatIocIndex, formatIocPercent, type IocSummary, type IocWarning } from '@/lib/ioc'
import { effectiveIocThreshold } from '@/lib/ioc'

export interface SummaryRow {
  item_id: string
  item_label: string
  standard_label: string
  agree: number
  unsure: number
  disagree: number
  rated_by: number
  index: number | null
  passed: boolean | null
  comments: { expert_order: number; display_name: string; comment: string }[]
}

export function IocSummaryPanel({
  formId,
  summary,
  rows,
  percentRuleLabel,
  invitedCount,
  generatedParagraph,
  savedParagraph,
  paragraphStale,
}: {
  formId: string
  summary: IocSummary
  rows: SummaryRow[]
  percentRuleLabel: string
  invitedCount: number
  generatedParagraph: string
  savedParagraph: string | null
  paragraphStale: boolean
}) {
  const provisional = summary.expertCount < invitedCount
  const failedRows = rows.filter(row => row.passed === false)
  const effective = effectiveIocThreshold(summary.threshold, summary.expertCount)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="lg" className="bg-surface-inverse text-surface-inverse-foreground">
          <p className="text-sm font-semibold">ร้อยละความสอดคล้อง</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {summary.percent === null ? '—' : `${formatIocPercent(summary.percent)}%`}
          </p>
          <p className="mt-2 text-xs text-surface-inverse-muted">
            {summary.percent === null
              ? 'ยังไม่มีผลประเมิน'
              : `ข้อที่ผ่านเกณฑ์ ${summary.passedItemIds.length} จาก ${summary.itemCount} ข้อ · ${percentRuleLabel}`}
          </p>
        </Card>

        <StatCard
          label="ผู้ทรงที่ส่งผลแล้ว"
          value={`${summary.expertCount} จาก ${invitedCount} ท่าน`}
          hint={summary.expertCount > 0 ? `N = ${summary.expertCount}` : 'ยังไม่มีใครส่ง'}
        />
        <StatCard
          label="เกณฑ์ที่ใช้"
          value={formatIocIndex(summary.threshold)}
          hint={
            effective !== null && summary.expertCount > 0
              ? `ผู้ทรง ${summary.expertCount} ท่าน เกณฑ์นี้มีผลเท่ากับ ${formatIocIndex(effective)}`
              : 'IOC ตั้งแต่ค่านี้ถือว่าผ่าน'
          }
        />
        <StatCard
          label="ข้อที่ต้องปรับปรุง"
          value={`${failedRows.length} ข้อ`}
          hint={failedRows.length > 0 ? `ข้อ ${failedRows.map(row => row.item_label).join(', ')}` : 'ยังไม่พบข้อที่ต่ำกว่าเกณฑ์'}
          tone={failedRows.length > 0 ? 'alert' : 'normal'}
        />
      </div>

      {provisional ? (
        <Card padding="md" className="border-warning/30 bg-warning/5">
          <p className="text-sm text-foreground">
            <span className="font-semibold">ผลชั่วคราว</span> — คิดจากผู้ทรงคุณวุฒิ {summary.expertCount} จาก {invitedCount} ท่านที่ส่งแล้ว
            ตัวเลขจะเปลี่ยนเมื่อท่านที่เหลือส่งผล
          </p>
        </Card>
      ) : null}

      {summary.warnings.map(warning => (
        <WarningCard key={warning.kind} warning={warning} rows={rows} />
      ))}

      {failedRows.length > 0 ? (
        <Card padding="md" className="border-destructive/30 bg-destructive/5">
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">
              ข้อ {failedRows.map(row => row.item_label).join(', ')} มีค่าดัชนีต่ำกว่าเกณฑ์ {formatIocIndex(summary.threshold)}
            </span>{' '}
            ตามแนวปฏิบัติควรปรับปรุงข้อคำถามตามข้อเสนอแนะของผู้ทรงคุณวุฒิ หรือตัดออกจากแบบทดสอบก่อนนำไปใช้เก็บข้อมูลจริง
          </p>
        </Card>
      ) : null}

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-xs font-bold text-muted-foreground">
                <th className="px-3 py-2 text-left">ข้อที่</th>
                <th className="px-3 py-2 text-left">มาตรฐานตัวชี้วัด</th>
                <th className="px-3 py-2 text-center">สอดคล้อง<br />(+1)</th>
                <th className="px-3 py-2 text-center">ไม่แน่ใจ<br />(0)</th>
                <th className="px-3 py-2 text-center">ไม่สอดคล้อง<br />(−1)</th>
                <th className="px-3 py-2 text-center">ดัชนีความ<br />สอดคล้อง</th>
                <th className="px-3 py-2 text-center">ผลการตัดสิน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <TableRows key={row.item_id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SummaryParagraph
          formId={formId}
          generated={generatedParagraph}
          saved={savedParagraph}
          stale={paragraphStale}
        />
        <Card padding="lg" className="space-y-3">
          <h2 className="font-semibold text-foreground">วิธีคำนวณที่ใช้</h2>
          <p className="rounded-xl bg-muted px-3 py-2 text-center text-sm font-bold text-foreground">
            IOC = ผลรวมคะแนนผู้ทรง ÷ จำนวนผู้ทรง
          </p>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>ผู้ทรงให้ +1 เมื่อแน่ใจว่าสอดคล้อง, 0 เมื่อไม่แน่ใจ, −1 เมื่อแน่ใจว่าไม่สอดคล้อง</li>
            <li>ค่าที่ได้อยู่ระหว่าง −1.00 ถึง 1.00 · เทียบเกณฑ์ด้วยค่าเต็มก่อนปัดเป็นทศนิยม 2 ตำแหน่ง</li>
            <li>
              ร้อยละความสอดคล้องคิดจาก{percentRuleLabel} · เปลี่ยนเกณฑ์และวิธีคิดร้อยละได้ที่หน้าแก้หัวเอกสาร
            </li>
          </ul>
          <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            ที่มา: Rovinelli &amp; Hambleton (1977) · เกณฑ์ 0.50 ตามตำราไทยที่ใช้กันทั่วไป
          </p>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'normal' | 'alert'
}) {
  return (
    <Card padding="lg" className={cn(tone === 'alert' ? 'border-destructive/30' : undefined)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold', tone === 'alert' ? 'text-destructive' : 'text-foreground')}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

function WarningCard({ warning, rows }: { warning: IocWarning; rows: SummaryRow[] }) {
  const labelsById = new Map(rows.map(row => [row.item_id, row.item_label]))
  const text =
    warning.kind === 'no_ratings'
      ? 'ยังไม่มีผู้ทรงคุณวุฒิส่งผลประเมิน จึงยังไม่มีตัวเลขให้อ่าน'
      : warning.kind === 'few_experts'
        ? `มีผู้ทรงคุณวุฒิที่ส่งผลแล้วเพียง ${warning.expertCount} ท่าน ซึ่งน้อยกว่าที่งานวิจัยทั่วไปใช้ (3 ท่าน)`
        : warning.kind === 'even_expert_count'
          ? `ผู้ทรงคุณวุฒิเป็นจำนวนคู่ (${warning.expertCount} ท่าน) ค่าดัชนีอาจออกมาคาบเกณฑ์พอดี`
          : `บางข้อมีผู้ประเมินไม่ครบทุกท่าน: ข้อ ${warning.itemIds.map(id => labelsById.get(id) ?? id).join(', ')} · ค่าดัชนีของข้อเหล่านี้คิดจากจำนวนคนที่ประเมินจริง`

  return (
    <Card padding="md" className="border-warning/30 bg-warning/5">
      <p className="text-sm leading-relaxed text-foreground">{text}</p>
    </Card>
  )
}

function TableRows({ row }: { row: SummaryRow }) {
  const failed = row.passed === false
  return (
    <>
      <tr className={cn('border-t', failed ? 'bg-destructive/5' : undefined)}>
        <td className="px-3 py-2 font-semibold text-foreground">{row.item_label}</td>
        <td className="px-3 py-2 text-muted-foreground">{row.standard_label || '—'}</td>
        <td className="px-3 py-2 text-center text-foreground">{row.agree}</td>
        <td className="px-3 py-2 text-center text-foreground">{row.unsure}</td>
        <td className="px-3 py-2 text-center text-foreground">{row.disagree}</td>
        <td className="px-3 py-2 text-center font-bold text-foreground">{formatIocIndex(row.index)}</td>
        <td className="px-3 py-2 text-center">
          {row.passed === null ? (
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">ยังไม่มีผล</span>
          ) : row.passed ? (
            <span className="rounded-full bg-success/15 px-2 py-1 text-xs font-bold text-success">ผ่าน</span>
          ) : (
            <span className="rounded-full bg-destructive/15 px-2 py-1 text-xs font-bold text-destructive">ต่ำกว่าเกณฑ์</span>
          )}
        </td>
      </tr>
      {row.comments.length > 0 ? (
        <tr className={cn('border-t border-dashed', failed ? 'bg-destructive/5' : 'bg-muted/50')}>
          <td className="px-3 pb-3 text-xs text-muted-foreground" colSpan={7}>
            <span className="font-bold">ข้อเสนอแนะข้อ {row.item_label}</span>
            {row.comments.map(comment => (
              <span key={`${comment.expert_order}-${comment.comment}`} className="block leading-relaxed">
                ผู้ประเมินคนที่ {comment.expert_order} ({comment.display_name}): “{comment.comment}”
              </span>
            ))}
          </td>
        </tr>
      ) : null}
    </>
  )
}

function SummaryParagraph({
  formId,
  generated,
  saved,
  stale,
}: {
  formId: string
  generated: string
  saved: string | null
  stale: boolean
}) {
  const [text, setText] = useState(saved ?? generated)
  const [pending, startTransition] = useTransition()
  const edited = saved !== null

  function save(value: string) {
    startTransition(async () => {
      const result = await saveIocSummaryText({ form_id: formId, summary_text: value })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(value.trim() ? 'บันทึกข้อความสรุปแล้ว' : 'กลับไปใช้ข้อความที่ระบบสร้างแล้ว')
    })
  }

  return (
    <Card padding="lg" className="space-y-3">
      <div>
        <h2 className="font-semibold text-foreground">ย่อหน้าสรุปผลการประเมิน</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          ระบบเขียนให้จากตัวเลขจริง แก้ถ้อยคำได้ตามรูปแบบที่ต้นสังกัดใช้
          {edited ? ' · ขณะนี้ใช้ข้อความที่คุณแก้ไว้' : ' · ขณะนี้ใช้ข้อความที่ระบบสร้าง'}
        </p>
      </div>

      {stale ? (
        <p className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-foreground">
          มีผลประเมินเปลี่ยนหลังจากคุณแก้ข้อความนี้ ตัวเลขในย่อหน้าอาจไม่ตรงกับตารางด้านบนแล้ว
        </p>
      ) : null}

      {generated ? (
        <Textarea rows={6} value={text} onChange={event => setText(event.target.value)} />
      ) : (
        <p className="rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
          ยังไม่มีผลประเมินพอจะสรุป
        </p>
      )}

      {generated ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            disabled={pending || text === generated}
            onClick={() => {
              setText(generated)
              save('')
            }}
          >
            ใช้ข้อความที่ระบบสร้าง
          </Button>
          <Button disabled={pending} onClick={() => save(text)}>
            {pending ? 'กำลังบันทึก…' : 'บันทึกข้อความ'}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

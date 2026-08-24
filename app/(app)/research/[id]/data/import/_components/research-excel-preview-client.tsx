'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Download, Eye, FileSpreadsheet, Info, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmEducationResearchImportBatch } from '@/lib/actions/education-research'
import { formatResearchScore } from '@/lib/education-research-scores'
import { cn } from '@/lib/utils'
import type { EducationResearchImportBatch, EducationResearchImportBatchRow, EducationResearchImportScoreAction } from '@/lib/types'
import { ImportSteps } from './research-excel-import-client'

export function ResearchExcelPreviewClient({ projectId, batch, rows, pretestMax, posttestMax, pairedCount, participantCount }: { projectId: string; batch: EducationResearchImportBatch; rows: EducationResearchImportBatchRow[]; pretestMax: number | null; posttestMax: number | null; pairedCount: number; participantCount: number }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | 'ready' | 'warning' | 'error'>('all')
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const confirmed = batch.status === 'confirmed'
  const counts = useMemo(() => summarizeActions(rows), [rows])
  const filteredRows = filter === 'all' ? rows : rows.filter(row => row.validation_status === filter)
  const canConfirm = batch.status === 'previewed' && batch.error_count === 0 && (batch.warning_count === 0 || overwriteConfirmed)

  function confirmImport() {
    if (!canConfirm || pending) return
    startTransition(async () => {
      const result = await confirmEducationResearchImportBatch({ project_id: projectId, batch_id: batch.id, confirm_overwrites: overwriteConfirmed })
      if (result.error) { toast.error(result.error); return }
      toast.success('นำเข้าคะแนนครบทั้งไฟล์แล้ว')
      setDialogOpen(false)
      router.refresh()
    })
  }

  if (confirmed) {
    return <ImportSuccess projectId={projectId} batch={batch} rows={rows} counts={counts} pairedCount={pairedCount} participantCount={participantCount} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} pretestMax={pretestMax} posttestMax={posttestMax} />
  }

  return (
    <>
      <ImportSteps current={3} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="แถวทั้งหมด" value={batch.row_count} icon={FileSpreadsheet} /><SummaryCard label="พร้อมนำเข้า" value={batch.ready_count} icon={CheckCircle2} tone="success" /><SummaryCard label="คำเตือน" value={batch.warning_count} icon={AlertTriangle} tone="warning" /><SummaryCard label="ข้อผิดพลาด" value={batch.error_count} icon={XCircle} tone="destructive" /></div>

      {batch.error_count > 0 && <Card padding="md" className="border-destructive/30 bg-destructive/5"><div className="flex gap-3"><XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" /><div><p className="font-semibold text-foreground">ยังนำเข้าไม่ได้ เพราะพบข้อผิดพลาด {batch.error_count} แถว</p><p className="mt-1 text-sm text-muted-foreground">ระบบจะไม่บันทึกคะแนนบางส่วน กรุณาแก้ไฟล์เดิมแล้วอัปโหลดใหม่ให้ผ่านทั้งชุด</p></div></div></Card>}
      {batch.error_count === 0 && batch.warning_count > 0 && <Card padding="md" className="border-warning/30 bg-warning/5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><p className="font-semibold text-foreground">มีคะแนนเดิมที่จะถูกแทนที่ {counts.update} ค่า</p><p className="mt-1 text-sm text-muted-foreground">ตรวจค่าเดิมและค่าใหม่ในตาราง แล้วติ๊กยืนยันด้านล่างก่อนนำเข้า</p></div></div></Card>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{([['all', `ทั้งหมด ${rows.length}`], ['ready', `พร้อม ${batch.ready_count}`], ['warning', `คำเตือน ${batch.warning_count}`], ['error', `ผิดพลาด ${batch.error_count}`]] as const).map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}</div><p className="text-sm text-muted-foreground">ไฟล์: {batch.file_name}</p></div>
      <ImportRowsTable rows={filteredRows} pretestMax={pretestMax} posttestMax={posttestMax} />

      <Card padding="lg" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4"><ActionStat label="คะแนนใหม่" value={counts.add} /><ActionStat label="เขียนทับ" value={counts.update} tone="warning" /><ActionStat label="ไม่เปลี่ยน" value={counts.unchanged} /><ActionStat label="ช่องว่างคงคะแนนเดิม" value={counts.keptByBlank} /></div>
        <label className={cn('flex items-start gap-3 rounded-xl border p-4', batch.error_count > 0 ? 'cursor-not-allowed border-border bg-muted/30 opacity-60' : 'cursor-pointer border-warning/30 bg-warning/5')}><input type="checkbox" className="mt-1 size-4 accent-primary" checked={overwriteConfirmed} onChange={event => setOverwriteConfirmed(event.target.checked)} disabled={batch.error_count > 0 || batch.warning_count === 0} /><span><span className="font-semibold text-foreground">ฉันตรวจสอบคะแนนเดิมและคะแนนใหม่แล้ว</span><span className="mt-1 block text-sm text-muted-foreground">ต้องยืนยันเมื่อมีการเขียนทับ คะแนนเดิม–ใหม่ ผู้ยืนยัน และเวลาจะถูกบันทึกในประวัติ</span></span></label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><div className="flex flex-wrap gap-2"><Button variant="outline" render={<Link href={`/research/${projectId}/data/import`} />}><RotateCcw aria-hidden="true" /> กลับไปอัปโหลด</Button>{batch.error_count > 0 && <Button variant="outline" onClick={() => downloadIssues(batch, rows)}><Download aria-hidden="true" /> ดาวน์โหลดรายการที่ต้องแก้</Button>}</div><Button onClick={() => setDialogOpen(true)} disabled={!canConfirm || pending}><ShieldCheck aria-hidden="true" /> ยืนยันนำเข้าคะแนน</Button></div>
        <p className="text-xs text-muted-foreground"><Info className="mr-1 inline size-3.5" aria-hidden="true" />ก่อนบันทึก ระบบจะตรวจสิทธิ์ รายชื่อ คะแนนเต็ม และคะแนนปัจจุบันซ้ำ หากข้อมูลเปลี่ยนจะยกเลิกทั้งชุด</p>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>ยืนยันนำเข้าคะแนนทั้งไฟล์</DialogTitle><DialogDescription>ยังไม่มีคะแนนถูกเปลี่ยนจนกว่าการตรวจซ้ำและ transaction นี้จะสำเร็จทั้งหมด</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><ActionStat label="แถว" value={rows.length} /><ActionStat label="คะแนนใหม่" value={counts.add} /><ActionStat label="เขียนทับ" value={counts.update} tone="warning" /><ActionStat label="คงเดิมจากช่องว่าง" value={counts.keptByBlank} /></div><Card padding="sm" className="border-primary/20 bg-primary/5"><p className="text-sm text-muted-foreground">หากมีนักเรียนเพิ่มหลังสร้างแม่แบบ นักเรียนคนนั้นจะยังไม่มีคะแนนจากไฟล์นี้ การเขียนทับทุกค่ามีประวัติ และหากข้อมูลเปลี่ยนระหว่างตรวจ ระบบจะยกเลิกทั้งชุด</p></Card><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>กลับไปตรวจสอบ</Button><Button onClick={confirmImport} disabled={pending}>{pending ? 'กำลังตรวจและนำเข้า…' : 'ยืนยันและนำเข้า'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}

function ImportSuccess({ projectId, batch, rows, counts, pairedCount, participantCount, detailsOpen, setDetailsOpen, pretestMax, posttestMax }: { projectId: string; batch: EducationResearchImportBatch; rows: EducationResearchImportBatchRow[]; counts: ActionCounts; pairedCount: number; participantCount: number; detailsOpen: boolean; setDetailsOpen: (open: boolean) => void; pretestMax: number | null; posttestMax: number | null }) {
  const missing = participantCount - pairedCount
  return <><ImportSteps current={3} complete /><Card padding="xl" className="border-success/30 bg-success/5"><div className="mx-auto max-w-2xl text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success text-success-foreground"><CheckCircle2 className="size-8" aria-hidden="true" /></div><h2 className="mt-4 text-2xl font-bold text-foreground">นำเข้าคะแนนสำเร็จครบทั้งไฟล์</h2><p className="mt-2 text-sm text-muted-foreground">คะแนนถูกบันทึกหลังการตรวจซ้ำสำเร็จแล้ว ไฟล์ต้นฉบับไม่ได้ถูกสร้างเป็นลิงก์สาธารณะ</p></div></Card><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="แถวที่ตรวจ" value={rows.length} icon={FileSpreadsheet} /><SummaryCard label="คะแนนใหม่" value={counts.add} icon={CheckCircle2} tone="success" /><SummaryCard label="คะแนนที่เขียนทับ" value={counts.update} icon={AlertTriangle} tone="warning" /><SummaryCard label="คงคะแนนเดิม" value={counts.unchanged + counts.keptByBlank} icon={ShieldCheck} /></div><Card padding="lg"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-foreground">คู่คะแนนพร้อมวิเคราะห์ {pairedCount}/{participantCount} คน</p><p className="mt-1 text-sm text-muted-foreground">{missing > 0 ? `ยังขาดคู่คะแนน ${missing} คน ซึ่งจะไม่ถูกนับเป็นศูนย์` : 'ผู้เข้าร่วมทุกคนมีคะแนนก่อนและหลังเรียนครบคู่แล้ว'}</p></div>{missing > 0 && <Button variant="outline" render={<Link href={`/research/${projectId}/data?status=missing`} />}>ดูคะแนนที่ยังขาด</Button>}</div></Card><Card padding="md" className="text-sm text-muted-foreground"><p>รหัสรายการนำเข้า: <span className="font-mono text-foreground">{batch.id}</span></p><p className="mt-1">สำเร็จเมื่อ: {batch.confirmed_at ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(batch.confirmed_at)) : '—'}</p><p className="mt-1">ระบบเก็บค่าเดิม ค่าใหม่ ผู้ยืนยัน และเวลาไว้ในประวัติการแก้ไขคะแนน</p></Card><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setDetailsOpen(true)}><Eye aria-hidden="true" /> ดูรายละเอียดครั้งนี้</Button><Button variant="outline" render={<Link href={`/research/${projectId}/data/import`} />}>นำเข้าไฟล์อื่น</Button><Button render={<Link href={`/research/${projectId}/data`} />}>กลับหน้าข้อมูลคะแนน</Button></div><Dialog open={detailsOpen} onOpenChange={setDetailsOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>รายละเอียดรายการนำเข้า</DialogTitle><DialogDescription>ข้อมูลเปรียบเทียบที่บันทึกไว้แบบอ่านอย่างเดียวจากรายการ {batch.id}</DialogDescription></DialogHeader><ImportRowsTable rows={rows} pretestMax={pretestMax} posttestMax={posttestMax} /></DialogContent></Dialog></>
}

function ImportRowsTable({ rows, pretestMax, posttestMax }: { rows: EducationResearchImportBatchRow[]; pretestMax: number | null; posttestMax: number | null }) {
  return <Card padding="none" className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/70 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">แถว</th><th className="px-4 py-3 font-medium">นักเรียน</th><th className="px-4 py-3 font-medium">ก่อนเรียน ปัจจุบัน → ไฟล์</th><th className="px-4 py-3 font-medium">หลังเรียน ปัจจุบัน → ไฟล์</th><th className="px-4 py-3 font-medium">สถานะ</th><th className="px-4 py-3 font-medium">รายละเอียด</th></tr></thead><tbody className="divide-y divide-border">{rows.map(row => <tr key={row.id} className={row.validation_status === 'error' ? 'bg-destructive/5' : row.validation_status === 'warning' ? 'bg-warning/5' : undefined}><td className="px-4 py-3 text-muted-foreground">{row.row_number >= 100000 ? 'ไม่มีในไฟล์' : row.row_number}</td><td className="px-4 py-3"><p className="font-medium text-foreground">{row.full_name_file ?? 'ไม่พบชื่อ'}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.student_code_file ?? 'ไม่มีรหัสนักเรียน'}</p></td><td className="px-4 py-3"><ScoreChange current={row.current_pretest} incoming={row.incoming_pretest} max={pretestMax} action={row.pretest_action} /></td><td className="px-4 py-3"><ScoreChange current={row.current_posttest} incoming={row.incoming_posttest} max={posttestMax} action={row.posttest_action} /></td><td className="px-4 py-3"><StatusBadge status={row.validation_status} /></td><td className="max-w-xs px-4 py-3 text-xs text-muted-foreground"><p>{row.messages.length > 0 ? row.messages.join(' · ') : 'ผ่านการตรวจสอบ'}</p>{row.note_file && <p className="mt-1 text-foreground">หมายเหตุ: {row.note_file}</p>}</td></tr>)}</tbody></table></div></Card>
}

function ScoreChange({ current, incoming, max, action }: { current: number | null; incoming: number | null; max: number | null; action: EducationResearchImportScoreAction | null }) { const currentText = current === null ? '—' : `${formatResearchScore(Number(current))}/${formatResearchScore(max)}`; const incomingText = incoming === null ? 'ว่าง (คงเดิม)' : `${formatResearchScore(Number(incoming))}/${formatResearchScore(max)}`; return <div><p className="font-medium text-foreground">{currentText} <span className="px-1 text-muted-foreground">→</span> <span className={action === 'update' ? 'text-warning' : action === 'add' ? 'text-success' : 'text-foreground'}>{incomingText}</span></p><p className="mt-0.5 text-xs text-muted-foreground">{actionLabel(action)}</p></div> }
function StatusBadge({ status }: { status: EducationResearchImportBatchRow['validation_status'] }) { return <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-medium', status === 'ready' ? 'bg-success/10 text-success' : status === 'warning' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive')}>{status === 'ready' ? 'พร้อมนำเข้า' : status === 'warning' ? 'คำเตือน' : 'ข้อผิดพลาด'}</span> }
function SummaryCard({ label, value, icon: Icon, tone = 'primary' }: { label: string; value: number; icon: typeof FileSpreadsheet; tone?: 'primary' | 'success' | 'warning' | 'destructive' }) { const color = tone === 'success' ? 'bg-success/10 text-success' : tone === 'warning' ? 'bg-warning/10 text-warning' : tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'; return <Card padding="lg"><div className="flex items-center gap-3"><div className={cn('flex size-10 items-center justify-center rounded-xl', color)}><Icon className="size-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold text-foreground">{value}</p></div></div></Card> }
function ActionStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' }) { return <div className={cn('rounded-xl border p-3', tone === 'warning' ? 'border-warning/30 bg-warning/5' : 'border-border')}><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 text-xl font-bold', tone === 'warning' ? 'text-warning' : 'text-foreground')}>{value}</p></div> }

interface ActionCounts { add: number; update: number; unchanged: number; blank: number; keptByBlank: number }
function summarizeActions(rows: EducationResearchImportBatchRow[]): ActionCounts { const counts: ActionCounts = { add: 0, update: 0, unchanged: 0, blank: 0, keptByBlank: 0 }; for (const row of rows) { for (const [action, current] of [[row.pretest_action, row.current_pretest], [row.posttest_action, row.current_posttest]] as const) { if (action) counts[action] += 1; if (action === 'blank' && current !== null) counts.keptByBlank += 1 } } return counts }
function actionLabel(action: EducationResearchImportScoreAction | null): string { return action === 'add' ? 'เพิ่มคะแนนใหม่' : action === 'update' ? 'แทนที่คะแนนเดิม' : action === 'unchanged' ? 'ค่าเดิม ไม่เปลี่ยน' : action === 'blank' ? 'ช่องว่าง ไม่ลบคะแนนเดิม' : '—' }

function downloadIssues(batch: EducationResearchImportBatch, rows: EducationResearchImportBatchRow[]) {
  const issueRows = rows.filter(row => row.validation_status === 'error')
  const csv = [['แถว', 'นักเรียน', 'รหัสนักเรียน', 'ปัญหา'], ...issueRows.map(row => [row.row_number >= 100000 ? 'ไม่มีในไฟล์' : String(row.row_number), row.full_name_file ?? '', row.student_code_file ?? '', row.messages.join(' | ')])].map(cells => cells.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `KorKru-import-issues-${batch.id.slice(0, 8)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
function csvCell(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safeValue.replaceAll('"', '""')}"`
}

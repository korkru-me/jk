'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HardDrive, Loader2, Trash2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { findOrphanFiles, deleteOrphanFiles, type OrphanReport } from '@/lib/actions/storage-cleanup'
import { formatBytes } from '@/lib/storage-orphans'

/**
 * Clearing out files nothing points at any more.
 *
 * Deliberately two presses, with the list of what would go shown in between.
 * The sweep deletes real files out of a real bucket, and the difference
 * between "a few stale kilobytes" and "the picture in a โจทย์ I use every year"
 * is not something a teacher should have to take on trust from a button.
 */
export function StorageSettings() {
  const [reports, setReports] = useState<OrphanReport[] | null>(null)
  const [graceDays, setGraceDays] = useState(7)
  const [scanning, startScan] = useTransition()
  const [clearing, startClear] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  function scan() {
    startScan(async () => {
      const result = await findOrphanFiles()
      if ('error' in result) {
        toast.error(result.error)
        setReports(null)
        return
      }
      setReports(result.reports)
      setGraceDays(result.graceDays)
      const total = result.reports.reduce((sum, r) => sum + r.orphans.length, 0)
      toast.success(total === 0 ? 'ไม่พบไฟล์ที่ไม่ได้ใช้แล้ว' : `พบไฟล์ที่ไม่ได้ใช้แล้ว ${total} ไฟล์`)
    })
  }

  async function clear(report: OrphanReport) {
    const ok = await confirm({
      title: `ลบไฟล์ที่ไม่ได้ใช้แล้ว ${report.orphans.length} ไฟล์?`,
      description:
        `รวม ${formatBytes(report.orphanBytes)} จาก “${report.label}” — ลบถาวร กู้คืนไม่ได้ · ` +
        'ระบบจะตรวจซ้ำอีกครั้งตอนกดลบ ไฟล์ไหนถูกนำไปใช้ไปแล้วระหว่างนี้จะถูกข้ามไว้ให้เอง',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return

    startClear(async () => {
      const result = await deleteOrphanFiles(report.bucket, report.orphans.map(f => f.path))
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.deleted === 0
          ? 'ไม่ได้ลบอะไร — ไฟล์ทั้งหมดถูกนำไปใช้แล้ว'
          : `ลบแล้ว ${result.deleted} ไฟล์ คืนพื้นที่ ${formatBytes(result.freedBytes)}` +
            (result.skipped > 0 ? ` · ข้ามไว้ ${result.skipped} ไฟล์ที่เพิ่งถูกนำไปใช้` : '')
      )
      scan()
    })
  }

  const totalOrphans = reports?.reduce((sum, r) => sum + r.orphans.length, 0) ?? 0

  return (
    <div className="space-y-4">
      {confirmDialog}

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <HardDrive size={17} className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">พื้นที่จัดเก็บไฟล์</p>
            <p className="text-xs text-muted-foreground">เก็บกวาดรูปและไฟล์ที่ไม่มีโจทย์หรือคำตอบไหนใช้แล้ว</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              ไฟล์ถูกอัปโหลดทันทีที่เลือก แต่จะมี “เจ้าของ” ก็ต่อเมื่อกดบันทึกโจทย์
              ถ้าแนบรูปแล้วปิดหน้าไปเฉยๆ หรือลบโจทย์ทิ้ง ไฟล์นั้นจะค้างอยู่โดยไม่มีใครใช้
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-success" />
              <span>
                ระบบจะไม่แตะไฟล์ที่ยังมีโจทย์หรือคำตอบของนักเรียนอ้างถึงอยู่
                และไม่แตะไฟล์ที่เพิ่งอัปโหลดภายใน {graceDays} วัน เผื่อว่ายังกรอกฟอร์มค้างอยู่อีกแท็บ
              </span>
            </p>
          </div>

          <Button onClick={scan} disabled={scanning || clearing} variant="outline" className="gap-2">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {scanning ? 'กำลังตรวจสอบ...' : 'ตรวจสอบไฟล์ที่ไม่ได้ใช้แล้ว'}
          </Button>
        </div>
      </Card>

      {reports && (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/20">
            <p className="font-semibold text-sm">
              {totalOrphans === 0 ? 'ไม่พบไฟล์ที่ไม่ได้ใช้แล้ว' : `พบไฟล์ที่ไม่ได้ใช้แล้ว ${totalOrphans} ไฟล์`}
            </p>
          </div>

          <div className="divide-y">
            {reports.map(report => (
              <div key={report.bucket} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{report.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {report.orphans.length > 0
                      ? `ไม่ได้ใช้แล้ว ${report.orphans.length} ไฟล์ · ${formatBytes(report.orphanBytes)}`
                      : 'ไม่มีไฟล์ที่ต้องเก็บกวาด'}
                    {' · '}
                    ยังใช้อยู่ {report.keptInUse} ไฟล์
                    {report.keptRecent > 0 && ` · เพิ่งอัปโหลด ${report.keptRecent} ไฟล์`}
                  </p>
                </div>
                {report.orphans.length > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 shrink-0"
                    disabled={clearing || scanning}
                    onClick={() => clear(report)}
                  >
                    {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    ลบ {report.orphans.length} ไฟล์
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

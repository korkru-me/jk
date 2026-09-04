'use client'

import { useState, type ReactNode } from 'react'
import {
  Download,
  FileSpreadsheet,
  Info,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { EducationResearchExportMode } from '@/lib/education-research-export'
import { cn } from '@/lib/utils'

export function ResearchDataExportDialog({
  projectId,
  participantCount,
}: {
  projectId: string
  participantCount: number
}) {
  const [mode, setMode] = useState<EducationResearchExportMode>('anonymous')
  const [downloading, setDownloading] = useState(false)

  async function download() {
    if (downloading) return
    setDownloading(true)
    try {
      const response = await fetch(`/api/research/${projectId}/data-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || 'ดาวน์โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = responseFileName(response.headers.get('Content-Disposition'))
        ?? `KorKru-ข้อมูลวิจัย-${mode === 'anonymous' ? 'ไม่ระบุตัวตน' : 'มีชื่อและรหัส'}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
      toast.success('สร้างไฟล์ Excel จากข้อมูลล่าสุดแล้ว')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ดาวน์โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <Download aria-hidden="true" />
        ดาวน์โหลดข้อมูลที่ใช้
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">ดาวน์โหลดข้อมูลที่ใช้</DialogTitle>
          <DialogDescription>
            เลือกชนิดไฟล์ Excel สำหรับข้อมูลรายบุคคล {participantCount.toLocaleString('th-TH')} คน
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-3">
          <legend className="sr-only">ชนิดข้อมูลในไฟล์</legend>
          <ExportModeOption
            checked={mode === 'anonymous'}
            onChange={() => setMode('anonymous')}
            value="anonymous"
            title="ไม่ระบุตัวตน (แนะนำ)"
            description="ไม่ใส่ชื่อ รหัสนักเรียน UUID หรือเลขที่ในห้อง ระบบสุ่มลำดับใหม่แล้วใช้รหัสผู้เข้าร่วม P001, P002 แทน"
            badge={<><ShieldCheck aria-hidden="true" />ลดการเปิดเผยข้อมูลส่วนบุคคล</>}
            badgeClassName="bg-success/10 text-success"
          />
          <ExportModeOption
            checked={mode === 'identified'}
            onChange={() => setMode('identified')}
            value="identified"
            title="มีชื่อและรหัสนักเรียน"
            description="สำหรับตรวจสอบข้อมูลภายในเท่านั้น ไฟล์จะมีเลขที่ ชื่อ รหัสนักเรียน และคะแนนรายบุคคล"
            badge={<><LockKeyhole aria-hidden="true" />ข้อมูลส่วนบุคคล</>}
            badgeClassName="bg-warning/10 text-warning"
          />
        </fieldset>

        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">ข้อมูลในไฟล์</p>
              <p className="mt-1 text-sm text-muted-foreground">
                คะแนนก่อนเรียน · คะแนนหลังเรียน · สถานะข้อมูลครบคู่ · ผลผ่านเกณฑ์ · เหตุผลที่ไม่ถูกนำไปวิเคราะห์
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              ไฟล์สร้างใหม่จากข้อมูลล่าสุดและไม่ถูกเก็บเป็นลิงก์สาธารณะ กรุณาจำกัดผู้เข้าถึงและลบเมื่อหมดความจำเป็น
              {mode === 'anonymous' && ' แม้ไม่มีชื่อและรหัส คะแนนรายบุคคลอาจเชื่อมโยงกลับได้เมื่อรวมกับข้อมูลอื่น'}
            </p>
          </div>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground sm:max-w-sm">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            ระบบบันทึกผู้ดาวน์โหลด เวลา ชนิดไฟล์ และจำนวนแถว โดยไม่บันทึกชื่อหรือคะแนนลง application log
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button type="button" variant="outline" disabled={downloading} />}>
              ยกเลิก
            </DialogClose>
            <Button type="button" onClick={download} disabled={downloading}>
              <FileSpreadsheet aria-hidden="true" />
              {downloading
                ? 'กำลังสร้างไฟล์…'
                : `ดาวน์โหลด Excel ${mode === 'anonymous' ? 'ไม่ระบุตัวตน' : 'มีชื่อและรหัส'}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExportModeOption({
  checked,
  onChange,
  value,
  title,
  description,
  badge,
  badgeClassName,
}: {
  checked: boolean
  onChange: () => void
  value: EducationResearchExportMode
  title: string
  description: string
  badge: ReactNode
  badgeClassName: string
}) {
  return (
    <label className={cn(
      'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
      checked ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/40',
    )}>
      <input
        type="radio"
        name="research-export-mode"
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        <span className={cn('mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium [&_svg]:size-3.5', badgeClassName)}>
          {badge}
        </span>
      </span>
    </label>
  )
}

function responseFileName(contentDisposition: string | null): string | null {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (!encoded) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

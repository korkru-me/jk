'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Download, FileSpreadsheet, Info, LockKeyhole, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { EducationResearchExcelMeasurement } from '@/lib/education-research-excel'

export function ResearchExcelImportClient({ projectId, classroomName, participantCount, pretest, posttest }: { projectId: string; classroomName: string; participantCount: number; pretest: EducationResearchExcelMeasurement | null; posttest: EducationResearchExcelMeasurement | null }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  function chooseFile(candidate: File | null) {
    if (!candidate) return
    if (!candidate.name.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
      toast.error('รองรับเฉพาะไฟล์ .xlsx ที่ดาวน์โหลดจาก KorKru')
      return
    }
    if (candidate.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์มีขนาดเกิน 5 MB')
      return
    }
    setFile(candidate)
  }

  async function previewFile() {
    if (!file || uploading) return
    setUploading(true)
    const body = new FormData()
    body.set('file', file)
    try {
      const response = await fetch(`/api/research/${projectId}/score-import`, { method: 'POST', body })
      const result = await response.json() as { error?: string; preview_url?: string }
      if (!response.ok || !result.preview_url) {
        toast.error(result.error ?? 'ตรวจไฟล์ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      router.push(result.preview_url)
    } catch {
      toast.error('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setUploading(false)
    }
  }

  async function downloadTemplate() {
    if (downloading) return
    setDownloading(true)
    try {
      const response = await fetch(`/api/research/${projectId}/score-template`, { method: 'POST' })
      if (!response.ok) {
        const result = await response.json() as { error?: string }
        toast.error(result.error ?? 'ดาวน์โหลดแม่แบบไม่สำเร็จ')
        return
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const fileName = encodedName ? decodeURIComponent(encodedName) : 'KorKru-research-scores.xlsx'
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <ImportSteps current={file ? 2 : 1} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card padding="lg" className="space-y-5">
          <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"><Download className="size-5" aria-hidden="true" /></div><div><h2 className="text-lg font-semibold text-foreground">1. ดาวน์โหลดแม่แบบเฉพาะโครงการ</h2><p className="mt-1 text-sm text-muted-foreground">ระบบสร้างใหม่จากรายชื่อผู้เข้าร่วมและคะแนนปัจจุบันทุกครั้ง</p></div></div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm"><p className="font-semibold text-foreground">ห้อง {classroomName}</p><p className="mt-1 text-muted-foreground">ผู้เข้าร่วม {participantCount} คน · {measurementSummary('ก่อนเรียน', pretest)} · {measurementSummary('หลังเรียน', posttest)}</p></div>
          <div className="space-y-2 text-sm text-muted-foreground"><p className="flex gap-2"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />เลขที่ รหัสนักเรียน และชื่อถูกล็อกไว้</p><p className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />กรอกได้เฉพาะคะแนนรอบที่กำหนดเป็น Excel และหมายเหตุ</p><p className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />ระบบจับคู่ด้วยรหัสแถวที่ซ่อนอยู่ ไม่ใช้ชื่อหรือลำดับ</p></div>
          <Button className="w-full sm:w-auto" onClick={downloadTemplate} disabled={downloading}><Download aria-hidden="true" /> {downloading ? 'กำลังสร้างแม่แบบ…' : 'ดาวน์โหลดแม่แบบ .xlsx'}</Button>
        </Card>

        <Card padding="lg" className="space-y-5">
          <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UploadCloud className="size-5" aria-hidden="true" /></div><div><h2 className="text-lg font-semibold text-foreground">2. อัปโหลดไฟล์ที่กรอกแล้ว</h2><p className="mt-1 text-sm text-muted-foreground">ขั้นนี้ตรวจข้อมูลเท่านั้น ยังไม่บันทึกคะแนนจริง</p></div></div>
          <label
            htmlFor="research-score-workbook"
            className={cn('flex min-h-48 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors', dragging ? 'border-primary bg-primary/5' : file ? 'border-success/40 bg-success/5' : 'border-border hover:border-primary/50 hover:bg-muted/30')}
            onDragEnter={event => { event.preventDefault(); setDragging(true) }}
            onDragOver={event => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0] ?? null) }}
          >
            <FileSpreadsheet className={cn('size-10', file ? 'text-success' : 'text-primary')} aria-hidden="true" />
            <p className="mt-3 font-semibold text-foreground">{file ? file.name : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{file ? `${formatFileSize(file.size)} · พร้อมตรวจสอบ` : 'เฉพาะ .xlsx จาก KorKru ขนาดไม่เกิน 5 MB'}</p>
          </label>
          <input id="research-score-workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={event => chooseFile(event.target.files?.[0] ?? null)} />
          <Button className="w-full" onClick={previewFile} disabled={!file || uploading}><UploadCloud aria-hidden="true" /> {uploading ? 'กำลังตรวจไฟล์…' : 'ตรวจสอบข้อมูล'} </Button>
          <p className="text-center text-xs text-muted-foreground">ไม่มีคะแนนถูกเขียนจนกว่าคุณจะตรวจตัวอย่างและกดยืนยันในขั้นถัดไป</p>
        </Card>
      </div>

      <Card padding="md" className="border-warning/30 bg-warning/5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><p className="font-semibold text-foreground">ก่อนอัปโหลด</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>อย่าเพิ่ม ลบ สลับ หรือแก้ข้อมูลระบุตัวนักเรียน</li><li>ช่องว่างหมายถึงยังไม่มีค่าใหม่และไม่ลบคะแนนเดิม ส่วนคะแนนศูนย์ต้องพิมพ์ 0</li><li>ไฟล์มีข้อมูลนักเรียน ระบบอ่านในหน่วยความจำและไม่สร้างลิงก์สาธารณะให้ไฟล์ต้นฉบับ</li></ul></div></div></Card>
    </>
  )
}

export function ImportSteps({ current, complete = false }: { current: 1 | 2 | 3; complete?: boolean }) {
  const steps = ['ดาวน์โหลดแม่แบบ', 'อัปโหลดไฟล์', 'ตรวจสอบและยืนยัน']
  return <Card padding="md"><ol className="grid gap-3 sm:grid-cols-3">{steps.map((label, index) => { const step = index + 1; const done = complete || step < current; const active = !complete && step === current; return <li key={label} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', active ? 'bg-primary/10 font-semibold text-primary' : done ? 'text-success' : 'text-muted-foreground')}><span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border font-semibold', active ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-success bg-success text-success-foreground' : 'border-border')}>{done ? <Check className="size-4" aria-hidden="true" /> : step}</span>{label}</li> })}</ol></Card>
}

function measurementSummary(label: string, measurement: EducationResearchExcelMeasurement | null): string {
  if (!measurement) return `${label}ยังไม่กำหนด`
  return measurement.source_type === 'excel' ? `${label}เต็ม ${measurement.max_score ?? '—'}` : `${label}ดูอย่างเดียว`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

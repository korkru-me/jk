'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { proctorReportFilenameFromDisposition } from '@/lib/exam-proctor-report'

export interface ProctorReportFilters {
  studentId: string | null
  submissionId: string | null
  kind: string
  review: string
}

interface ProctorReportExportButtonProps {
  assignmentId: string
  filters: ProctorReportFilters
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const result: unknown = await response.json()
    if (
      typeof result === 'object'
      && result !== null
      && 'error' in result
      && typeof result.error === 'string'
      && result.error.trim()
    ) {
      return result.error
    }
  } catch {
    // The route may fail before it can produce a JSON error body.
  }
  return 'ดาวน์โหลดรายงานไม่สำเร็จ กรุณาลองใหม่'
}

export function ProctorReportExportButton({
  assignmentId,
  filters,
}: ProctorReportExportButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  async function downloadReport() {
    if (isDownloading) return

    setIsDownloading(true)
    let objectUrl: string | null = null
    let anchor: HTMLAnchorElement | null = null

    try {
      const response = await fetch(
        `/api/assignments/${encodeURIComponent(assignmentId)}/proctor-report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filters),
        },
      )

      if (!response.ok) {
        toast.error(await responseErrorMessage(response))
        return
      }

      const blob = await response.blob()
      if (blob.size === 0) {
        toast.error('ไฟล์รายงานว่างเปล่า กรุณาลองใหม่')
        return
      }

      objectUrl = URL.createObjectURL(blob)
      anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = proctorReportFilenameFromDisposition(
        response.headers.get('Content-Disposition'),
      )
      document.body.appendChild(anchor)
      anchor.click()
      toast.success('ดาวน์โหลดรายงาน CSV แล้ว')
    } catch {
      toast.error('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      anchor?.remove()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setIsDownloading(false)
    }
  }

  return (
    <Button type="button" onClick={downloadReport} disabled={isDownloading}>
      <Download aria-hidden="true" />
      {isDownloading ? 'กำลังเตรียมไฟล์…' : 'ดาวน์โหลด CSV ตามตัวกรอง'}
    </Button>
  )
}

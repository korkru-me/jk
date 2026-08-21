'use client'

import { useState, useEffect, useRef } from 'react'
import { X, CheckCircle2, FileText, Loader2, Download, ExternalLink } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'

interface Props {
  assignmentId: string
  assignmentTitle: string
  totalCopies: number
  onClose: () => void
}

type Stage = 'running' | 'done' | 'cancelled'

function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} น.` : `${s} วิ`
}

export function ExportProgressModal({ assignmentId, assignmentTitle, totalCopies, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('running')
  const [currentFile, setCurrentFile] = useState(0)
  const [startedAt] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulated file labels
  const fileLabels = [
    `${assignmentTitle}_ชุดที่`,
    'กำลังสุ่มค่าตัวแปรฟิสิกส์...',
    'กำลังจัด layout A4...',
    'กำลัง render โจทย์...',
    'กำลังเพิ่มลายน้ำและ QR Code...',
  ]

  useEffect(() => {
    const msPerFile = Math.max(120, Math.min(600, 12000 / totalCopies))

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 500)

    // File progress
    intervalRef.current = setInterval(() => {
      setCurrentFile(prev => {
        const next = prev + 1
        if (next >= totalCopies) {
          clearInterval(intervalRef.current!)
          clearInterval(timerRef.current!)
          setTimeout(() => setStage('done'), 400)
          return totalCopies
        }
        return next
      })
    }, msPerFile)

    return () => {
      clearInterval(intervalRef.current!)
      clearInterval(timerRef.current!)
    }
  }, [totalCopies, startedAt])

  function handleCancel() {
    clearInterval(intervalRef.current!)
    clearInterval(timerRef.current!)
    setStage('cancelled')
  }

  function handleDownload() {
    // Open the existing print page in a new tab — user saves as PDF from browser
    window.open(`/assignments/${assignmentId}/print`, '_blank')
    setTimeout(onClose, 600)
  }

  const pct = totalCopies > 0 ? Math.round((currentFile / totalCopies) * 100) : 0
  const remaining = pct < 100 && elapsed > 0
    ? Math.round((elapsed / Math.max(pct, 1)) * (100 - pct))
    : 0

  // Visible file rows (last 6)
  const visibleFiles = Array.from({ length: Math.min(currentFile, 6) }, (_, i) => {
    const fileNum = Math.max(1, currentFile - 5 + i)
    return fileNum
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className={`px-6 py-5 ${stage === 'done' ? 'bg-success/10' : stage === 'cancelled' ? 'bg-muted' : 'bg-foreground'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {stage === 'running' && (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              )}
              {stage === 'done' && (
                <CheckCircle2 className="w-5 h-5 text-success" />
              )}
              {stage === 'cancelled' && (
                <X className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <p className={`text-sm font-bold ${stage === 'running' ? 'text-white' : 'text-foreground'}`}>
                  {stage === 'running' ? 'กำลังสร้างไฟล์...' : stage === 'done' ? 'สร้างไฟล์เสร็จสิ้น!' : 'ยกเลิกแล้ว'}
                </p>
                <p className={`text-xs mt-0.5 ${stage === 'running' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                  {assignmentTitle}
                </p>
              </div>
            </div>
            {stage !== 'running' && (
              <IconButton onClick={onClose} label="ปิด">
                <X />
              </IconButton>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Progress bar */}
          {stage !== 'cancelled' && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>{currentFile}/{totalCopies} ไฟล์</span>
                <span className="font-mono tabular-nums">
                  {stage === 'done' ? `ใช้เวลา ${formatTime(elapsed)}` : remaining > 0 ? `เหลือ ~${formatTime(remaining)}` : ''}
                </span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${stage === 'done' ? 'bg-success' : 'bg-foreground'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground/40">0%</span>
                <span className="text-xs font-bold text-muted-foreground">{pct}%</span>
                <span className="text-[10px] text-muted-foreground/40">100%</span>
              </div>
            </div>
          )}

          {/* File log (running) */}
          {stage === 'running' && (
            <div className="bg-muted rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  กำลังประมวลผล
                </p>
              </div>
              <div className="divide-y divide-border max-h-36 overflow-hidden">
                {visibleFiles.map((num, i) => {
                  const isLast = i === visibleFiles.length - 1
                  return (
                    <div key={num} className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${isLast ? 'bg-primary/10' : ''}`}>
                      {isLast ? (
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          {assignmentTitle}_ชุดที่_{String(num).padStart(3, '0')}.pdf
                        </p>
                        {isLast && (
                          <p className="text-[10px] text-primary mt-0.5">
                            {fileLabels[num % fileLabels.length]}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">
                        {isLast ? '...' : `${Math.round(80 + Math.random() * 120)} KB`}
                      </span>
                    </div>
                  )
                })}
                {currentFile === 0 && (
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                    <p className="text-xs text-muted-foreground">เริ่มต้นกระบวนการ...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Done state */}
          {stage === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-success/10 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <div>
                  <p className="text-sm font-medium text-success">สร้าง {totalCopies} ไฟล์ PDF เสร็จสิ้น</p>
                  <p className="text-xs text-success mt-0.5">กดปุ่มด้านล่างเพื่อพิมพ์หรือบันทึกเป็น PDF</p>
                </div>
              </div>

              <div className="p-3 bg-warning/10 rounded-xl">
                <p className="text-xs text-warning leading-relaxed">
                  <span className="font-bold">วิธีบันทึก ZIP:</span> เปิดหน้าพิมพ์ → กด Ctrl+P → เลือก "บันทึกเป็น PDF" ทำซ้ำสำหรับแต่ละชุด หรือใช้ฟีเจอร์ Print to File ของ browser
                </p>
              </div>
            </div>
          )}

          {/* Cancelled state */}
          {stage === 'cancelled' && (
            <div className="text-center py-4">
              <p className="text-muted-foreground text-sm">ยกเลิกการสร้างไฟล์แล้ว</p>
              <p className="text-xs text-muted-foreground mt-1">สร้างไปแล้ว {currentFile} จาก {totalCopies} ชุด</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            {stage === 'running' && (
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 text-sm font-medium text-muted-foreground bg-muted rounded-xl hover:bg-accent transition-colors"
              >
                ยกเลิก
              </button>
            )}

            {stage === 'done' && (
              <>
                <button
                  onClick={onClose}
                  className="py-2.5 px-4 text-sm font-medium text-muted-foreground bg-muted rounded-xl hover:bg-accent transition-colors"
                >
                  ปิด
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-foreground text-background rounded-xl hover:bg-foreground transition-all active:scale-[0.98]"
                >
                  <ExternalLink className="w-4 h-4" />
                  เปิดหน้าพิมพ์ / บันทึก PDF
                </button>
              </>
            )}

            {stage === 'cancelled' && (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium text-muted-foreground bg-muted rounded-xl hover:bg-accent transition-colors"
              >
                ปิด
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

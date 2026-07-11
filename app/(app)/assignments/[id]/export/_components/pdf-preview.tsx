'use client'

import { useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ChevronLeft, ChevronRight, FileText, ScanLine, Eye } from 'lucide-react'
import type { Question, MCQOption, Variable } from '@/lib/types'
import type { PrintSettings } from './export-client'
import { OMRSheetPreview } from './omr-sheet-preview'

// ─── Mock physics questions (fallback when no questions loaded) ────────────────

const MOCK_QUESTIONS: { title: string; text: string; type: string; opts?: string[] }[] = [
  {
    title: 'การเคลื่อนที่แบบโปรเจกไทล์',
    text: 'ลูกบอลมวล 0.5 kg ถูกโยนในแนวระดับด้วยความเร็ว 20 m/s จากความสูง 45 m จงหาระยะแนวราบที่ลูกบอลเคลื่อนที่ได้จนถึงพื้น (กำหนด g = 10 m/s²)',
    type: 'written',
  },
  {
    title: 'กฎการเคลื่อนที่ของนิวตัน',
    text: 'วัตถุมวล 8 kg อยู่บนพื้นเรียบไม่มีแรงเสียดทาน ถ้ามีแรงกระทำ 40 N ในแนวระดับ จงหาความเร่งของวัตถุ',
    type: 'mcq',
    opts: ['2 m/s²', '4 m/s²', '5 m/s²', '8 m/s²'],
  },
  {
    title: 'พลังงานศักย์และพลังงานจลน์',
    text: 'วัตถุมวล 2 kg ตกอิสระจากความสูง 20 m จงหาความเร็วของวัตถุขณะกระทบพื้น (g = 10 m/s²) โดยไม่คิดแรงต้านอากาศ',
    type: 'mcq',
    opts: ['10 m/s', '15 m/s', '20 m/s', '25 m/s'],
  },
  {
    title: 'โมเมนตัมและการชน',
    text: 'รถยนต์มวล 1,200 kg วิ่งด้วยความเร็ว 30 m/s ชนกับรถมวล 800 kg ที่หยุดนิ่ง แล้วประกบกันเคลื่อนที่ไปด้วยกัน จงหาความเร็วหลังการชน',
    type: 'written',
  },
  {
    title: 'แรงโน้มถ่วงสากล',
    text: 'ดาวเทียมโคจรรอบโลกในวงโคจรวงกลมที่ระยะ 6.4×10⁶ m จากพื้นผิวโลก จงหาความเร็วเชิงเส้นของดาวเทียม (R_earth = 6.4×10⁶ m, g = 9.8 m/s²)',
    type: 'written',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedNum(seed: string, idx: number, min: number, max: number): number {
  const h = [...seed].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  const r = (((h * (idx + 3) * 1664525 + 1013904223) >>> 0) % 1000) / 1000
  return parseFloat((min + r * (max - min)).toPrecision(3))
}

function substituteVars(text: string, values: Record<string, number>) {
  return text.replace(/\{(\w+)\}/g, (_, name) => values[name] !== undefined ? String(values[name]) : `{${name}}`)
}

function genValues(vars: Variable[], copyIndex: number, qId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of vars) {
    if (v.is_constant) { out[v.name] = v.constant_value ?? v.min; continue }
    out[v.name] = seedNum(qId + copyIndex, v.name.charCodeAt(0), v.min, v.max)
  }
  return out
}

// ─── A4 Paper Shell ───────────────────────────────────────────────────────────

function A4Paper({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="bg-white shadow-2xl mx-auto relative overflow-hidden"
      style={{ width: 595, minHeight: 842, ...style }}
    >
      {children}
    </div>
  )
}

// ─── Watermark ────────────────────────────────────────────────────────────────

function Watermark({ text, opacity }: { text: string; opacity: number }) {
  if (!text) return null
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10"
      style={{ opacity: opacity / 100 }}
    >
      <span
        className="text-gray-400 font-black whitespace-nowrap"
        style={{ fontSize: 72, transform: 'rotate(-35deg)', letterSpacing: '0.05em' }}
      >
        {text}
      </span>
    </div>
  )
}

// ─── Security strip ───────────────────────────────────────────────────────────

function SecurityStrip({ examId, studentName }: { examId: string; studentName?: string }) {
  return (
    <div className="absolute top-0 right-0 bottom-0 w-5 flex flex-col items-center justify-center gap-0 overflow-hidden">
      <p
        className="text-[7px] text-gray-400 font-mono whitespace-nowrap tracking-widest"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {examId} {studentName ? `· ${studentName}` : ''}
      </p>
    </div>
  )
}

// ─── Exam Sheet Page ──────────────────────────────────────────────────────────

function ExamSheetPage({
  settings, questions, assignmentTitle, classroomName, assignmentId, copyIndex,
}: {
  settings: PrintSettings
  questions: Question[]
  assignmentTitle: string
  classroomName: string
  assignmentId: string
  copyIndex: number
}) {
  const displayQuestions = questions.length > 0 ? questions : MOCK_QUESTIONS as any[]
  const fontSize = settings.ecoMode ? 10 : 12
  const lineHeight = settings.ecoMode ? 1.3 : 1.6
  const padding = settings.ecoMode ? 24 : 32
  const qrValue = `https://korkru.com/sheet/${assignmentId}?copy=${copyIndex}`
  const examId = `EX-${assignmentId.slice(0, 6).toUpperCase()}-${String(copyIndex).padStart(3, '0')}`

  const questionValues = useMemo(() => {
    return displayQuestions.map((q: any) =>
      q.variables?.length ? genValues(q.variables as Variable[], copyIndex, q.id ?? '') : {}
    )
  }, [copyIndex, displayQuestions])

  return (
    <A4Paper style={{ padding, fontSize, lineHeight, fontFamily: 'sans-serif' }}>
      {/* Watermark */}
      <Watermark text={settings.watermarkText} opacity={settings.watermarkOpacity} />

      {/* Security strip */}
      {settings.printExamId && (
        <SecurityStrip examId={examId} studentName="ชื่อนักเรียน" />
      )}

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between mb-5 pb-3" style={{ borderBottom: '2px solid #1f2937' }}>
        <div className="flex items-center gap-3">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt="Logo" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center text-white font-black text-sm">
              กค
            </div>
          )}
          <div>
            <p className="font-black" style={{ fontSize: fontSize + 3 }}>{settings.institutionName}</p>
            <p style={{ fontSize: fontSize - 1, color: '#6b7280' }}>วิชาฟิสิกส์ · {classroomName || 'ม.4/1'}</p>
            <p className="font-semibold" style={{ fontSize: fontSize + 1 }}>{assignmentTitle}</p>
          </div>
        </div>

        <div className="text-right shrink-0 ml-4">
          <div style={{ marginBottom: 4 }}>
            <p style={{ fontSize: fontSize - 2, color: '#9ca3af' }}>ชุดที่</p>
            <p className="font-black" style={{ fontSize: 20, color: '#1f2937' }}>#{copyIndex}</p>
          </div>
          <QRCodeSVG value={qrValue} size={64} level="M" />
          <p style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>สแกนส่งคำตอบ</p>
        </div>
      </div>

      {/* Student info row */}
      <div className="flex gap-6 mb-4">
        {[
          { label: 'ชื่อ-นามสกุล', width: '45%' },
          { label: 'เลขที่', width: '15%' },
          { label: 'วันที่', width: '25%' },
          { label: 'คะแนน', width: '15%' },
        ].map(f => (
          <div key={f.label} style={{ width: f.width }}>
            <p style={{ fontSize: fontSize - 2, color: '#9ca3af' }}>{f.label}</p>
            <div style={{ borderBottom: '1px solid #9ca3af', marginTop: 2, height: 16 }} />
          </div>
        ))}
      </div>

      {/* ─── Questions ─── */}
      <div
        className={settings.columns === 2 ? 'grid grid-cols-2 gap-x-5' : ''}
        style={{ columnGap: settings.columns === 2 ? 20 : 0 }}
      >
        {displayQuestions.map((q: any, i: number) => {
          const vals = questionValues[i] ?? {}
          const text = q.question_text ? substituteVars(q.question_text, vals) : q.text ?? ''
          const isMCQ = q.question_type === 'mcq' || q.type === 'mcq'
          const opts: string[] = q.mcq_options
            ? (q.mcq_options as MCQOption[]).map((o: MCQOption) => o.text)
            : q.opts ?? []

          return (
            <div key={q.id ?? i} style={{ marginBottom: settings.ecoMode ? 8 : 14, breakInside: 'avoid' }}>
              <p style={{ fontWeight: 600, marginBottom: 3 }}>
                <span style={{ color: '#1f2937' }}>ข้อ {i + 1}. </span>
                {text}
              </p>

              {/* MCQ options */}
              {isMCQ && opts.length > 0 && (
                <div className={settings.columns === 2 ? '' : 'grid grid-cols-2 gap-x-4'} style={{ marginLeft: 12, marginTop: 4 }}>
                  {opts.map((opt, j) => (
                    <p key={j} style={{ fontSize: fontSize - 1 }}>
                      {['ก', 'ข', 'ค', 'ง'][j]}. {opt}
                    </p>
                  ))}
                </div>
              )}

              {/* Written blank */}
              {!isMCQ && (
                <div style={{ marginLeft: 12, marginTop: 4 }}>
                  <span style={{ fontSize: fontSize - 1, color: '#9ca3af' }}>คำตอบ: </span>
                  <span style={{
                    display: 'inline-block',
                    width: 120,
                    borderBottom: '1px solid #9ca3af',
                    marginLeft: 4,
                    fontSize: fontSize - 1,
                    color: '#d1d5db',
                  }}>
                    {q.answer_unit ? `(${q.answer_unit})` : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ─── Quick Answer Key (if enabled) ─── */}
      {settings.answerKeyType === 'quick' && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px dashed #d1d5db' }}>
          <p style={{ fontSize: fontSize - 1, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>
            เฉลย (Quick Key)
          </p>
          <div className="flex flex-wrap gap-2">
            {displayQuestions.map((q: any, i: number) => {
              const isMCQ = q.question_type === 'mcq' || q.type === 'mcq'
              const opts: MCQOption[] = q.mcq_options ?? []
              const correctIdx = opts.findIndex((o: MCQOption) => o.is_correct)
              const answer = isMCQ && correctIdx >= 0 ? ['ก', 'ข', 'ค', 'ง'][correctIdx] : '—'
              return (
                <span key={i} style={{ fontSize: fontSize - 2, fontFamily: 'monospace' }}>
                  {i + 1}:{answer}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </A4Paper>
  )
}

// ─── Main PDFPreview Component ────────────────────────────────────────────────

interface Props {
  settings: PrintSettings
  onPatch: (p: Partial<PrintSettings>) => void
  questions: Question[]
  assignmentTitle: string
  classroomName: string
  assignmentId: string
}

export function PDFPreview({ settings, onPatch, questions, assignmentTitle, classroomName, assignmentId }: Props) {
  const totalCopies = settings.copies

  return (
    <div className="flex flex-col h-full">
      {/* Preview toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2.5 bg-slate-700/90 backdrop-blur text-white text-xs">
        {/* Page tabs */}
        <div className="flex gap-1 bg-slate-800/60 rounded-lg p-0.5">
          <button
            onClick={() => onPatch({ previewPage: 'exam' })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              settings.previewPage === 'exam' ? 'bg-white text-gray-900' : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="w-3 h-3" /> กระดาษข้อสอบ
          </button>
          <button
            onClick={() => onPatch({ previewPage: 'omr', attachOMR: true })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              settings.previewPage === 'omr' ? 'bg-white text-gray-900' : 'text-slate-300 hover:text-white'
            } ${!settings.attachOMR ? 'opacity-40' : ''}`}
          >
            <ScanLine className="w-3 h-3" /> กระดาษ OMR
          </button>
        </div>

        {/* Copy navigator */}
        <div className="flex items-center gap-1.5 ml-auto bg-slate-800/60 rounded-lg px-2 py-1">
          <button
            onClick={() => onPatch({ previewCopy: Math.max(1, settings.previewCopy - 1) })}
            disabled={settings.previewCopy <= 1}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-600 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <span className="text-slate-200 font-mono text-[11px] tabular-nums w-16 text-center">
            ชุด {settings.previewCopy}/{totalCopies}
          </span>
          <button
            onClick={() => onPatch({ previewCopy: Math.min(totalCopies, settings.previewCopy + 1) })}
            disabled={settings.previewCopy >= totalCopies}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-600 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-1 text-slate-400 text-[10px]">
          <Eye className="w-3 h-3" />
          Live Preview
        </div>
      </div>

      {/* Paper preview area */}
      <div className="flex-1 py-8 px-6 flex flex-col items-center gap-6">
        {settings.previewPage === 'exam' && (
          <ExamSheetPage
            settings={settings}
            questions={questions}
            assignmentTitle={assignmentTitle}
            classroomName={classroomName}
            assignmentId={assignmentId}
            copyIndex={settings.previewCopy}
          />
        )}

        {settings.previewPage === 'omr' && (
          <A4Paper style={{ padding: 32, fontFamily: 'sans-serif' }}>
            <OMRSheetPreview
              questionCount={questions.length || MOCK_QUESTIONS.length}
              assignmentId={assignmentId}
              studentName="ชื่อนักเรียน"
              examId={`EX-${assignmentId.slice(0, 6).toUpperCase()}-${String(settings.previewCopy).padStart(3, '0')}`}
              showExamId={settings.printExamId}
            />
          </A4Paper>
        )}

        {/* Page count info */}
        <div className="text-center text-slate-400 text-[11px] pb-4">
          <p>
            {totalCopies} ชุด × {settings.attachOMR ? '2' : '1'} หน้า
            {' = '}
            <span className="font-bold text-slate-300">
              {totalCopies * (settings.attachOMR ? 2 : 1)} หน้ารวม
            </span>
          </p>
          {settings.ecoMode && (
            <p className="text-green-400 mt-0.5">🌿 Eco-Mode: ประหยัดกระดาษ ~20%</p>
          )}
        </div>
      </div>
    </div>
  )
}

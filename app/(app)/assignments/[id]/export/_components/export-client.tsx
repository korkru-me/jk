'use client'

import { useState } from 'react'
import type { Assignment, Question } from '@/lib/types'
import { PrintSettingsSidebar } from './print-settings-sidebar'
import { PDFPreview } from './pdf-preview'
import { parseSections } from '@/lib/question-set-sections'
import { ExportProgressModal } from './export-progress-modal'

export type PrintSettings = {
  logoUrl: string | null
  institutionName: string
  watermarkText: string
  watermarkOpacity: number   // 0–100
  ecoMode: boolean
  columns: 1 | 2
  copies: number
  previewCopy: number        // 1-based: which copy to preview
  attachOMR: boolean
  printExamId: boolean
  answerKeyType: 'none' | 'quick' | 'detailed'
  previewPage: 'exam' | 'omr'
}

export type StudentInfo = {
  id: string
  name: string
}

const DEFAULTS: PrintSettings = {
  logoUrl: null,
  institutionName: 'โรงเรียนจุฬาภรณราชวิทยาลัย เชียงราย',
  watermarkText: '',
  watermarkOpacity: 20,
  ecoMode: false,
  columns: 1,
  copies: 30,
  previewCopy: 1,
  attachOMR: false,
  printExamId: true,
  answerKeyType: 'quick',
  previewPage: 'exam',
}

interface Props {
  assignment: Assignment & { classrooms: { name: string } | null }
  questions: Question[]
  students: StudentInfo[]
  assignmentId: string
}

export function ExportClient({ assignment, questions, students, assignmentId }: Props) {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULTS)
  const [showProgress, setShowProgress] = useState(false)

  function patch(partial: Partial<PrintSettings>) {
    setSettings(prev => ({ ...prev, ...partial }))
  }

  function handleLogoUpload(file: File) {
    const url = URL.createObjectURL(file)
    patch({ logoUrl: url })
  }

  function handleExportStats() {
    const header = ['ชื่อนักเรียน', 'รหัสนักเรียน', 'ชุดที่', 'วิชา', 'หมายเหตุ']
    const rows = students.length > 0
      ? students.map((s, i) => [s.name, s.id, i + 1, 'ฟิสิกส์', ''])
      : Array.from({ length: settings.copies }, (_, i) => [`นักเรียน ${i + 1}`, `STD${String(i + 1).padStart(4, '0')}`, i + 1, 'ฟิสิกส์', ''])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${assignment.title}_รายชื่อ.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Full-height split view — escape main's p-6 padding */}
      <div
        className="flex -mx-6 -mt-6 border-t border-border overflow-hidden"
        style={{ height: 'calc(100vh - 64px)' }}
      >
        {/* ─── Left: Settings ───────────────────────── */}
        <aside className="w-[360px] shrink-0 border-r border-border bg-card overflow-y-auto">
          <PrintSettingsSidebar
            settings={settings}
            onPatch={patch}
            onLogoUpload={handleLogoUpload}
            onGenerateZip={() => setShowProgress(true)}
            onExportStats={handleExportStats}
            questionCount={questions.length}
            studentCount={students.length}
          />
        </aside>

        {/* ─── Right: Live Preview ───────────────────── */}
        <div className="flex-1 overflow-y-auto bg-muted">
          <PDFPreview
            settings={settings}
            onPatch={patch}
            questions={questions}
            sections={assignment.show_sections === false ? [] : parseSections(assignment.sections)}
            assignmentTitle={assignment.title}
            classroomName={assignment.classrooms?.name ?? ''}
            assignmentId={assignmentId}
          />
        </div>
      </div>

      {showProgress && (
        <ExportProgressModal
          assignmentId={assignmentId}
          assignmentTitle={assignment.title}
          totalCopies={settings.copies}
          onClose={() => setShowProgress(false)}
        />
      )}
    </>
  )
}

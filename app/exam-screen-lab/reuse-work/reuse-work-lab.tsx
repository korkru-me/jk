'use client'

import { useState } from 'react'
import { ReuseAssignmentCard } from '@/app/(app)/assignments/new/_components/reuse-assignment-card'
import { PracticeLibraryForm } from '@/app/(app)/practice/_components/practice-library-form'
import type { BankQuestion } from '@/lib/question-bank'

const target = '00000000-0000-4000-8300-000000000001'
const source = '00000000-0000-4000-8300-000000000002'
const questionId = '00000000-0000-4000-8200-000000000001'
const libraryId = '00000000-0000-4000-8400-000000000001'
const questions: BankQuestion[] = [{
  id: questionId, title: 'ทบทวนแรงลัพธ์', question_text: '<p>หาแรงลัพธ์ของวัตถุ</p>',
  question_type: 'written', difficulty: 'medium', subject: 'ฟิสิกส์', tags: [],
  sub_question_count: 1, default_points: 1, has_random_values: false,
}]

/** Synthetic data only; saving is answered in memory and never navigates to a real classroom. */
export function ReuseWorkLab({ view }: { view?: string }) {
  const [saved, setSaved] = useState<unknown>(null)
  if (view === 'practice' || view === 'blocked') return <main className="p-4 sm:p-6">
    <p className="mb-3 text-xs text-muted-foreground">ตัวอย่างคลังฝึก · ข้อมูลจำลอง · บันทึกเฉพาะในหน้าทดสอบ</p>
    <PracticeLibraryForm
      classrooms={[{ id: target, name: 'กลศาสตร์ 2 · ห้องปลายทาง', orgId: source, description: null }]}
      questions={questions}
      initialClassroomId={target}
      missingQuestionIds={view === 'blocked' ? [questionId] : []}
      copyPreset={{
        sourceTitle: 'ทบทวนแรงและการเคลื่อนที่', title: 'ทบทวนแรงและการเคลื่อนที่ (สำเนา)',
        description: '<p>ฝึกทบทวนก่อนเรียนบทถัดไป</p>', questionIds: [questionId],
        revealAnswerKey: false, accessCode: 'DEMO-ONLY', calculatorEnabled: false,
        scratchpadEnabled: true, shuffleQuestions: false, shuffleOptions: true,
      }}
      actions={{
        createPracticeLibrary: async input => { setSaved(input); return { ok: true, id: libraryId } },
        onSaved: () => undefined,
      }}
    />
    {saved !== null && <p role="status" data-saved-practice className="mt-3 break-all text-sm">บันทึกคลังฝึกจำลองแล้ว · {JSON.stringify(saved)}</p>}
  </main>

  return <main className="mx-auto flex max-w-5xl flex-col gap-3 p-4 sm:p-6">
    <p className="text-xs text-muted-foreground">ตัวอย่างนำงานมาใช้ซ้ำ · ข้อมูลจำลอง</p>
    <ReuseAssignmentCard
      targetClassroomId={target}
      classrooms={[{ id: target, name: 'กลศาสตร์ 2', description: null }, { id: source, name: 'ฟิสิกส์ 1', description: null }]}
      loadingError={view === 'error' ? 'โหลดรายการคลังฝึกสำหรับนำมาใช้ซ้ำไม่สำเร็จ' : null}
      assignments={view === 'empty' ? [] : [
        { id: 'exercise-demo', classroomId: source, title: 'ทดสอบแบบฝึกหัด', type: 'exercise', status: 'published', createdAt: '2026-10-14' },
        { id: 'exam-demo', classroomId: source, title: 'ทดสอบข้อสอบ', type: 'exam', status: 'closed', createdAt: '2026-10-13' },
        { id: `practice:${libraryId}`, classroomId: source, title: 'ทบทวนแรงและการเคลื่อนที่', type: 'practice', status: 'published', createdAt: '2026-10-15' },
      ]}
      copyHrefs={view === 'direct' ? undefined : { [`practice:${libraryId}`]: '/exam-screen-lab/reuse-work?view=practice' }}
    />
  </main>
}

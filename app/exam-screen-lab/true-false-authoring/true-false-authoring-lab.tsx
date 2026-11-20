'use client'

import { useState } from 'react'
import { TrueFalseForm } from '@/components/questions/true-false-form'
import type { QuestionFormData } from '@/lib/actions/questions'
import type { Question } from '@/lib/types'

const image = '/samples/simple-circuit.svg'
// Deliberately synthetic: draft mode never submits to the database.
const question = {
  id: 'local-true-false', title: 'ตัวอย่างถูก–ผิดในเครื่อง', subject: 'ฟิสิกส์',
  question_type: 'true_false', question_text: '<p>วงจรปิดทำให้กระแสไฟฟ้าไหลได้</p>',
  extra_data: { correct_answer: true, explanation_mode: 'none', score_answer: 1, score_explanation: 0,
    statements: [{ id: 'local-sub', text: '<p>พิจารณารูปวงจรไฟฟ้า</p>', correct_answer: false, image_urls: [image] }] },
} as Question

export function TrueFalseAuthoringLab() {
  const [saved, setSaved] = useState<QuestionFormData | null>(null)
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-muted-foreground">ตัวอย่างในเครื่อง — ข้อมูลจำลอง ไม่บันทึกลงคลัง</p>
    {saved && <output className="break-all text-xs" aria-live="polite">รับร่างในเครื่องแล้ว: {JSON.stringify(saved.extra_data)}</output>}
    <TrueFalseForm allTags={[]} question={question} draft={{ submitLabel: 'ตรวจร่างในเครื่อง', onSubmit: setSaved, onCancel: () => setSaved(null) }} />
  </div>
}

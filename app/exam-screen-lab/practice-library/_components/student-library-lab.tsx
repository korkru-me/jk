'use client'

import { useState } from 'react'
import { PracticeLibraryView } from '@/components/practice/practice-library-view'
import { practiceExerciseSchema, type PracticeExercise } from '@/lib/practice-exercises'
import type { PracticeQuestionListItem } from '@/lib/practice-question-access.server'

const ids = [1, 2, 3].map(n => `00000000-0000-4000-8200-${String(n).padStart(12, '0')}`)
const items: PracticeQuestionListItem[] = [
  { id: ids[0], title: 'โมเมนตัม แรงดล ค้อนตอกตะปู', excerpt: 'ค้อนมวล 0.5 กิโลกรัมกระทบตะปู จงหาแรงเฉลี่ยที่กระทำกับตะปู', questionType: 'written', difficulty: 'medium', subject: 'ฟิสิกส์', tags: ['โมเมนตัม', 'สอวน.ค่าย 1'], position: 0, attemptCount: 2, hasSolution: true },
  { id: ids[1], title: 'โมเมนต์ หาขนาดโมเมนต์ของแรง (มี 2 ข้อย่อย)', excerpt: 'แรงกระทำที่ปลายคาน จงหาโมเมนต์ของแรงและทิศทางการหมุน', questionType: 'written', difficulty: 'hard', subject: 'ฟิสิกส์', tags: ['สมดุล'], position: 1, attemptCount: 0 },
  { id: ids[2], title: 'งานและพลังงานของวัตถุบนพื้นเอียงที่มีแรงเสียดทาน', excerpt: 'จงอธิบายความสัมพันธ์ระหว่างงานและพลังงาน พร้อมคำนวณงานของแรงเสียดทาน', questionType: 'mcq', difficulty: 'easy', subject: 'ฟิสิกส์', tags: ['พลังงาน', 'แท็กชื่อยาวสำหรับทดสอบการแสดงผลบนโทรศัพท์มือถือ'], position: 2, attemptCount: 0 },
]

export function StudentLibraryLab() {
  const [exercises, setExercises] = useState<PracticeExercise[]>([])
  return <PracticeLibraryView
    library={{ id: '00000000-0000-4000-8300-000000000001', classroomId: '00000000-0000-4000-8300-000000000002', title: 'ทดสอบคลังฝึกนะ', description: null, revealAnswerKey: true, requiresAccessCode: false, calculatorEnabled: true, scratchpadEnabled: true, shuffleOptions: true }}
    items={items} total={3} totalPages={1} state={{ q: '', tags: [], page: 1, ignoredTagCount: 0 }}
    storageOwnerId="synthetic-lab" exercises={exercises} exercisesReady
    createExerciseAction={async input => {
      const value = practiceExerciseSchema.parse(input)
      setExercises(previous => previous.some(group => group.id === value.id) ? previous : [{ id: value.id, title: value.title, questionIds: value.questionIds, attemptedCount: value.questionIds.includes(ids[0]) ? 1 : 0 }, ...previous])
      return { ok: true }
    }}
    solutionLoader={async () => ({ data: { title: items[0].title, parts: [{ id: ids[0], label: null, excerpt: null, text: '<p>ใช้ความสัมพันธ์ แรงดล = การเปลี่ยนแปลงโมเมนตัม</p>', files: [] }] } })}
  />
}

'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { parsePracticeSearchParams, buildPracticeSearchHref, buildPracticeQuestionHref, practiceSearchTerms } from '@/lib/practice-search'
import { PracticeLibraryView } from '@/components/practice/practice-library-view'
import { PracticeExerciseRunner } from '@/components/practice/practice-exercise-runner'
import type { PracticeRunQuestionLoader, PracticeRunAnswerAction } from '@/lib/practice-run'
import { PracticeLocalLibraryView } from '@/components/practice/practice-local-library-view'
import { practiceExerciseSchema, practiceExerciseUpdateSchema, practiceReviewPinSchema, practiceExerciseDtoSchema, type PracticeExercise } from '@/lib/practice-exercises'
import type { PracticeQuestionListItem } from '@/lib/practice-question-access.server'

const ids = [1, 2, 3].map(n => `00000000-0000-4000-8200-${String(n).padStart(12, '0')}`)
const items: PracticeQuestionListItem[] = [
  { id: ids[0], title: 'โมเมนตัม แรงดล ค้อนตอกตะปู', excerpt: 'ค้อนมวล 0.5 กิโลกรัมกระทบตะปู จงหาแรงเฉลี่ยที่กระทำกับตะปู', questionType: 'written', difficulty: 'medium', subject: 'ฟิสิกส์', tags: ['โมเมนตัม', 'สอวน.ค่าย 1'], position: 0, attemptCount: 2, hasSolution: true },
  { id: ids[1], title: 'โมเมนต์ หาขนาดโมเมนต์ของแรง (มี 2 ข้อย่อย)', excerpt: 'แรงกระทำที่ปลายคาน จงหาโมเมนต์ของแรงและทิศทางการหมุน', questionType: 'written', difficulty: 'hard', subject: 'ฟิสิกส์', tags: ['สมดุล'], position: 1, attemptCount: 0 },
  { id: ids[2], title: 'งานและพลังงานของวัตถุบนพื้นเอียงที่มีแรงเสียดทาน', excerpt: 'จงอธิบายความสัมพันธ์ระหว่างงานและพลังงาน พร้อมคำนวณงานของแรงเสียดทาน', questionType: 'mcq', difficulty: 'easy', subject: 'ฟิสิกส์', tags: ['พลังงาน', 'แท็กชื่อยาวสำหรับทดสอบการแสดงผลบนโทรศัพท์มือถือ'], position: 2, attemptCount: 0 },
]

const STORAGE_KEY = 'student-practice-library-lab:v2'
const example: PracticeExercise = {
  id: '00000000-0000-4000-8400-000000000001', title: 'ทบทวนกลศาสตร์', questionIds: ids.slice(0, 2),
  attemptedCount: 1, revision: 1, questionTitles: Object.fromEntries(items.slice(0, 2).map(item => [item.id, item.title])),
}

const labLibrary = { id: '00000000-0000-4000-8300-000000000001', classroomId: '00000000-0000-4000-8300-000000000002', title: 'ทดสอบคลังฝึกนะ', description: null, revealAnswerKey: true, requiresAccessCode: false, calculatorEnabled: true, scratchpadEnabled: true, shuffleOptions: true }
const labQuestionLoader: PracticeRunQuestionLoader = async (_libraryId, questionId) => {
  const item = items.find(item => item.id === questionId)
  if (!item) return { ok: false, error: 'ไม่พบโจทย์ทดลอง' }
  return { ok: true, data: { variantReceipt: `synthetic-${questionId}`, changesOnRefresh: false, calculatorEnabled: true, scratchpadEnabled: true,
    question: { id: questionId, question_id: questionId, random_values: {}, student_answer: null, work_images: null, math_input_modes: {},
      questions: { title: item.title, question_text: `<p>${item.excerpt}</p>`, question_type: item.questionType, answer_unit: item.questionType === 'written' ? 'N' : null,
        variables: [], answer_parts: null, mcq_options: item.questionType === 'mcq' ? [{ text: 'พลังงานคงที่', index: 0 }, { text: 'พลังงานเพิ่มขึ้น', index: 1 }] : null,
        extra_data: null, image_urls: null } } } }
}
const labCheckAnswer: PracticeRunAnswerAction = async input => {
  if (!input || typeof input !== 'object' || !('answer' in input) || typeof input.answer !== 'string') return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' }
  const correct = input.answer === '5' || input.answer === '0'
  return { ok: true, feedback: { verdict: correct ? 'correct' : 'wrong', revealed: false, rows: [{ student: input.answer, status: correct ? 'correct' : 'wrong' }], note: 'ผลตรวจข้อมูลจำลองในห้องทดลอง' } }
}

export function StudentLibraryLab({ localReview = false }: { localReview?: boolean }) {
  const params = useSearchParams()
  const withShell = params.get('shell') === 'student'
  const searchHiddenFields = { view: localReview ? 'local-student' : 'student', ...(withShell ? { shell: 'student' } : {}) }
  const state = parsePracticeSearchParams({ ...Object.fromEntries(params.entries()), tag: params.getAll('tag') })
  const [exercises, setExercises] = useState<PracticeExercise[]>([example])
  const [pins, setPins] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved && typeof saved === 'object' && 'exercises' in saved && 'pins' in saved) {
        if (Array.isArray(saved.exercises)) {
          const parsed = saved.exercises.map(group => practiceExerciseDtoSchema.safeParse(group))
          if (parsed.every(group => group.success)) setExercises(parsed.flatMap(group => group.success ? [group.data] : []))
        }
        if (Array.isArray(saved.pins)) setPins(saved.pins.filter((id): id is string => typeof id === 'string' && ids.includes(id)))
      }
    } catch { /* The synthetic lab still works without local persistence. */ }
    setReady(true)
  }, [])
  function persist(nextExercises: PracticeExercise[], nextPins: string[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ exercises: nextExercises, pins: nextPins })) }
    catch { /* In-memory demonstration remains available. */ }
  }
  const libraryHrefBuilder: typeof buildPracticeSearchHref = (libraryId, search, patch) => {
    const query = new URL(buildPracticeSearchHref(libraryId, search, patch), 'http://localhost').searchParams
    query.set('view', localReview ? 'local-student' : 'student')
    if (withShell) query.set('shell', 'student')
    return `/exam-screen-lab/practice-library?${query.toString()}`
  }
  const questionHrefBuilder: typeof buildPracticeQuestionHref = (_libraryId, questionId) =>
    `/exam-screen-lab/practice-library?view=${localReview ? 'local-student' : 'student'}&preview=${questionId}${withShell ? '&shell=student' : ''}`
  const active = exercises.find(group => group.id === state.exerciseId)
  const filtered = items.filter(item => (!active || active.questionIds.includes(item.id))
    && (!state.reviewOnly || pins.includes(item.id))
    && practiceSearchTerms(state.q).every(term => `${item.title} ${item.excerpt}`.toLowerCase().includes(term.toLowerCase()))
    && state.tags.every(tag => item.tags.some(value => value.trim().toLowerCase() === tag.trim().toLowerCase())))
  const visible = active ? [...filtered].sort((a, b) => active.questionIds.indexOf(a.id) - active.questionIds.indexOf(b.id)).map((item, position) => ({ ...item, position })) : filtered
  const preview = items.find(item => item.id === params.get('preview'))
  const exerciseHrefBuilder = (_libraryId: string, exerciseId: string) => `/exam-screen-lab/practice-library?view=${localReview ? 'local-run' : 'run'}&exercise=${exerciseId}${withShell ? '&shell=student' : ''}`
  if (params.get('view') === 'run' || params.get('view') === 'local-run' || preview) {
    if (!ready) return <p role="status">กำลังเปิดแบบฝึกหัด…</p>
    const single = preview ? { id: preview.id, title: preview.title, questionIds: [preview.id], revision: 1, attemptedCount: preview.attemptCount ? 1 : 0, questionTitles: { [preview.id]: preview.title } } : undefined
    const group = single ?? exercises.find(group => group.id === state.exerciseId)
    const library = params.get('tools') === 'off' ? { ...labLibrary, calculatorEnabled: false, scratchpadEnabled: false } : labLibrary
    return <PracticeExerciseRunner library={library} exerciseId={single?.id ?? state.exerciseId ?? example.id} storageOwnerId={localReview ? 'synthetic-local-review' : 'synthetic-lab'}
      exercise={group} localItems={items} localReview={localReview && !single} returnHref={`/exam-screen-lab/practice-library?view=${localReview ? 'local-student' : 'student'}${withShell ? '&shell=student' : ''}`}
      questionLoader={labQuestionLoader} checkAction={labCheckAnswer} />
  }
  if (localReview) return <PracticeLocalLibraryView
    library={{ id: '00000000-0000-4000-8300-000000000001', classroomId: '00000000-0000-4000-8300-000000000002', title: 'ทดสอบคลังฝึกนะ', description: null, revealAnswerKey: true, requiresAccessCode: false, calculatorEnabled: true, scratchpadEnabled: true, shuffleOptions: true }}
    items={items} matchingIds={items.filter(item => practiceSearchTerms(state.q).every(term => `${item.title} ${item.excerpt}`.toLowerCase().includes(term.toLowerCase()))
      && state.tags.every(tag => item.tags.some(value => value.trim().toLowerCase() === tag.trim().toLowerCase()))).map(item => item.id)}
    state={state} storageOwnerId="synthetic-local-review"
    libraryHrefBuilder={libraryHrefBuilder} questionHrefBuilder={questionHrefBuilder} exerciseHrefBuilder={exerciseHrefBuilder} searchHiddenFields={searchHiddenFields}
    solutionLoader={async () => ({ data: { title: items[0].title, parts: [{ id: ids[0], label: null, excerpt: null, text: '<p>ใช้ความสัมพันธ์ แรงดล = การเปลี่ยนแปลงโมเมนตัม</p>', files: [] }] } })}
  />
  return <PracticeLibraryView
    library={{ id: '00000000-0000-4000-8300-000000000001', classroomId: '00000000-0000-4000-8300-000000000002', title: 'ทดสอบคลังฝึกนะ', description: null, revealAnswerKey: true, requiresAccessCode: false, calculatorEnabled: true, scratchpadEnabled: true, shuffleOptions: true }}
    items={visible} total={visible.length} totalPages={1} state={state}
    storageOwnerId="synthetic-lab" exercises={exercises} exercisesReady={ready} pinsReady={ready} pinnedQuestionIds={pins}
    libraryHrefBuilder={libraryHrefBuilder} questionHrefBuilder={questionHrefBuilder} exerciseHrefBuilder={exerciseHrefBuilder} searchHiddenFields={searchHiddenFields}
    createExerciseAction={async input => {
      const value = practiceExerciseSchema.parse(input)
      const next = exercises.some(group => group.id === value.id) ? exercises : [{ id: value.id, title: value.title, questionIds: value.questionIds,
        revision: 1, questionTitles: Object.fromEntries(items.filter(item => value.questionIds.includes(item.id)).map(item => [item.id, item.title])),
        attemptedCount: value.questionIds.includes(ids[0]) ? 1 : 0 }, ...exercises]
      setExercises(next)
      persist(next, pins)
      return { ok: true }
    }}
    updateExerciseAction={async input => {
      const value = practiceExerciseUpdateSchema.parse(input)
      const original = exercises.find(group => group.id === value.id)
      if (!original) return { ok: false, error: 'ไม่พบแบบฝึกหัดนี้' }
      if (original.title === value.title && JSON.stringify(original.questionIds) === JSON.stringify(value.questionIds)) return { ok: true }
      if (original.revision !== value.expectedRevision) return { ok: false, conflict: true, error: 'แบบฝึกหัดถูกแก้จากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขต่อ' }
      const next = exercises.map(group => group.id !== value.id ? group : { ...group, title: value.title, questionIds: value.questionIds,
        revision: group.revision + 1, questionTitles: Object.fromEntries(items.filter(item => value.questionIds.includes(item.id)).map(item => [item.id, item.title])),
        attemptedCount: value.questionIds.includes(ids[0]) ? 1 : 0 })
      setExercises(next)
      persist(next, pins)
      return { ok: true }
    }}
    pinAction={async input => {
      const value = practiceReviewPinSchema.parse(input)
      const next = value.pinned ? [...new Set([...pins, value.questionId])] : pins.filter(id => id !== value.questionId)
      setPins(next)
      persist(exercises, next)
      return { ok: true }
    }}
    solutionLoader={async () => ({ data: { title: items[0].title, parts: [{ id: ids[0], label: null, excerpt: null, text: '<p>ใช้ความสัมพันธ์ แรงดล = การเปลี่ยนแปลงโมเมนตัม</p>', files: [] }] } })}
  />
}

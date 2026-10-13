import { describe, expect, it } from 'vitest'
import {
  canChangePracticeQuestionMembership,
  canDeletePracticeLibrary,
  canManagePracticeClassroom,
  canTransitionPracticeLibrary,
  createPracticeLibrarySchema,
  isEligiblePracticeClassroom,
  practiceBulkTagSchema,
  practiceQuestionOrderChanged,
  updatePracticeLibrarySchema,
} from '@/app/(app)/practice/_lib/teacher-contract'

const libraryId = '43d807c2-f678-4c9d-a6e4-f28884e9cb0b'
const classroomId = '1868c537-4632-4855-89cb-f1617f02ea65'
const questionId = '24475b32-21d9-4143-8fbd-b5ac1fdc8195'
const settings = {
  accessCode: null,
  calculatorEnabled: false,
  scratchpadEnabled: true,
  shuffleQuestions: false,
  shuffleOptions: true,
}

describe('practice teacher mutation validation', () => {
  it('normalizes the teacher-editable fields only', () => {
    expect(createPracticeLibrarySchema.parse({
      title: '  สอวน. ฟิสิกส์  ',
      description: '  เลือกฝึกได้ตามสะดวก  ',
      classroomIds: [classroomId],
      questionIds: [questionId],
      revealAnswerKey: false,
      ...settings,
      intent: 'draft',
    })).toEqual({
      title: 'สอวน. ฟิสิกส์',
      description: 'เลือกฝึกได้ตามสะดวก',
      classroomIds: [classroomId],
      questionIds: [questionId],
      revealAnswerKey: false,
      ...settings,
      intent: 'draft',
    })
  })

  it.each(['score', 'maxScore', 'passingScore', 'dueAt', 'answer', 'isCorrect'])(
    'rejects forbidden field %s instead of silently persisting it',
    forbidden => {
      expect(createPracticeLibrarySchema.safeParse({
        title: 'คลังฝึก',
        description: '',
        classroomIds: [classroomId],
        questionIds: [],
        revealAnswerKey: false,
        ...settings,
        intent: 'draft',
        [forbidden]: forbidden === 'isCorrect' ? true : '10',
      }).success).toBe(false)
    },
  )

  it('rejects duplicate question membership', () => {
    expect(createPracticeLibrarySchema.safeParse({
      title: 'คลังฝึก',
      description: '',
      classroomIds: [classroomId],
      questionIds: [questionId, questionId],
      revealAnswerKey: false,
      ...settings,
      intent: 'draft',
    }).success).toBe(false)
  })

  it('keeps classroom and lifecycle fields out of edit payloads', () => {
    const base = {
      libraryId,
      title: 'คลังฝึก',
      description: '',
      questionIds: [questionId],
      revealAnswerKey: false,
      ...settings,
    }
    expect(updatePracticeLibrarySchema.safeParse(base).success).toBe(true)
    expect(updatePracticeLibrarySchema.safeParse({ ...base, classroomId }).success).toBe(false)
    expect(updatePracticeLibrarySchema.safeParse({ ...base, classroomIds: [classroomId] }).success).toBe(false)
    expect(updatePracticeLibrarySchema.safeParse({ ...base, status: 'published' }).success).toBe(false)
  })

  it('requires unique target classrooms', () => {
    const base = {
      title: 'คลังฝึก',
      description: '',
      questionIds: [questionId],
      revealAnswerKey: false,
      ...settings,
      intent: 'draft' as const,
    }
    expect(createPracticeLibrarySchema.safeParse({ ...base, classroomIds: [] }).success).toBe(false)
    expect(createPracticeLibrarySchema.safeParse({
      ...base,
      classroomIds: [classroomId, classroomId],
    }).success).toBe(false)
  })

  it('validates source-question bulk tag operations without score or answer data', () => {
    expect(practiceBulkTagSchema.safeParse({
      libraryId,
      questionIds: [questionId],
      operation: 'add',
      tag: ' ไฟฟ้า ',
    }).success).toBe(true)
    expect(practiceBulkTagSchema.safeParse({
      libraryId,
      questionIds: [questionId],
      operation: 'add',
      tag: 'ไฟฟ้า',
      answer: 'secret',
    }).success).toBe(false)
  })
})

describe('practice teacher authorization seams', () => {
  it('allows owner and admin/manage co-teachers, but not view-only co-teachers', () => {
    expect(canManagePracticeClassroom({
      actorId: 'teacher-a', teacherId: 'teacher-a', coTeacherPermission: null,
    })).toBe(true)
    expect(canManagePracticeClassroom({
      actorId: 'teacher-b', teacherId: 'teacher-a', coTeacherPermission: 'admin',
    })).toBe(true)
    expect(canManagePracticeClassroom({
      actorId: 'teacher-b', teacherId: 'teacher-a', coTeacherPermission: 'manage',
    })).toBe(true)
    expect(canManagePracticeClassroom({
      actorId: 'teacher-b', teacherId: 'teacher-a', coTeacherPermission: 'view',
    })).toBe(false)
    expect(canManagePracticeClassroom({
      actorId: 'teacher-b', teacherId: 'teacher-a', coTeacherPermission: null,
    })).toBe(false)
  })

  it('only offers active non-homeroom classrooms', () => {
    expect(isEligiblePracticeClassroom({ status: 'active', classroomType: 'subject' })).toBe(true)
    expect(isEligiblePracticeClassroom({ status: 'archived', classroomType: 'subject' })).toBe(false)
    expect(isEligiblePracticeClassroom({ status: 'active', classroomType: 'homeroom' })).toBe(false)
  })

  it('freezes membership after publish and only permits forward lifecycle changes', () => {
    expect(canChangePracticeQuestionMembership('draft')).toBe(true)
    expect(canChangePracticeQuestionMembership('published')).toBe(false)
    expect(canChangePracticeQuestionMembership('closed')).toBe(false)
    expect(canDeletePracticeLibrary('draft')).toBe(true)
    expect(canDeletePracticeLibrary('published')).toBe(false)
    expect(canDeletePracticeLibrary('closed')).toBe(false)
    expect(canTransitionPracticeLibrary('draft', 'published')).toBe(true)
    expect(canTransitionPracticeLibrary('published', 'closed')).toBe(true)
    expect(canTransitionPracticeLibrary('closed', 'published')).toBe(false)
    expect(canTransitionPracticeLibrary('published', 'draft')).toBe(false)
  })

  it('treats order-only membership changes as a durable draft change', () => {
    const otherQuestionId = 'd1331d8c-10c5-45d9-8874-cd9c8485d384'
    expect(practiceQuestionOrderChanged(
      [questionId, otherQuestionId],
      [otherQuestionId, questionId],
    )).toBe(true)
    expect(practiceQuestionOrderChanged(
      [questionId, otherQuestionId],
      [questionId, otherQuestionId],
    )).toBe(false)
    expect(practiceQuestionOrderChanged([questionId], [questionId, otherQuestionId])).toBe(true)
    expect(practiceQuestionOrderChanged([questionId, otherQuestionId], [questionId])).toBe(true)
  })
})

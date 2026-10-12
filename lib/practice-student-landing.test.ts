import { describe, expect, it } from 'vitest'
import {
  isEligibleStudentPracticeClassroom,
  studentPracticeLibraryListItem,
} from '@/app/(app)/practice/_lib/student-landing-contract'

describe('student practice landing authorization seam', () => {
  it('only accepts active subject classrooms', () => {
    expect(isEligibleStudentPracticeClassroom({
      status: 'active',
      classroomType: 'subject',
    })).toBe(true)
    expect(isEligibleStudentPracticeClassroom({
      status: 'archived',
      classroomType: 'subject',
    })).toBe(false)
    expect(isEligibleStudentPracticeClassroom({
      status: 'active',
      classroomType: 'homeroom',
    })).toBe(false)
  })
})

describe('student practice landing privacy seam', () => {
  it('keeps only discovery metadata in the RSC-facing DTO', () => {
    const item = studentPracticeLibraryListItem({
      id: 'library-id',
      title: 'สอวน. ค่าย 1',
      classroomId: 'classroom-id',
      classroomName: 'ฟิสิกส์ ม.4',
      questionCount: 24,
      answer: 'never expose',
      correctness: true,
      score: 10,
    } as Parameters<typeof studentPracticeLibraryListItem>[0] & Record<string, unknown>)

    expect(item).toEqual({
      id: 'library-id',
      title: 'สอวน. ค่าย 1',
      classroomId: 'classroom-id',
      classroomName: 'ฟิสิกส์ ม.4',
      questionCount: 24,
    })
    expect(Object.keys(item)).not.toEqual(expect.arrayContaining([
      'answer',
      'correctness',
      'score',
      'rank',
    ]))
  })

  it('normalizes a malformed negative count without introducing progress semantics', () => {
    expect(studentPracticeLibraryListItem({
      id: 'library-id',
      title: 'คลังฝึก',
      classroomId: 'classroom-id',
      classroomName: 'ห้องเรียน',
      questionCount: -4.8,
    }).questionCount).toBe(0)
  })
})

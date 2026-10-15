'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, FileText, BookOpenCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { AssignmentClassroomOption } from '@/components/assignments/create-assignment-form'
import type { AssignmentStatus, AssignmentType } from '@/lib/types'
import { AssignmentReuseDetails } from '@/components/assignments/assignment-reuse-details'
import { assignmentCopyHref } from '@/lib/assignment-creation'

export interface ReusableAssignmentOption {
  id: string
  classroomId: string
  title: string
  type: AssignmentType | 'practice'
  status: AssignmentStatus
  createdAt: string
}

export function ReuseAssignmentCard({
  targetClassroomId,
  classrooms,
  assignments,
  loadingError,
  copyHrefs,
}: {
  targetClassroomId: string
  classrooms: AssignmentClassroomOption[]
  assignments: ReusableAssignmentOption[]
  loadingError?: string | null
  /** Guarded local previews can keep navigation inside the fixture. */
  copyHrefs?: Record<string, string>
}) {
  const reusableSourceIds = new Set(assignments.map(assignment => assignment.classroomId))
  const sourceClassrooms = classrooms.filter(classroom => (
    classroom.id !== targetClassroomId && reusableSourceIds.has(classroom.id)
  ))
  const [sourceClassroomId, setSourceClassroomId] = useState(sourceClassrooms[0]?.id ?? '')
  const [assignmentId, setAssignmentId] = useState('')
  const availableAssignments = useMemo(
    () => assignments
      .filter(assignment => assignment.classroomId === sourceClassroomId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [assignments, sourceClassroomId],
  )

  const selectedAssignment = availableAssignments.find(assignment => assignment.id === assignmentId)
  const copyHref = selectedAssignment && copyHrefs?.[selectedAssignment.id]
    ? copyHrefs[selectedAssignment.id]
    : selectedAssignment?.type === 'practice'
    ? `/practice/new?${new URLSearchParams({ classroom: targetClassroomId, copy: selectedAssignment.id.replace(/^practice:/, '') })}`
    : selectedAssignment ? assignmentCopyHref(targetClassroomId, selectedAssignment.id) : undefined

  if (loadingError) return <Card padding="md"><p role="alert" className="text-sm text-destructive">{loadingError}</p><p className="mt-1 text-xs text-muted-foreground">กรุณาโหลดหน้านี้ใหม่ก่อนเลือกงานต้นฉบับ</p></Card>

  if (sourceClassrooms.length === 0) {
    return (
      <Card padding="lg" className="flex max-w-3xl items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Copy className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">ยังไม่มีงานจากห้องอื่นให้นำมาใช้</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เมื่อมีแบบฝึกหัด ข้อสอบ หรือคลังฝึกในห้องเรียนอื่นที่คุณมีสิทธิ์จัดการ รายการเหล่านั้นจะมาแสดงให้เลือกที่นี่
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card padding="lg" className="@container/reuse-card flex flex-col gap-4">
      <div>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Copy className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">นำงานจากห้องอื่นมาใช้ซ้ำ</h2>
            <p className="text-sm text-muted-foreground">
              เลือกห้องเรียนและงานต้นฉบับ แล้วตรวจสอบข้อมูลกับโจทย์ก่อนทำสำเนาเข้าห้องนี้
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 @min-[38rem]/reuse-card:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-sm font-medium">1. ห้องเรียนต้นทาง</label>
            <Select
              value={sourceClassroomId}
              onValueChange={value => {
                if (value === null) return
                setSourceClassroomId(value)
                setAssignmentId('')
              }}
            >
              <SelectTrigger className="w-full" aria-label="ห้องเรียนต้นทาง">
                <SelectValue placeholder="เลือกห้องเรียน">
                  {value => sourceClassrooms.find(classroom => classroom.id === value)?.name ?? 'เลือกห้องเรียน'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sourceClassrooms.map(classroom => (
                    <SelectItem key={classroom.id} value={classroom.id}>{classroom.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-sm font-medium">2. งานที่ต้องการนำมาใช้</label>
            <Select
              value={assignmentId}
              disabled={availableAssignments.length === 0}
              onValueChange={value => value !== null && setAssignmentId(value)}
            >
              <SelectTrigger className="w-full" aria-label="งานที่ต้องการนำมาใช้">
                <SelectValue placeholder={availableAssignments.length === 0 ? 'ห้องนี้ยังไม่มีงาน' : 'เลือกแบบฝึกหัด ข้อสอบ หรือคลังฝึก'}>
                  {value => availableAssignments.find(assignment => assignment.id === value)?.title ?? 'เลือกแบบฝึกหัด ข้อสอบ หรือคลังฝึก'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableAssignments.map(assignment => (
                    <SelectItem key={assignment.id} value={assignment.id}>
                      <span className="flex w-full min-w-0 items-center gap-2">
                        {assignment.type === 'practice' ? <BookOpenCheck className="size-4" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{assignment.title}</span>
                        <Badge variant="secondary">{assignment.type === 'practice' ? 'คลังฝึก' : assignment.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}</Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          เลือกได้ทั้งแบบฝึกหัด ข้อสอบ และคลังฝึกจากห้องเรียนต้นทางที่คุณมีสิทธิ์จัดการ
        </p>
        <AssignmentReuseDetails kind={selectedAssignment?.type === 'practice' ? 'practice' : 'assignment'} />
        <div className="flex justify-end">
          {copyHref ? (
            <Button
              variant="outline"
              render={<Link href={copyHref} />}
            >
              <Copy data-icon="inline-start" />
              ตรวจสอบและทำสำเนา
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              <Copy data-icon="inline-start" />
              เลือกงานที่จะทำสำเนา
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

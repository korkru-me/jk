'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { AssignmentClassroomOption } from '@/components/assignments/create-assignment-form'
import type { AssignmentStatus, AssignmentType } from '@/lib/types'
import { assignmentCopyHref } from '@/lib/assignment-creation'

export interface ReusableAssignmentOption {
  id: string
  classroomId: string
  title: string
  type: AssignmentType
  status: AssignmentStatus
  createdAt: string
}

export function ReuseAssignmentCard({
  targetClassroomId,
  classrooms,
  assignments,
}: {
  targetClassroomId: string
  classrooms: AssignmentClassroomOption[]
  assignments: ReusableAssignmentOption[]
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

  if (sourceClassrooms.length === 0) {
    return (
      <Card padding="lg" className="flex max-w-3xl items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Copy className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">ยังไม่มีงานจากห้องอื่นให้นำมาใช้</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เมื่อมีแบบฝึกหัดหรือข้อสอบในห้องเรียนอื่น งานเหล่านั้นจะมาแสดงให้เลือกที่นี่
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
              <SelectTrigger className="w-full">
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
              <SelectTrigger className="w-full">
                <SelectValue placeholder={availableAssignments.length === 0 ? 'ห้องนี้ยังไม่มีงาน' : 'เลือกแบบฝึกหัดหรือข้อสอบ'}>
                  {value => availableAssignments.find(assignment => assignment.id === value)?.title ?? 'เลือกแบบฝึกหัดหรือข้อสอบ'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableAssignments.map(assignment => (
                    <SelectItem key={assignment.id} value={assignment.id}>
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4" aria-hidden="true" />
                        <span className="truncate">{assignment.title}</span>
                        <Badge variant="secondary">{assignment.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'}</Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            ระบบเติมข้อมูล การตั้งค่า และโจทย์เดิมให้แก้ไขก่อน โดยไม่คัดลอกนักเรียน การส่งงาน หรือคะแนน
          </p>
          {assignmentId ? (
            <Button
              variant="outline"
              render={<Link href={assignmentCopyHref(targetClassroomId, assignmentId)} />}
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

'use client'

import Link from 'next/link'
import {
  Activity,
  ChevronLeft,
  ClipboardCheck,
  Eye,
  FileClock,
  FileText,
  LayoutDashboard,
  Pencil,
  Play,
  Presentation,
  Radio,
  Square,
  Trash2,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { withBackHref } from '@/lib/back-link'
import { classroomNavigationPath } from '@/lib/classroom-navigation'
import type { Assignment } from '@/lib/types'

const STATUS_META = {
  draft: { label: 'ร่าง', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  published: { label: 'เผยแพร่แล้ว', color: 'bg-success/10 text-success', dot: 'bg-success' },
  closed: { label: 'ปิดแล้ว', color: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
} as const

export type AssignmentDetailTab = 'overview' | 'questions' | 'students'

const TABS: { key: AssignmentDetailTab; label: string; icon: typeof Users }[] = [
  { key: 'overview', label: 'ภาพรวม', icon: Activity },
  { key: 'questions', label: 'โจทย์', icon: FileText },
  { key: 'students', label: 'นักเรียน', icon: Users },
]

export type AssignmentSidebarSummary = Pick<
  Assignment,
  | 'id'
  | 'classroom_id'
  | 'status'
  | 'title'
  | 'type'
  | 'mode'
  | 'question_ids'
  | 'random_question_count'
  | 'completion_rule'
  | 'streak_target'
> & { classrooms: { name: string } | null }

interface AssignmentContextNavigationProps {
  assignment: AssignmentSidebarSummary
  activeTab?: AssignmentDetailTab
  currentSection?: 'detail' | 'edit'
  studentCount?: number
  pendingCount?: number
  pendingReviewCapped?: boolean
  gradeHref: string
  availableQuestionCount: number
  missingQuestionCount: number
  duplicateQuestionCount: number
  isPending: boolean
  onTabChange?: (tab: AssignmentDetailTab) => void
  onPublish: () => void
  onCloseExam: () => void
  onDelete: () => void
  onClose?: () => void
}

export function AssignmentContextNavigation({
  assignment: a,
  activeTab,
  currentSection = 'detail',
  studentCount,
  pendingCount = 0,
  pendingReviewCapped = false,
  gradeHref,
  availableQuestionCount,
  missingQuestionCount,
  duplicateQuestionCount,
  isPending,
  onTabChange,
  onPublish,
  onCloseExam,
  onDelete,
  onClose,
}: AssignmentContextNavigationProps) {
  const statusMeta = STATUS_META[a.status]
  const assignmentTypeLabel = a.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'
  const isOpeningAgain = a.status === 'closed'
  const canOpenAssignment = a.status === 'draft' || isOpeningAgain
  const openActionLabel = isOpeningAgain ? 'เปิดให้ทำอีกครั้ง' : 'เผยแพร่'
  const questionsReady = availableQuestionCount > 0
    && missingQuestionCount === 0
    && duplicateQuestionCount === 0

  function runAction(action: () => void) {
    action()
    onClose?.()
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button
        variant="ghost"
        className="w-full justify-start"
        render={<Link href={classroomNavigationPath(a.classroom_id, 'assignments')} onClick={onClose} />}
      >
        <ChevronLeft data-icon="inline-start" />
        กลับไปงานที่มอบหมาย
      </Button>

      <Card radius="md" padding="sm" className="flex flex-col gap-2.5 border-primary/20 bg-primary/5">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className={statusMeta.color}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </Badge>
          <Badge variant="outline">{assignmentTypeLabel}</Badge>
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 font-bold leading-snug text-foreground" title={a.title}>{a.title}</p>
          {a.classrooms?.name && (
            <p className="mt-1 truncate text-xs text-muted-foreground" title={a.classrooms.name}>
              ห้องหลัก · {a.classrooms.name}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileText aria-hidden="true" className="size-3.5 text-primary" />
            <strong className="font-medium text-foreground">{assignmentSizeLabel(a)}</strong>
            {missingQuestionCount > 0 && <span className="text-warning">· หาย {missingQuestionCount}</span>}
            {duplicateQuestionCount > 0 && <span className="text-warning">· ซ้ำ {duplicateQuestionCount}</span>}
          </span>
          {studentCount !== undefined && (
            <span className="flex items-center gap-1.5">
              <Users aria-hidden="true" className="size-3.5 text-primary" />
              <strong className="font-medium text-foreground">{studentCount}</strong> คน
            </span>
          )}
        </div>
      </Card>

      <Separator />

      <div className="px-2 text-xs font-medium text-muted-foreground">ในงานนี้</div>
      <nav aria-label="เมนูในงานที่มอบหมาย" className="flex flex-col gap-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          const selected = currentSection === 'detail' && tab.key === activeTab
          const content = (
            <>
              <Icon data-icon="inline-start" />
              {tab.label}
              {tab.key === 'students' && studentCount !== undefined && studentCount > 0 && (
                <Badge variant="secondary" className="ml-auto">{studentCount}</Badge>
              )}
              {tab.key === 'questions' && (
                <Badge variant="secondary" className="ml-auto">{availableQuestionCount}</Badge>
              )}
            </>
          )

          if (onTabChange && currentSection === 'detail') {
            return (
              <Button
                key={tab.key}
                type="button"
                variant={selected ? 'navigation' : 'ghost'}
                className="w-full justify-start"
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  onTabChange(tab.key)
                  onClose?.()
                }}
              >
                {content}
              </Button>
            )
          }

          return (
            <Button
              key={tab.key}
              variant="ghost"
              className="w-full justify-start"
              render={<Link href={`/assignments/${a.id}?tab=${tab.key}`} onClick={onClose} />}
            >
              {content}
            </Button>
          )
        })}
      </nav>

      <Separator />

      <div className="px-2 text-xs font-medium text-muted-foreground">การทำงาน</div>
      <div className="flex flex-col gap-1.5">
        {canOpenAssignment && (
          <>
            <Button
              onClick={() => runAction(onPublish)}
              disabled={isPending || !questionsReady}
              size="sm"
              className="w-full justify-start border-0 bg-success text-success-foreground hover:bg-success/90"
            >
              <Play data-icon="inline-start" /> {openActionLabel}
            </Button>
            {!questionsReady && (
              <p className="px-2 text-xs leading-5 text-warning">
                {missingQuestionCount > 0
                  ? `ตรวจและแก้โจทย์ที่หายก่อน${openActionLabel}`
                  : duplicateQuestionCount > 0
                    ? `ลบรายการโจทย์ซ้ำก่อน${openActionLabel}`
                    : `เพิ่มโจทย์อย่างน้อย 1 ข้อก่อน${openActionLabel}`}
              </p>
            )}
          </>
        )}
        {a.status === 'published' && (
          <Button
            onClick={() => runAction(onCloseExam)}
            disabled={isPending}
            size="sm"
            variant="destructive"
            className="w-full justify-start"
          >
            <Square data-icon="inline-start" /> ปิด{assignmentTypeLabel}
          </Button>
        )}
        {a.mode === 'online' && questionsReady && (
          <Button
            size="sm"
            variant="ghost"
            render={<Link href={`/assignments/${a.id}/preview`} target="_blank" rel="noopener noreferrer" onClick={onClose} />}
            className="w-full justify-start"
          >
            <Eye data-icon="inline-start" /> ดูตัวอย่างนักเรียน
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          render={<Link href={gradeHref} onClick={onClose} />}
          className="w-full justify-start"
        >
          <ClipboardCheck data-icon="inline-start" />
          {pendingCount > 0
            ? `ตรวจให้คะแนน ${pendingCount}${pendingReviewCapped ? '+' : ''} ชิ้น`
            : 'ตรวจให้คะแนน / ดูคำตอบ'}
        </Button>
        <Button
          size="sm"
          variant={currentSection === 'edit' ? 'navigation' : 'ghost'}
          aria-current={currentSection === 'edit' ? 'page' : undefined}
          render={<Link href={`/assignments/${a.id}/edit`} onClick={onClose} />}
          className="w-full justify-start"
        >
          <Pencil data-icon="inline-start" /> แก้ไขรายละเอียด
        </Button>
        {questionsReady && (
          <Button
            size="sm"
            variant="ghost"
            render={(
              <Link
                href={withBackHref(`/assignments/${a.id}/teach`, `/assignments/${a.id}`)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
              />
            )}
            className="w-full justify-start"
          >
            <Presentation data-icon="inline-start" /> โหมดสอน
          </Button>
        )}
        {a.mode === 'online' && a.type === 'exam' && (
          <>
            <Button
              size="sm"
              variant="ghost"
              render={<Link href={`/assignments/${a.id}/proctor`} onClick={onClose} />}
              className="w-full justify-start"
            >
              <Radio data-icon="inline-start" /> ห้องคุมสอบสด
            </Button>
            <Button
              size="sm"
              variant="ghost"
              render={<Link href={`/assignments/${a.id}/proctor/report`} onClick={onClose} />}
              className="w-full justify-start"
            >
              <FileClock data-icon="inline-start" /> รายงานคุมสอบ
            </Button>
          </>
        )}

        <Separator className="my-1" />

        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => runAction(onDelete)}
          disabled={isPending}
          className="w-full justify-start"
        >
          <Trash2 data-icon="inline-start" /> ลบ{assignmentTypeLabel}
        </Button>
      </div>

      <Separator />
      <Button
        variant="ghost"
        className="w-full justify-start"
        render={<Link href="/dashboard" onClick={onClose} />}
      >
        <LayoutDashboard data-icon="inline-start" />
        เมนูหลัก
      </Button>
    </div>
  )
}

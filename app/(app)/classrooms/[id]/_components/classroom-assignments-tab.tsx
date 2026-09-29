'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Eye,
  Folder,
  Grid3x3,
  Pencil,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { TYPE_CFG } from '@/lib/assignment-display'
import { setAssignmentCategory } from '@/lib/actions/assignment-categories'
import { assignmentCopyHref } from '@/lib/assignment-creation'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import { formatPassingThreshold } from '@/lib/grading'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { computeAssignmentProgress } from '@/lib/classroom-progress'
import { describeGroupTarget } from '@/lib/classroom-groups'
import {
  assignmentCategorySelectItems,
  groupAssignmentsByCategory,
  normalizeAssignmentCategoryId,
  UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE,
  type AssignmentCategory,
} from '@/lib/assignment-categories'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AssignmentCreationMenu } from '@/components/assignments/assignment-creation-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'
import { AssignmentCategoryManager } from './assignment-category-manager'

export interface ClassroomAssignmentRow {
  id: string
  title: string
  type: string
  mode: string
  status: string
  start_at: string | null
  end_at: string | null
  question_ids: string[]
  random_question_count: number | null
  completion_rule: string | null
  streak_target: number | null
  created_at: string
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  max_attempts: number | null
  score_strategy: 'best' | 'average' | 'latest'
  display_order?: number | null
  /** กลุ่มย่อย this room's link hands the งาน to; null = ทั้งห้อง. */
  group_ids?: string[] | null
  /** กลุ่มของงานในห้องนี้; null = ยังไม่จัดกลุ่ม. */
  category_id?: string | null
}

export interface ClassroomAssignmentSubmissionRow {
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  attempt_number: number
}

type TypeFilter = 'all' | 'exercise' | 'exam'

const STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'ฉบับร่าง', bg: 'bg-muted', text: 'text-muted-foreground' },
  published: { label: 'เผยแพร่แล้ว', bg: 'bg-success/10', text: 'text-success' },
  closed: { label: 'ปิดแล้ว', bg: 'bg-destructive/10', text: 'text-destructive' },
}

interface Props {
  classroomId: string
  assignments: ClassroomAssignmentRow[]
  categories: AssignmentCategory[]
  submissions: ClassroomAssignmentSubmissionRow[]
  studentCount: number
  /** The students each กลุ่มย่อย-only งาน was handed to, keyed by assignment id. */
  audienceByAssignment?: Map<string, Set<string>>
  groupNameById?: Map<string, string>
  /** Hand-ins still waiting for a teacher's score, keyed by assignment id. */
  pendingReviewByAssignment?: Record<string, number>
  onViewScores?: () => void
}

export function ClassroomAssignmentsTab({
  classroomId,
  assignments,
  categories: initialCategories,
  submissions,
  studentCount,
  audienceByAssignment,
  groupNameById = new Map(),
  pendingReviewByAssignment,
  onViewScores,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categories, setCategories] = useState(initialCategories)
  const [categoryByAssignment, setCategoryByAssignment] = useState<Record<string, string | null>>(
    () => Object.fromEntries(assignments.map(assignment => [
      assignment.id,
      normalizeAssignmentCategoryId(assignment.category_id, initialCategories),
    ])),
  )
  const [isPending, startTransition] = useTransition()

  const categoryItems = useMemo(() => assignmentCategorySelectItems(categories), [categories])

  const rows = useMemo(
    () => assignments.map(assignment => ({
      ...assignment,
      category_id: normalizeAssignmentCategoryId(categoryByAssignment[assignment.id], categories),
    })),
    [assignments, categories, categoryByAssignment],
  )
  const filtered = rows.filter(assignment => typeFilter === 'all' || assignment.type === typeFilter)
  const sections = groupAssignmentsByCategory(filtered, categories)
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const categoryId of Object.values(categoryByAssignment)) {
      if (categoryId) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
    }
    return counts
  }, [categoryByAssignment])

  function moveToCategory(assignmentId: string, value: string | null) {
    if (value === null) return
    const categoryId = value === UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE ? null : value
    startTransition(async () => {
      const result = await setAssignmentCategory(classroomId, assignmentId, categoryId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCategoryByAssignment(current => ({ ...current, [assignmentId]: categoryId }))
      toast.success(categoryId ? 'ย้ายงานเข้ากลุ่มแล้ว' : 'ย้ายงานไปยังไม่จัดกลุ่มแล้ว')
    })
  }

  function handleCategoriesChange(nextCategories: AssignmentCategory[]) {
    const known = new Set(nextCategories.map(category => category.id))
    setCategories(nextCategories)
    setCategoryByAssignment(current => Object.fromEntries(
      Object.entries(current).map(([assignmentId, categoryId]) => [
        assignmentId,
        categoryId && known.has(categoryId) ? categoryId : null,
      ]),
    ))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={[typeFilter]}
          onValueChange={values => {
            const next = values.at(-1)
            if (next === 'all' || next === 'exercise' || next === 'exam') setTypeFilter(next)
          }}
          aria-label="กรองประเภทงาน"
          size="sm"
          spacing={1}
          className="rounded-xl bg-muted p-1"
        >
          <ToggleGroupItem value="all">ทั้งหมด</ToggleGroupItem>
          <ToggleGroupItem value="exercise">แบบฝึกหัด</ToggleGroupItem>
          <ToggleGroupItem value="exam">ข้อสอบ</ToggleGroupItem>
        </ToggleGroup>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AssignmentCategoryManager
            classroomId={classroomId}
            categories={categories}
            assignmentCounts={assignmentCounts}
            onChange={handleCategoriesChange}
          />
          <AssignmentCreationMenu classroomId={classroomId} size="sm" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          {assignments.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้ห้องนี้' : 'ไม่พบงานที่ตรงกับตัวกรอง'}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(section => {
            const preset = section.category ? groupPreset(section.category.color) : null
            const sectionKey = section.category?.id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE
            return (
              <Card key={sectionKey} edge="ring" className="overflow-hidden">
                {categories.length > 0 && (
                  <div className={cn(
                    'flex items-center gap-2 border-b px-4 py-2.5',
                    preset?.surface ?? 'bg-muted/40',
                  )}>
                    <Folder className={cn('size-4', preset?.text ?? 'text-muted-foreground')} aria-hidden="true" />
                    <h3 className={cn('text-sm font-semibold', preset?.text ?? 'text-muted-foreground')}>
                      {section.category?.name ?? 'ยังไม่จัดกลุ่ม'}
                    </h3>
                    <span className={cn('text-xs', preset?.textMuted ?? 'text-muted-foreground')}>
                      {section.assignments.length} งาน
                    </span>
                  </div>
                )}
                <div className="divide-y divide-border">
                  {section.assignments.map(assignment => {
                    const statusCfg = STATUS_CFG[assignment.status] ?? STATUS_CFG.draft
                    const typeCfg = TYPE_CFG[assignment.type] ?? TYPE_CFG.exam
                    const TypeIcon = typeCfg.icon
                    const passingThreshold = formatPassingThreshold(assignment.passing_type, assignment.passing_value)
                    const audience = audienceByAssignment?.get(assignment.id) ?? null
                    const stats = computeAssignmentProgress(assignment, submissions, audience)
                    const expected = audience?.size ?? studentCount
                    const pendingReview = pendingReviewByAssignment?.[assignment.id] ?? 0
                    const gradeHref = pendingReview > 0
                      ? `/assignments/${assignment.id}/results?pending=1`
                      : `/assignments/${assignment.id}/results`

                    return (
                      <div
                        key={assignment.id}
                        className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <Link href={`/assignments/${assignment.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', typeCfg.bg)}>
                              <TypeIcon className={cn('size-4', typeCfg.text)} />
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground" title={assignment.title}>
                                {assignment.title}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">{assignmentSizeLabel(assignment)}</span>
                                {assignment.group_ids && (
                                  <span className="flex items-center gap-0.5 text-xs font-medium text-tint-1">
                                    <Grid3x3 className="size-3" /> เฉพาะ {describeGroupTarget(assignment.group_ids, groupNameById)}
                                  </span>
                                )}
                                {assignment.max_attempts != null && (
                                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                    <RefreshCw className="size-3" /> ทำได้ {assignment.max_attempts} ครั้ง
                                  </span>
                                )}
                                {passingThreshold && (
                                  <span className="flex items-center gap-0.5 text-xs text-warning">
                                    <Target className="size-3" /> เกณฑ์ผ่าน {passingThreshold}
                                  </span>
                                )}
                                {assignment.max_attempts !== 1 && (
                                  <span className="text-xs text-muted-foreground">· เก็บ{SCORE_STRATEGY_LABELS[assignment.score_strategy]}</span>
                                )}
                                {assignment.end_at && (
                                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                    <Clock className="size-3" /> {new Date(assignment.end_at).toLocaleDateString('th-TH')}
                                  </span>
                                )}
                                {assignment.status !== 'draft' && (
                                  assignment.type === 'exercise' ? (
                                    <span className="flex items-center gap-0.5 text-xs text-success">
                                      <CheckCircle2 className="size-3" /> ทำเสร็จ {stats.completed}/{expected} คน
                                    </span>
                                  ) : (
                                    <>
                                      <span className="flex items-center gap-0.5 text-xs text-primary">
                                        <Users className="size-3" /> เข้าทำ {stats.attempted}/{expected} คน
                                      </span>
                                      {passingThreshold && (
                                        <span className="flex items-center gap-0.5 text-xs text-success">
                                          <CheckCircle2 className="size-3" /> ผ่าน {stats.passed}/{expected} คน
                                        </span>
                                      )}
                                    </>
                                  )
                                )}
                                {pendingReview > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs font-medium text-warning">
                                    <ClipboardCheck className="size-3" /> รอตรวจ {pendingReview} ชิ้น
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>

                          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                            <Select
                              items={categoryItems}
                              value={assignment.category_id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE}
                              onValueChange={value => moveToCategory(assignment.id, value)}
                              disabled={isPending}
                            >
                              <SelectTrigger size="sm" className="w-40 max-w-full" aria-label={`กลุ่มของ ${assignment.title}`}>
                                <Folder />
                                <SelectValue>
                                  {value => categoryItems.find(item => item.value === value)?.label ?? 'ยังไม่จัดกลุ่ม'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end">
                                <SelectGroup>
                                  {categoryItems.map(item => (
                                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', typeCfg.bg, typeCfg.text)}>
                              {typeCfg.label}
                            </span>
                            <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', statusCfg.bg, statusCfg.text)}>
                              {statusCfg.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted/40 p-1 md:justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={(
                              <Link
                                href={`/assignments/${assignment.id}/preview`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`ดู ${assignment.title} ในมุมนักเรียน`}
                                title="เปิดตัวอย่างในมุมนักเรียน"
                              />
                            )}
                          >
                            <Eye data-icon="inline-start" />
                            ดูในมุมนักเรียน
                          </Button>
                          <Button variant="ghost" size="sm" render={<Link href={gradeHref} />}>
                            <ClipboardCheck data-icon="inline-start" />
                            ตรวจให้คะแนน
                            {pendingReview > 0 && <span className="text-xs font-semibold text-warning">{pendingReview}</span>}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={`/assignments/${assignment.id}/edit`} />}
                          >
                            <Pencil data-icon="inline-start" /> แก้ไขรายละเอียด
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={assignmentCopyHref(classroomId, assignment.id)} />}
                          >
                            <Copy data-icon="inline-start" /> ทำสำเนา
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => onViewScores?.()}>
                            <BarChart3 data-icon="inline-start" /> ดูคะแนน
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

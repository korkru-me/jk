'use client'

import { useMemo, useState, useTransition } from 'react'
import { FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  ASSIGNMENT_CATEGORY_NAME_MAX,
  defaultAssignmentCategoryName,
  nextAssignmentCategoryColor,
  type AssignmentCategory,
  type AssignmentCategoryColor,
} from '@/lib/assignment-categories'
import {
  createAssignmentCategory,
  deleteAssignmentCategory,
  updateAssignmentCategory,
} from '@/lib/actions/assignment-categories'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'
import { GroupColorSwatches } from './group-dialogs'

interface Props {
  classroomId: string
  categories: AssignmentCategory[]
  assignmentCounts: ReadonlyMap<string, number>
  onChange: (categories: AssignmentCategory[]) => void
}

export function AssignmentCategoryManager({
  classroomId,
  categories,
  assignmentCounts,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<AssignmentCategoryColor>('purple')
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'th')),
    [categories],
  )

  function resetForm() {
    setEditingId(null)
    setName('')
    setColor(nextAssignmentCategoryColor(categories.map(category => category.color)))
  }

  function beginCreate() {
    setEditingId(null)
    setName(defaultAssignmentCategoryName(categories.map(category => category.name)))
    setColor(nextAssignmentCategoryColor(categories.map(category => category.color)))
  }

  function beginEdit(category: AssignmentCategory) {
    setEditingId(category.id)
    setName(category.name)
    setColor(category.color)
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      if (editingId) {
        const result = await updateAssignmentCategory(classroomId, editingId, { name: trimmed, color })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        onChange(categories.map(category => category.id === result.category.id ? result.category : category))
        toast.success('แก้ไขหมวดงานแล้ว')
      } else {
        const result = await createAssignmentCategory(classroomId, { name: trimmed, color })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        onChange([...categories, result.category])
        toast.success('เพิ่มหมวดงานแล้ว')
      }
      resetForm()
    })
  }

  async function remove(category: AssignmentCategory) {
    const count = assignmentCounts.get(category.id) ?? 0
    const accepted = await confirm({
      title: `ลบหมวด “${category.name}”?`,
      description: count > 0
        ? `หมวดนี้มี ${count} งาน งานทั้งหมดจะยังอยู่และย้ายไป “ยังไม่จัดหมวด”`
        : 'หมวดนี้จะถูกลบถาวร โดยไม่มีงานใดถูกลบ',
      confirmLabel: 'ลบหมวด',
      variant: 'destructive',
    })
    if (!accepted) return
    startTransition(async () => {
      const result = await deleteAssignmentCategory(classroomId, category.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange(categories.filter(item => item.id !== category.id))
      if (editingId === category.id) resetForm()
      toast.success('ลบหมวดแล้ว งานยังอยู่ครบ')
    })
  }

  const isEditing = editingId !== null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (next) beginCreate()
          else resetForm()
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <FolderPlus data-icon="inline-start" />
          จัดการหมวดงาน
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>จัดการหมวดงาน</DialogTitle>
            <DialogDescription>
              หมวดจะแสดงทั้งในหน้าครูและนักเรียน งานที่ยังไม่เลือกหมวดจะอยู่ท้ายรายการ
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {sorted.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                ยังไม่มีหมวด ลองสร้าง “บทที่ 1” หรือ “การบ้านเสริม” ได้เลย
              </p>
            ) : sorted.map(category => {
              const preset = groupPreset(category.color)
              return (
                <div key={category.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className={cn('size-3 shrink-0 rounded-full', preset.solid)} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {assignmentCounts.get(category.id) ?? 0} งาน
                  </span>
                  <IconButton
                    label={`แก้ไขหมวด ${category.name}`}
                    size="sm"
                    onClick={() => beginEdit(category)}
                    disabled={isPending}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`ลบหมวด ${category.name}`}
                    size="sm"
                    variant="destructive"
                    onClick={() => remove(category)}
                    disabled={isPending}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{isEditing ? 'แก้ไขหมวด' : 'เพิ่มหมวดใหม่'}</p>
              {isEditing && (
                <Button variant="ghost" size="xs" type="button" onClick={beginCreate}>
                  ยกเลิกการแก้ไข
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assignment-category-name">ชื่อหมวด</Label>
              <Input
                id="assignment-category-name"
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={ASSIGNMENT_CATEGORY_NAME_MAX}
                placeholder="เช่น บทที่ 1: การเคลื่อนที่"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>สีของหมวด</Label>
              <GroupColorSwatches
                value={color}
                onChange={setColor}
                idPrefix="assignment-category-color"
                ariaLabel="สีของหมวดงาน"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              ปิด
            </Button>
            <Button type="button" onClick={submit} disabled={!name.trim() || isPending}>
              {isPending ? 'กำลังบันทึก…' : isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มหมวด'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  )
}

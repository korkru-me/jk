'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Check, ChevronDown, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
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

const NEW_CATEGORY = 'new'

export function AssignmentCategoryManager({
  classroomId,
  categories,
  assignmentCounts,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<AssignmentCategoryColor>('purple')
  const [colorPickerTarget, setColorPickerTarget] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const activeEditorRef = useRef<string | null>(null)

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'th')),
    [categories],
  )

  function resetEditor() {
    activeEditorRef.current = null
    setEditingId(null)
    setCreating(false)
    setName('')
    setColorPickerTarget(null)
  }

  function beginCreate() {
    activeEditorRef.current = NEW_CATEGORY
    setEditingId(null)
    setCreating(true)
    setName(defaultAssignmentCategoryName(categories.map(category => category.name)))
    setColor(nextAssignmentCategoryColor(categories.map(category => category.color)))
    setColorPickerTarget(null)
  }

  function beginEdit(category: AssignmentCategory, showColors = false) {
    activeEditorRef.current = category.id
    setCreating(false)
    setEditingId(category.id)
    setName(category.name)
    setColor(category.color)
    setColorPickerTarget(showColors ? category.id : null)
  }

  function toggleEditColors(category: AssignmentCategory) {
    if (editingId !== category.id) {
      beginEdit(category, true)
      return
    }
    setColorPickerTarget(current => current === category.id ? null : category.id)
  }

  function saveEdit(nextColor = color) {
    if (!editingId) return
    const trimmed = name.trim()
    if (!trimmed) return
    const categoryId = editingId
    const original = categories.find(category => category.id === categoryId)
    if (original?.name === trimmed && original.color === nextColor) {
      if (activeEditorRef.current === categoryId) resetEditor()
      return
    }
    startTransition(async () => {
      const result = await updateAssignmentCategory(classroomId, categoryId, { name: trimmed, color: nextColor })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange(categories.map(category => category.id === result.category.id ? result.category : category))
      if (activeEditorRef.current === categoryId) resetEditor()
      toast.success('แก้ไขกลุ่มงานแล้ว')
    })
  }

  function createCategory() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createAssignmentCategory(classroomId, { name: trimmed, color })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange([...categories, result.category])
      resetEditor()
      toast.success('เพิ่มกลุ่มงานแล้ว')
    })
  }

  async function remove(category: AssignmentCategory) {
    const count = assignmentCounts.get(category.id) ?? 0
    const accepted = await confirm({
      title: `ลบกลุ่ม “${category.name}”?`,
      description: count > 0
        ? `กลุ่มนี้มี ${count} งาน งานทั้งหมดจะยังอยู่และย้ายไป “ยังไม่จัดกลุ่ม”`
        : 'กลุ่มนี้จะถูกลบถาวร โดยไม่มีงานใดถูกลบ',
      confirmLabel: 'ลบกลุ่ม',
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
      if (editingId === category.id) resetEditor()
      toast.success('ลบกลุ่มแล้ว งานยังอยู่ครบ')
    })
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          resetEditor()
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <FolderPlus data-icon="inline-start" />
          จัดการกลุ่มงาน
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>จัดการกลุ่มงาน</DialogTitle>
            <DialogDescription>
              แก้ชื่อหรือเลือกสีแล้วคลิกออกเพื่อบันทึก งานที่ไม่เลือกกลุ่มจะอยู่ท้ายรายการ
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{sorted.length} กลุ่ม</p>
            <Button type="button" size="sm" onClick={beginCreate} disabled={creating || isPending}>
              <Plus data-icon="inline-start" />
              เพิ่มกลุ่ม
            </Button>
          </div>

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
            {creating && (
              <CategoryEditorRow
                target={NEW_CATEGORY}
                name={name}
                color={color}
                assignmentCount={0}
                colorsOpen={colorPickerTarget === NEW_CATEGORY}
                pending={isPending}
                submitLabel="เพิ่มกลุ่ม"
                onNameChange={setName}
                onToggleColors={() => setColorPickerTarget(current => current === NEW_CATEGORY ? null : NEW_CATEGORY)}
                onColorChange={next => {
                  setColor(next)
                  setColorPickerTarget(null)
                }}
                onCancel={resetEditor}
                onSubmit={createCategory}
              />
            )}

            {sorted.length === 0 && !creating ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                ยังไม่มีกลุ่ม กด “เพิ่มกลุ่ม” เพื่อเริ่มจัดงาน
              </p>
            ) : sorted.map(category => {
              const isEditing = editingId === category.id
              if (isEditing) {
                return (
                  <CategoryEditorRow
                    key={category.id}
                    target={category.id}
                    name={name}
                    color={color}
                    assignmentCount={assignmentCounts.get(category.id) ?? 0}
                    colorsOpen={colorPickerTarget === category.id}
                    pending={isPending}
                    autoSaveOnBlur
                    onNameChange={setName}
                    onToggleColors={() => toggleEditColors(category)}
                    onColorChange={setColor}
                    onCancel={resetEditor}
                    onSubmit={saveEdit}
                  />
                )
              }

              const preset = groupPreset(category.color)
              return (
                <div key={category.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <IconButton
                    label={`เปลี่ยนสีกลุ่ม ${category.name}`}
                    size="sm"
                    type="button"
                    onClick={() => toggleEditColors(category)}
                    disabled={isPending}
                  >
                    <span className={cn('size-3 rounded-full', preset.solid)} aria-hidden="true" />
                  </IconButton>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {assignmentCounts.get(category.id) ?? 0} งาน
                  </span>
                  <IconButton
                    label={`แก้ไขกลุ่ม ${category.name}`}
                    size="sm"
                    type="button"
                    onClick={() => beginEdit(category)}
                    disabled={isPending}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`ลบกลุ่ม ${category.name}`}
                    size="sm"
                    type="button"
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

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  )
}

function CategoryEditorRow({
  target,
  name,
  color,
  assignmentCount,
  colorsOpen,
  pending,
  submitLabel,
  autoSaveOnBlur = false,
  onNameChange,
  onToggleColors,
  onColorChange,
  onCancel,
  onSubmit,
}: {
  target: string
  name: string
  color: AssignmentCategoryColor
  assignmentCount: number
  colorsOpen: boolean
  pending: boolean
  submitLabel?: string
  autoSaveOnBlur?: boolean
  onNameChange: (name: string) => void
  onToggleColors: () => void
  onColorChange: (color: AssignmentCategoryColor) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const preset = groupPreset(color)
  const colorPanelId = `assignment-category-colors-${target}`

  return (
    <div
      className="rounded-lg border bg-muted/20"
      onBlur={event => {
        if (!autoSaveOnBlur || pending || !name.trim()) return
        const nextTarget = event.relatedTarget
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
        window.setTimeout(onSubmit, 0)
      }}
    >
      <form
        className="flex items-center gap-2 p-2"
        onSubmit={event => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <Button
          variant="outline"
          size="sm"
          type="button"
          aria-label="เปลี่ยนสีกลุ่ม"
          aria-expanded={colorsOpen}
          aria-controls={colorPanelId}
          onClick={onToggleColors}
          disabled={pending}
          className="shrink-0"
        >
          <span className={cn('size-3 rounded-full', preset.solid)} aria-hidden="true" />
          สี
          <ChevronDown data-icon="inline-end" className={cn('transition-transform', colorsOpen && 'rotate-180')} />
        </Button>
        <Input
          value={name}
          onChange={event => onNameChange(event.target.value)}
          maxLength={ASSIGNMENT_CATEGORY_NAME_MAX}
          placeholder="ชื่อกลุ่ม เช่น บทที่ 1"
          aria-label="ชื่อกลุ่ม"
          autoFocus
          onFocus={event => event.currentTarget.select()}
          disabled={pending}
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{assignmentCount} งาน</span>
        {!autoSaveOnBlur && submitLabel && (
          <IconButton
            label={submitLabel}
            size="sm"
            type="submit"
            disabled={!name.trim() || pending}
          >
            <Check />
          </IconButton>
        )}
        <IconButton
          label="ยกเลิก"
          size="sm"
          type="button"
          onClick={onCancel}
          disabled={pending}
        >
          <X />
        </IconButton>
      </form>
      {colorsOpen && (
        <div id={colorPanelId} className="border-t px-3 py-2">
          <GroupColorSwatches
            value={color}
            onChange={onColorChange}
            idPrefix={`assignment-category-color-${target}`}
            ariaLabel="เลือกสีของกลุ่มงาน"
          />
        </div>
      )}
    </div>
  )
}

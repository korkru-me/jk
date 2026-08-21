'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createCategory, updateCategory, deleteCategory, reorderCategory, seedGradeCategories, bulkCreateCategories } from '@/lib/actions/admin'
import { Textarea } from '@/components/ui/textarea'
import type { QuestionCategory } from '@/lib/types'

type CategoryWithCount = QuestionCategory & { question_count: number; children?: CategoryWithCount[] }

// ─── Single row ──────────────────────────────────────────────
function CategoryRow({
  cat,
  isChild,
  onEdit,
  onAddChild,
}: {
  cat: CategoryWithCount
  isChild: boolean
  onEdit: (cat: CategoryWithCount) => void
  onAddChild: (parentId: string) => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(`ลบหมวด "${cat.name}"?`)) return
    startTransition(async () => {
      const res = await deleteCategory(cat.id)
      if (res?.error) toast.error(res.error)
      else toast.success('ลบหมวดแล้ว')
    })
  }

  function handleReorder(dir: 'up' | 'down') {
    startTransition(async () => {
      const res = await reorderCategory(cat.id, dir)
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${isChild ? 'ml-8' : ''}`}>
      <div className="flex flex-col gap-0.5">
        <button onClick={() => handleReorder('up')} disabled={isPending} className="text-muted-foreground hover:text-muted-foreground disabled:opacity-30 text-xs leading-none">▲</button>
        <button onClick={() => handleReorder('down')} disabled={isPending} className="text-muted-foreground hover:text-muted-foreground disabled:opacity-30 text-xs leading-none">▼</button>
      </div>
      <span className="text-lg">{isChild ? '↳' : '📂'}</span>
      <div className="flex-1">
        <p className="font-medium text-foreground">{cat.name}</p>
        <p className="text-xs text-muted-foreground">{cat.question_count} โจทย์</p>
      </div>
      <div className="flex items-center gap-2">
        {!isChild && (
          <Button variant="link" size="xs" onClick={() => onAddChild(cat.id)}>+ หมวดย่อย</Button>
        )}
        <Button variant="link" size="xs" onClick={() => onEdit(cat)} className="text-muted-foreground">แก้ไข</Button>
        <Button variant="link" size="xs" onClick={handleDelete} disabled={isPending} className="disabled:opacity-50">ลบ</Button>
      </div>
    </div>
  )
}

// ─── Seed button ─────────────────────────────────────────────
function SeedButton() {
  const [isPending, startTransition] = useTransition()

  function handleSeed() {
    startTransition(async () => {
      const res = await seedGradeCategories()
      if (res?.error) toast.error(res.error)
      else toast.success(res?.message ?? 'เสร็จแล้ว')
    })
  }

  return (
    <Button variant="outline" onClick={handleSeed} disabled={isPending}>
      {isPending ? 'กำลังสร้าง...' : 'สร้างหมวดหมู่ตามระดับชั้น'}
    </Button>
  )
}

// ─── Bulk paste ──────────────────────────────────────────────
// For standing up a whole category tree at once — e.g. the list printed by
// scripts/moodle-mbz-to-korkru.mjs when converting a Moodle question bank.
function BulkAddButton() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()

  const lineCount = text.split('\n').filter(l => l.trim()).length

  function handleSubmit() {
    if (!text.trim()) { toast.error('วางรายการหมวดก่อน'); return }
    startTransition(async () => {
      const res = await bulkCreateCategories(text)
      if (res?.error) toast.error(res.error)
      else { toast.success(res?.message ?? 'เสร็จแล้ว'); setText(''); setOpen(false) }
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>วางรายการหมวด</Button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มหมวดจากรายการ</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>หนึ่งบรรทัดต่อหนึ่งหมวด — ใช้ <code>/</code> คั่นเพื่อสร้างหมวดย่อย</Label>
            {/* Textarea grows with its content (field-sizing-content), and a
                pasted category tree runs to hundreds of lines — so it needs a
                ceiling of its own, or it pushes the dialog's own scrolling to
                its limit and buries the submit button. */}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="max-h-[45vh] overflow-y-auto font-mono text-sm"
              placeholder={'กลศาสตร์\nกลศาสตร์ / เวกเตอร์และการแตกแรง\nคลื่นกล / ส่วนประกอบคลื่น'}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {lineCount > 0 ? `${lineCount} บรรทัด` : 'ยังไม่มีรายการ'} — หมวดที่มีอยู่แล้วจะถูกข้าม
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'กำลังสร้าง...' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Main component ──────────────────────────────────────────
export function CategoriesTree({
  categories,
  allCategories,
}: {
  categories: CategoryWithCount[]
  allCategories: QuestionCategory[]
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CategoryWithCount | null>(null)
  const [editName, setEditName] = useState('')
  const [isPending, startTransition] = useTransition()

  function openAdd(presetParentId = '') {
    setName('')
    setParentId(presetParentId)
    setAddOpen(true)
  }

  function handleAdd() {
    if (!name.trim()) { toast.error('กรอกชื่อหมวด'); return }
    const maxOrder = allCategories
      .filter((c) => (parentId ? c.parent_id === parentId : !c.parent_id))
      .reduce((m, c) => Math.max(m, c.order), -1) + 1
    startTransition(async () => {
      const res = await createCategory(name, parentId, maxOrder)
      if (res?.error) toast.error(res.error)
      else { toast.success('เพิ่มหมวดแล้ว'); setAddOpen(false) }
    })
  }

  function openEdit(cat: CategoryWithCount) {
    setEditTarget(cat)
    setEditName(cat.name)
  }

  function handleEdit() {
    if (!editTarget || !editName.trim()) return
    startTransition(async () => {
      const res = await updateCategory(editTarget.id, editName)
      if (res?.error) toast.error(res.error)
      else { toast.success('อัปเดตชื่อแล้ว'); setEditTarget(null) }
    })
  }

  // Build tree
  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  return (
    <>
      <div className="flex justify-between mb-4">
        <div className="flex gap-2">
          <SeedButton />
          <BulkAddButton />
        </div>
        <Button onClick={() => openAdd()}>+ เพิ่มหมวดหลัก</Button>
      </div>

      <div className="space-y-2">
        {parents.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">ยังไม่มีหมวดหมู่</p>
        )}
        {parents.map((parent) => (
          <div key={parent.id} className="space-y-1">
            <CategoryRow
              cat={parent}
              isChild={false}
              onEdit={openEdit}
              onAddChild={openAdd}
            />
            {childrenOf(parent.id).map((child) => (
              <CategoryRow
                key={child.id}
                cat={child}
                isChild
                onEdit={openEdit}
                onAddChild={() => {}}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => !v && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{parentId ? 'เพิ่มหมวดย่อย' : 'เพิ่มหมวดหลัก'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ชื่อหมวด *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น กลศาสตร์"
                autoFocus
              />
            </div>
            {!parentId && allCategories.filter((c) => !c.parent_id).length > 0 && (
              <div className="space-y-1.5">
                <Label>หมวดหลัก (ถ้าต้องการสร้างหมวดย่อย)</Label>
                <Select value={parentId} onValueChange={(v) => v !== null && setParentId(v)}>
                  <SelectTrigger><SelectValue placeholder="— หมวดหลัก —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">ไม่มี (หมวดหลัก)</SelectItem>
                    {allCategories.filter((c) => !c.parent_id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleAdd} disabled={isPending}>
              {isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขหมวด</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>ชื่อหมวด</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={handleEdit} disabled={isPending}>
              {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

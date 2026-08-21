'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createPreset, updatePreset, deletePreset } from '@/lib/actions/admin'
import type { FormulaPreset, Variable, QuestionCategory } from '@/lib/types'

type Preset = FormulaPreset & { question_categories: { name: string } | null }

const EMPTY_FORM = {
  formula_name: '',
  equation: '',
  category_id: '',
  target_variable: '',
  description: '',
  variables_json: '[]',
}

export function PresetsTable({
  presets,
  categories,
}: {
  presets: Preset[]
  categories: QuestionCategory[]
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [editTarget, setEditTarget] = useState<Preset | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [jsonError, setJsonError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setJsonError('')
    setDialogOpen(true)
  }

  function openEdit(preset: Preset) {
    setForm({
      formula_name: preset.formula_name,
      equation: preset.equation,
      category_id: preset.category_id,
      target_variable: preset.target_variable,
      description: preset.description ?? '',
      variables_json: JSON.stringify(preset.variables, null, 2),
    })
    setEditTarget(preset)
    setJsonError('')
    setDialogOpen(true)
  }

  function handleSave() {
    let variables: Variable[]
    try {
      variables = JSON.parse(form.variables_json)
      if (!Array.isArray(variables)) throw new Error('ต้องเป็น Array')
      setJsonError('')
    } catch (e) {
      setJsonError('JSON ไม่ถูกต้อง: ' + (e as Error).message)
      return
    }

    if (!form.formula_name.trim() || !form.equation.trim()) {
      toast.error('กรอกชื่อสูตรและสมการ')
      return
    }

    const data = {
      formula_name: form.formula_name,
      equation: form.equation,
      category_id: form.category_id,
      target_variable: form.target_variable,
      description: form.description,
      variables,
    }

    startTransition(async () => {
      const res = editTarget
        ? await updatePreset(editTarget.id, data)
        : await createPreset(data)
      if (res?.error) toast.error(res.error)
      else {
        toast.success(editTarget ? 'อัปเดตสูตรแล้ว' : 'เพิ่มสูตรแล้ว')
        setDialogOpen(false)
      }
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`ลบสูตร "${name}"?`)) return
    startTransition(async () => {
      const res = await deletePreset(id)
      if (res?.error) toast.error(res.error)
      else toast.success('ลบสูตรแล้ว')
    })
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ เพิ่มสูตรใหม่</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ชื่อสูตร</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">สมการ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">หมวด</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ตัวแปร</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">หาตัวแปร</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {presets.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">ไม่พบสูตรสำเร็จ</td></tr>
            )}
            {presets.map((p) => (
              <tr key={p.id} className="hover:bg-muted transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{p.formula_name}</td>
                <td className="px-4 py-3 font-mono text-primary text-xs">{p.equation}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.question_categories?.name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{(p.variables as Variable[]).length} ตัวแปร</td>
                <td className="px-4 py-3 font-mono text-sm">{p.target_variable}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button variant="link" size="xs" onClick={() => openEdit(p)}>แก้ไข</Button>
                    <Button variant="link" size="xs" onClick={() => handleDelete(p.id, p.formula_name)} className="text-destructive">ลบ</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'แก้ไขสูตร' : 'เพิ่มสูตรใหม่'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ชื่อสูตร *</Label>
              <Input value={form.formula_name} onChange={(e) => setForm({ ...form, formula_name: e.target.value })} placeholder="กฎนิวตันข้อ 2" />
            </div>
            <div className="space-y-1.5">
              <Label>หมวดหมู่</Label>
              <Select value={form.category_id} onValueChange={(v) => v !== null && setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="เลือกหมวด" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>สมการ *</Label>
              <Input value={form.equation} onChange={(e) => setForm({ ...form, equation: e.target.value })} placeholder="เช่น  a = F / m" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>ตัวแปรที่หา (target_variable)</Label>
              <Input value={form.target_variable} onChange={(e) => setForm({ ...form, target_variable: e.target.value })} placeholder="เช่น  a" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>คำอธิบาย</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="ความหมายสูตร..." />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>ตัวแปร (JSON Array)</Label>
              <Textarea
                value={form.variables_json}
                onChange={(e) => setForm({ ...form, variables_json: e.target.value })}
                rows={6}
                className="font-mono text-xs"
                placeholder={'[{"name":"F","min":1,"max":100,"unit":"N","decimals":0},{"name":"m","min":1,"max":50,"unit":"kg","decimals":0}]'}
              />
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              <p className="text-xs text-muted-foreground">แต่ละตัวแปร: name, min, max, unit, decimals</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'กำลังบันทึก...' : editTarget ? 'อัปเดต' : 'เพิ่มสูตร'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { Plus, Palette, BookOpen, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { createClassroom } from '@/lib/actions/classrooms'
import type { ClassroomType } from '@/lib/types'

const SUBJECTS = [
  { value: 'mechanics', label: '⚙️  กลศาสตร์', desc: 'แรง ความเร็ว พลังงาน' },
  { value: 'waves', label: '🌊  คลื่นและแสง', desc: 'เสียง แสง คลื่นแม่เหล็กไฟฟ้า' },
  { value: 'electricity', label: '⚡  ไฟฟ้าและแม่เหล็ก', desc: 'ไฟฟ้ากระแส สนามแม่เหล็ก' },
  { value: 'particle', label: '⚛️  ฟิสิกส์อนุภาค', desc: 'อนุภาคมูลฐาน โมเดลมาตรฐาน' },
  { value: 'thermo', label: '🔥  อุณหพลศาสตร์', desc: 'ความร้อน แก๊ส เอนโทรปี' },
  { value: 'modern', label: '🔭  ฟิสิกส์สมัยใหม่', desc: 'ควอนตัม สัมพัทธภาพ' },
]

const COVER_COLORS = [
  'from-blue-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-orange-400 to-rose-500',
  'from-cyan-500 to-blue-500',
  'from-purple-500 to-pink-500',
  'from-amber-400 to-orange-500',
]

export function CreateClassroomModal() {
  const [open, setOpen] = useState(false)
  const [classroomType, setClassroomType] = useState<ClassroomType>('subject')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0])
  const [isPending, startTransition] = useTransition()

  function reset() {
    setClassroomType('subject')
    setName('')
    setDescription('')
    setSubject('')
    setCoverColor(COVER_COLORS[0])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('กรุณากรอกชื่อห้องเรียน'); return }
    const subjectLabel = SUBJECTS.find(s => s.value === subject)?.label ?? ''
    const fullDesc = classroomType === 'subject'
      ? [subjectLabel ? `วิชา: ${subjectLabel}` : '', description.trim()].filter(Boolean).join(' · ')
      : description.trim()
    startTransition(async () => {
      const res = await createClassroom({ name: name.trim(), description: fullDesc, classroomType })
      if (res?.error) toast.error(res.error)
      else { reset(); setOpen(false) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 shadow-sm" />}>
        <Plus className="w-4 h-4" />
        สร้างห้องเรียน
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>สร้างห้องเรียนใหม่</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {/* Classroom type */}
          <div className="space-y-1.5">
            <Label>ประเภทห้องเรียน</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setClassroomType('subject')}
                className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all text-xs ${
                  classroomType === 'subject'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium leading-tight">ห้องเรียนวิชา</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">มอบหมายการบ้าน สอบ ให้คะแนน</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setClassroomType('homeroom')}
                className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all text-xs ${
                  classroomType === 'homeroom'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <Users className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium leading-tight">ห้อง Homeroom</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">ครูที่ปรึกษาติดตามการส่งงานทุกวิชา</p>
                </div>
              </button>
            </div>
          </div>

          {/* Cover preview */}
          <div className={`h-16 rounded-xl bg-gradient-to-br ${coverColor} flex items-center px-5 transition-all duration-300`}>
            <p className="text-white font-bold text-lg truncate">{name || 'ชื่อห้องเรียน'}</p>
          </div>

          {/* Cover color picker */}
          <div>
            <Label className="text-xs text-gray-500 flex items-center gap-1 mb-2">
              <Palette className="w-3 h-3" /> สีหน้าปก
            </Label>
            <div className="flex gap-2">
              {COVER_COLORS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setCoverColor(g)}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br ${g} transition-all ${
                    coverColor === g ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="new-name">ชื่อห้องเรียน <span className="text-red-500">*</span></Label>
            <Input
              id="new-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={classroomType === 'homeroom' ? 'เช่น ที่ปรึกษา ม.4/1' : 'เช่น ฟิสิกส์ ม.4/1'}
              autoFocus
            />
          </div>

          {/* Subject (subject classrooms only) */}
          {classroomType === 'subject' && (
            <div className="space-y-1.5">
              <Label>รายวิชา / บท</Label>
              <div className="grid grid-cols-2 gap-2">
                {SUBJECTS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSubject(s.value === subject ? '' : s.value)}
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all text-xs ${
                      subject === s.value
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <span className="text-base leading-none mt-0.5">{s.label.split('  ')[0]}</span>
                    <div>
                      <p className="font-medium leading-tight">{s.label.split('  ')[1]}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="new-desc">หมายเหตุ (ไม่บังคับ)</Label>
            <Textarea
              id="new-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={classroomType === 'homeroom' ? 'ครูที่ปรึกษา · ภาคเรียนที่ 1/2568' : 'ภาคเรียนที่ 1/2568 · กลุ่ม A'}
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? 'กำลังสร้าง...' : 'สร้างห้องเรียน'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

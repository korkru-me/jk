'use client'

import { useState } from 'react'
import { Users, Plus, Shuffle, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Student { id: string; name: string; initials: string }
interface Group { id: string; name: string; students: Student[] }

const GROUP_COLORS = [
  'border-primary/20 bg-primary/10',
  'border-violet-200 bg-violet-50/50',
  'border-success/20 bg-success/10',
  'border-warning/20 bg-warning/10',
  'border-rose-200 bg-rose-50/50',
]
const GROUP_HEADER_COLORS = [
  'bg-primary/10 text-primary',
  'bg-violet-100 text-violet-700',
  'bg-success/10 text-success',
  'bg-warning/10 text-warning',
  'bg-rose-100 text-rose-700',
]

interface Props {
  students: { id: string; full_name: string }[]
}

export function BreakoutGroups({ students }: Props) {
  const [unassigned, setUnassigned] = useState<Student[]>(
    students.slice(0, 20).map(s => ({ id: s.id, name: s.full_name, initials: s.full_name.slice(0, 2) }))
  )
  const [groups, setGroups] = useState<Group[]>([
    { id: 'g1', name: 'กลุ่มทดลองที่ 1', students: [] },
    { id: 'g2', name: 'กลุ่มทดลองที่ 2', students: [] },
    { id: 'g3', name: 'กลุ่มทดลองที่ 3', students: [] },
    { id: 'g4', name: 'กลุ่มทดลองที่ 4', students: [] },
    { id: 'g5', name: 'กลุ่มทดลองที่ 5', students: [] },
  ])
  const [dragging, setDragging] = useState<{ studentId: string; fromGroupId: string | null } | null>(null)

  function startDrag(studentId: string, fromGroupId: string | null) {
    setDragging({ studentId, fromGroupId })
  }

  function dropOnGroup(toGroupId: string) {
    if (!dragging) return
    const { studentId, fromGroupId } = dragging

    let student: Student | undefined

    if (fromGroupId === null) {
      student = unassigned.find(s => s.id === studentId)
      setUnassigned(prev => prev.filter(s => s.id !== studentId))
    } else {
      const fromGroup = groups.find(g => g.id === fromGroupId)
      student = fromGroup?.students.find(s => s.id === studentId)
      setGroups(prev => prev.map(g =>
        g.id === fromGroupId ? { ...g, students: g.students.filter(s => s.id !== studentId) } : g
      ))
    }

    if (student) {
      setGroups(prev => prev.map(g =>
        g.id === toGroupId ? { ...g, students: [...g.students, student!] } : g
      ))
    }
    setDragging(null)
  }

  function dropOnUnassigned() {
    if (!dragging || dragging.fromGroupId === null) return
    const { studentId, fromGroupId } = dragging
    const fromGroup = groups.find(g => g.id === fromGroupId)
    const student = fromGroup?.students.find(s => s.id === studentId)
    if (student) {
      setGroups(prev => prev.map(g =>
        g.id === fromGroupId ? { ...g, students: g.students.filter(s => s.id !== studentId) } : g
      ))
      setUnassigned(prev => [...prev, student])
    }
    setDragging(null)
  }

  function autoAssign() {
    const allStudents = [...unassigned, ...groups.flatMap(g => g.students)]
    const shuffled = [...allStudents].sort(() => Math.random() - 0.5)
    const newGroups = groups.map((g, i) => ({ ...g, students: [] as Student[] }))
    shuffled.forEach((s, i) => newGroups[i % newGroups.length].students.push(s))
    setGroups(newGroups)
    setUnassigned([])
    toast.success('แบ่งกลุ่มสุ่มแล้ว')
  }

  function addGroup() {
    const n = groups.length + 1
    setGroups(prev => [...prev, { id: `g${Date.now()}`, name: `กลุ่มทดลองที่ ${n}`, students: [] }])
  }

  function removeGroup(gid: string) {
    const g = groups.find(x => x.id === gid)
    if (!g) return
    setUnassigned(prev => [...prev, ...g.students])
    setGroups(prev => prev.filter(x => x.id !== gid))
  }

  const StudentChip = ({ s, fromGroupId }: { s: Student; fromGroupId: string | null }) => (
    <div
      draggable
      onDragStart={() => startDrag(s.id, fromGroupId)}
      className={`flex items-center gap-1.5 bg-card border border-border rounded-lg px-2 py-1 cursor-grab active:cursor-grabbing select-none hover:border-primary/20 hover:bg-primary/10 transition-colors ${
        dragging?.studentId === s.id ? 'opacity-40' : ''
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
        {s.initials}
      </span>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{s.name}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={autoAssign} className="gap-1.5">
          <Shuffle className="w-3.5 h-3.5" /> แบ่งกลุ่มสุ่ม
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> เพิ่มกลุ่ม
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          ลากรายชื่อนักเรียนเข้ากลุ่มได้เลย
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Unassigned pool */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={dropOnUnassigned}
          className={`border-2 border-dashed rounded-2xl p-4 min-h-[200px] transition-colors ${
            dragging?.fromGroupId !== null ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground">ยังไม่ได้จัดกลุ่ม</p>
            <span className="ml-auto text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">{unassigned.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(s => <StudentChip key={s.id} s={s} fromGroupId={null} />)}
            {unassigned.length === 0 && (
              <p className="text-xs text-gray-300 italic">นักเรียนทุกคนอยู่ในกลุ่มแล้ว</p>
            )}
          </div>
        </div>

        {/* Groups grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {groups.map((group, idx) => (
            <div
              key={group.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => dropOnGroup(group.id)}
              className={`border-2 rounded-2xl p-3 min-h-[140px] transition-colors ${
                dragging ? 'border-primary/20' : GROUP_COLORS[idx % GROUP_COLORS.length]
              }`}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${GROUP_HEADER_COLORS[idx % GROUP_HEADER_COLORS.length]}`}>
                  {group.name}
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">{group.students.length} คน</span>
                <button
                  onClick={() => removeGroup(group.id)}
                  className="ml-auto w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.students.map(s => <StudentChip key={s.id} s={s} fromGroupId={group.id} />)}
                {group.students.length === 0 && (
                  <p className="text-[10px] text-gray-300 italic">ลากนักเรียนมาวางที่นี่</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

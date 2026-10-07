'use client'

import { useCallback, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Settings } from 'lucide-react'
import {
  ClearPendingSidebar, useContextualSidebar, useSidebarContext,
} from '@/components/layout/sidebar-context'
import { ShellClient } from '@/components/layout/shell-client'
import { SidebarButton } from '@/components/layout/sidebar-display'
import { ClassroomContextNavigation } from '@/app/(app)/classrooms/[id]/_components/classroom-context-sidebar'
import { AssignmentContextNavigation } from '@/app/(app)/assignments/[id]/_components/assignment-context-sidebar'
import { TeachingModeSidebar } from '@/components/assignments/teaching-mode-client'
import { classroomNavigationFor, type ClassroomNavigationKey } from '@/lib/classroom-navigation'
import { Button } from '@/components/ui/button'

const SOURCE = '/exam-screen-lab/sidebar-navigation'
const TARGET = `${SOURCE}/assignment`
const CLASSROOM_ID = '00000000-0000-4000-8000-000000000099'

export function SidebarNavigationLabShell({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  return (
    <ShellClient
      user={{ id: CLASSROOM_ID, email: 'sidebar@example.invalid', full_name: 'ครูจำลอง', role: searchParams.get('role') === 'student' ? 'student' : 'teacher' }}
      initialUnreadCount={0}
      notificationsEnabled={false}
    >
      <p className="mb-4 text-xs text-muted-foreground">ห้องทดลองแถบห้องเรียน · ข้อมูลจำลอง · ไม่อ่านหรือบันทึก Supabase</p>
      {children}
    </ShellClient>
  )
}

function LabSidebar({ ready = false, onClose }: { ready?: boolean; onClose?: () => void }) {
  const [activeItem, setActiveItem] = useState<ClassroomNavigationKey>('assignments')
  return (
    <ClassroomContextNavigation
      classroom={{ id: CLASSROOM_ID, name: ready ? 'แถบหน้ามอบหมายงานพร้อมแล้ว' : 'ฟิสิกส์ ห้องจำลอง', description: '', classroom_type: 'subject' }}
      switchableClassrooms={[{ id: 'other', name: 'ห้องจำลองอื่น', description: '' }]}
      backHref={SOURCE}
      navigationItems={classroomNavigationFor('subject', true)}
      activeItem={activeItem}
      studentCount={63}
      onNavigate={setActiveItem}
      onSwitchClassroom={() => undefined}
      onClose={onClose}
      managementActions={<SidebarButton label="ตั้งค่าห้องเรียน" variant="ghost"><Settings data-icon="inline-start" /></SidebarButton>}
    />
  )
}

export function SidebarNavigationLabSource() {
  const [mode, setMode] = useState<'classroom' | 'assignment' | 'global' | 'teaching'>('classroom')
  const render = useCallback((onClose?: () => void) => mode === 'global' ? null : mode === 'classroom' ? <LabSidebar onClose={onClose} /> : mode === 'teaching' ? <LabTeachingSidebar onClose={onClose} /> : (
    <AssignmentContextNavigation
      assignment={{ id: CLASSROOM_ID, classroom_id: CLASSROOM_ID, title: 'ข้อสอบจำลอง', type: 'exam', mode: 'online', status: 'draft', question_ids: ['one'], random_question_count: null, completion_rule: 'fixed', streak_target: null, classrooms: { name: 'ฟิสิกส์ ห้องจำลอง' } }}
      gradeHref={SOURCE}
      studentCount={63}
      pendingCount={5}
      availableQuestionCount={1}
      missingQuestionCount={0}
      duplicateQuestionCount={0}
      isPending={false}
      onPublish={() => undefined}
      onCloseExam={() => undefined}
      onDelete={() => undefined}
      onClose={onClose}
    />
  ), [mode])
  useContextualSidebar(SOURCE, render, CLASSROOM_ID)
  const { prepareSidebarNavigation } = useSidebarContext()
  const reuseHref = `${TARGET}?classroom=${CLASSROOM_ID}`
  const plainHref = `${reuseHref}&plain=1`
  const mismatchHref = `${TARGET}?classroom=another-classroom`

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ทดสอบคงแถบห้องเรียนระหว่างโหลด</h1>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMode('global')}>ดูเมนูหลักจำลอง</Button>
        <Button variant="outline" onClick={() => setMode('classroom')}>ดูเมนูห้องเรียนจำลอง</Button>
        <Button variant="outline" onClick={() => setMode('assignment')}>ดูเมนูงานจำลอง</Button>
        <Button variant="outline" onClick={() => setMode('teaching')}>ดูเมนูโหมดสอนจำลอง</Button>
      </div>
      <Button render={<Link href={reuseHref} prefetch={false} onNavigate={() => prepareSidebarNavigation(reuseHref, CLASSROOM_ID)} />}>
        นำงานเดิมมาใช้ (จำลอง)
      </Button>
      <Button variant="outline" render={<Link href={plainHref} prefetch={false} onNavigate={() => prepareSidebarNavigation(plainHref, CLASSROOM_ID)} />}>
        ปลายทางไม่มีบริบท (จำลอง)
      </Button>
      <Button variant="outline" render={<Link href={mismatchHref} prefetch={false} onNavigate={() => prepareSidebarNavigation(mismatchHref, CLASSROOM_ID)} />}>
        ห้องอื่นต้องไม่รับแถบเดิม
      </Button>
    </div>
  )
}

function LabTeachingSidebar({ onClose }: { onClose?: () => void }) {
  const [question, setQuestion] = useState(true)
  const [saved, setSaved] = useState(true)
  const [board, setBoard] = useState(true)
  return <TeachingModeSidebar
    assignmentTitle="โหมดสอนจำลอง"
    questionIndex={0}
    questionCount={3}
    showQuestion={question}
    showSavedBoards={saved}
    showBoard={board}
    onToggleQuestion={() => setQuestion(value => !value)}
    onToggleSavedBoards={() => setSaved(value => !value)}
    onToggleBoard={() => setBoard(value => !value)}
    onBack={() => undefined}
    onNavigate={onClose}
  />
}

function ReadySidebar() {
  const render = useCallback((onClose?: () => void) => <LabSidebar ready onClose={onClose} />, [])
  useContextualSidebar(TARGET, render, CLASSROOM_ID)
  return null
}

export function SidebarNavigationLabTarget({ classroomId, plain }: { classroomId?: string; plain: boolean }) {
  return (
    <div className="space-y-4">
      {!plain && classroomId === CLASSROOM_ID ? <ReadySidebar /> : <ClearPendingSidebar />}
      <h1 className="text-xl font-bold">หน้ามอบหมายงานโหลดเสร็จแล้ว (จำลอง)</h1>
      <Button variant="outline" render={<Link href={SOURCE} />}>
        กลับห้องทดลอง
      </Button>
    </div>
  )
}

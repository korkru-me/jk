'use client'

import { useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AssignmentContextNavigation, type AssignmentSidebarSummary } from '../../_components/assignment-context-sidebar'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteAssignment, updateAssignmentStatus } from '@/lib/actions/assignments'

interface AssignmentEditSidebarProps {
  assignment: AssignmentSidebarSummary
  availableQuestionCount: number
  missingQuestionCount: number
  duplicateQuestionCount: number
}

export function AssignmentEditSidebar({
  assignment: a,
  availableQuestionCount,
  missingQuestionCount,
  duplicateQuestionCount,
}: AssignmentEditSidebarProps) {
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()
  const assignmentTypeLabel = a.type === 'exam' ? 'ข้อสอบ' : 'แบบฝึกหัด'

  const publish = useCallback(() => {
    startTransition(async () => {
      const result = await updateAssignmentStatus(a.id, 'published')
      if (result?.error) toast.error(result.error)
      else {
        toast.success(a.status === 'closed'
          ? `เปิด${assignmentTypeLabel}ให้ทำอีกครั้งแล้ว`
          : `เผยแพร่${assignmentTypeLabel}แล้ว`)
        router.refresh()
      }
    })
  }, [a.id, a.status, assignmentTypeLabel, router])

  const close = useCallback(() => {
    startTransition(async () => {
      const result = await updateAssignmentStatus(a.id, 'closed')
      if (result?.error) toast.error(result.error)
      else {
        toast.success(`ปิด${assignmentTypeLabel}แล้ว`)
        router.refresh()
      }
    })
  }, [a.id, assignmentTypeLabel, router])

  const handleDelete = useCallback(async () => {
    const ok = await confirm({
      title: `ลบ${assignmentTypeLabel}นี้?`,
      description: `ข้อมูลการทำและการส่งทั้งหมดของ${assignmentTypeLabel}นี้จะถูกลบถาวร กู้คืนไม่ได้`,
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => { await deleteAssignment(a.id) })
  }, [a.id, assignmentTypeLabel, confirm])

  const renderContextualSidebar = useCallback((onNavigate?: () => void) => (
    <AssignmentContextNavigation
      assignment={a}
      currentSection="edit"
      gradeHref={`/assignments/${a.id}/results`}
      availableQuestionCount={availableQuestionCount}
      missingQuestionCount={missingQuestionCount}
      duplicateQuestionCount={duplicateQuestionCount}
      isPending={isPending}
      onPublish={publish}
      onCloseExam={close}
      onDelete={handleDelete}
      onClose={onNavigate}
    />
  ), [a, availableQuestionCount, close, duplicateQuestionCount, handleDelete, isPending, missingQuestionCount, publish])

  useContextualSidebar(`/assignments/${a.id}/edit`, renderContextualSidebar)

  return confirmDialog
}

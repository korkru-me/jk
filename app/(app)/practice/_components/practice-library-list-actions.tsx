'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, BarChart3, Copy, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  closePracticeLibrary,
  deletePracticeLibrary,
  duplicatePracticeLibrary,
  publishPracticeLibrary,
} from '../_actions'
import type { PracticeLibraryStatus } from '../_lib/teacher-contract'

interface PracticeLibraryListActionsProps {
  id: string
  title: string
  status: PracticeLibraryStatus
  canManage: boolean
}

export function PracticeLibraryListActions({
  id,
  title,
  status,
  canManage,
}: PracticeLibraryListActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  function runLifecycle(action: 'publish' | 'close') {
    startTransition(async () => {
      const result = action === 'publish'
        ? await publishPracticeLibrary({ libraryId: id })
        : await closePracticeLibrary({ libraryId: id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(action === 'publish' ? 'เผยแพร่คลังฝึกแล้ว' : 'ปิดคลังฝึกแล้ว')
      router.refresh()
    })
  }

  function runDuplicate() {
    startTransition(async () => {
      const result = await duplicatePracticeLibrary({ libraryId: id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('สร้างสำเนาเป็นร่างแล้ว')
      router.push(`/practice/${result.id}/edit`)
    })
  }

  async function askDelete() {
    const accepted = await confirm({
      title: `ลบคลังฝึก “${title}”?`,
      description: 'ร่างและรายการโจทย์ในคลังนี้จะถูกลบ แต่โจทย์ต้นฉบับยังอยู่ในคลังโจทย์',
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!accepted) return
    startTransition(async () => {
      const result = await deletePracticeLibrary({ libraryId: id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('ลบคลังฝึกแล้ว โจทย์ต้นฉบับยังอยู่ในคลังโจทย์')
      router.refresh()
    })
  }

  if (!canManage) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-11"
              aria-label={`จัดการคลังฝึก ${title}`}
              disabled={isPending}
            />
          )}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href={`/practice/${id}/edit`} />}>
              <Pencil />
              แก้ไขการตั้งค่า
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/practice/${id}/progress`} />}>
              <BarChart3 />
              ดูความคืบหน้า
            </DropdownMenuItem>
            <DropdownMenuItem onClick={runDuplicate}>
              <Copy />
              ทำสำเนาเป็นร่าง
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {(status === 'draft' || status === 'published') && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            {status === 'draft' && (
              <DropdownMenuItem variant="primary" onClick={() => runLifecycle('publish')}>
                <Send />
                เผยแพร่
              </DropdownMenuItem>
            )}
            {status === 'published' && (
              <DropdownMenuItem onClick={() => runLifecycle('close')}>
                <Archive />
                ปิดคลังฝึก
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {status === 'draft' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={askDelete}>
                  <Trash2 />
                  ลบถาวร
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialog}
    </>
  )
}

'use client'

import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'

interface ClassroomAccessPanelProps {
  classCode: string
  canManage: boolean
  onCover: boolean
  mutedClassName: string
}

export function ClassroomAccessPanel({
  classCode,
  canManage,
  mutedClassName,
}: ClassroomAccessPanelProps) {
  const [codeCopied, setCodeCopied] = useState(false)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [classCodeVisible, setClassCodeVisible] = useState(true)

  function copyCode() {
    navigator.clipboard.writeText(classCode).then(() => {
      setCodeCopied(true)
      toast.success('คัดลอกรหัสแล้ว')
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  function copyInviteLink() {
    const invitePath = `/classrooms?join=${encodeURIComponent(classCode)}`
    navigator.clipboard.writeText(`${window.location.origin}${invitePath}`).then(() => {
      setInviteLinkCopied(true)
      toast.success('คัดลอกลิงก์เชิญแล้ว')
      setTimeout(() => setInviteLinkCopied(false), 2000)
    })
  }

  return (
    <div className="flex w-full max-w-[20rem] shrink-0 flex-col gap-3 text-left">
      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className={cn('text-xs', mutedClassName)}>รหัสห้องเรียน</p>
          {canManage && (
            <Button
              type="button"
              variant="primaryGhost"
              size="xs"
              aria-expanded={classCodeVisible}
              onClick={() => setClassCodeVisible(visible => !visible)}
            >
              {classCodeVisible
                ? <EyeOff data-icon="inline-start" />
                : <Eye data-icon="inline-start" />}
              {classCodeVisible ? 'ซ่อนรหัส' : 'แสดงรหัส'}
            </Button>
          )}
        </div>
        <div className="flex min-h-8 items-center gap-2" aria-live="polite">
          <p
            className="font-mono text-2xl font-black tracking-[0.3em]"
            aria-label={classCodeVisible ? `รหัสห้องเรียน ${classCode}` : 'รหัสห้องเรียนถูกซ่อน'}
          >
            {classCodeVisible ? classCode : '••••••'}
          </p>
          {classCodeVisible && (
            <IconButton onClick={copyCode} label="คัดลอกรหัสห้องเรียน" className="bg-card/10 hover:bg-card/20">
              {codeCopied ? <Check className="text-success" /> : <Copy />}
            </IconButton>
          )}
        </div>
      </div>

      {canManage && (
        <div className={cn(
          'flex items-center justify-between gap-3 border-t pt-3',
          'border-current/15',
        )}>
          <div className="min-w-0">
            <p className="text-sm font-semibold">ลิงก์เชิญนักเรียน</p>
            <p className={cn('truncate text-xs', mutedClassName)}>เปิดลิงก์แล้วมีรหัสพร้อมเข้าร่วม</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={copyInviteLink}>
            {inviteLinkCopied
              ? <Check data-icon="inline-start" className="text-success" />
              : <Link2 data-icon="inline-start" />}
            {inviteLinkCopied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
          </Button>
        </div>
      )}
    </div>
  )
}

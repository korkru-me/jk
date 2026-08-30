'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AndroidExamGate } from '@/components/exam/android-exam-gate'
import { SebLaunchGate } from '@/components/exam/seb-launch-gate'

interface Props {
  assignmentId: string
  challenge: string
  configUrl: string | null
  configured: boolean
  androidMonitoredAllowed: boolean
}

export function SecureExamLaunchGate(props: Props) {
  const [isAndroid, setIsAndroid] = useState<boolean | null>(null)

  useEffect(() => {
    // This chooses the explanation shown to the student only. The server does
    // not trust it as device proof and still requires an exact teacher approval.
    setIsAndroid(/\bAndroid\b/i.test(window.navigator.userAgent))
  }, [])

  if (isAndroid === null) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" aria-hidden="true" /> ตรวจวิธีเข้าสอบ…
      </div>
    )
  }

  if (isAndroid && props.androidMonitoredAllowed) {
    return <AndroidExamGate assignmentId={props.assignmentId} />
  }

  return <SebLaunchGate {...props} />
}

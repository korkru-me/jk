'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recoveryFailureFromCode, recoveryFeedback, type RecoveryFailure } from '@/lib/auth/recovery-feedback'

/** Rendered only when the server has denied the recovery form. URL hints
 * choose explanatory copy, never a session or recovery grant. */
export function RecoveryLinkNotice({ reason }: { reason?: RecoveryFailure }) {
  const [fragmentReason, setFragmentReason] = useState<RecoveryFailure>()

  useEffect(() => {
    function readFailure() {
      // Supabase can return errors in a fragment, which the server cannot read.
      // Do not render provider descriptions or read credential values.
      const code = new URLSearchParams(window.location.hash.slice(1)).get('error_code')
      setFragmentReason(code ? recoveryFailureFromCode(code) : undefined)
    }
    readFailure()
    window.addEventListener('hashchange', readFailure)
    return () => window.removeEventListener('hashchange', readFailure)
  }, [])

  const failure = reason === 'browser_required' || reason === 'link_expired'
    ? reason
    : fragmentReason ?? reason ?? 'browser_required'
  const feedback = recoveryFeedback[failure]

  return (
    <div className="flex flex-col gap-3 text-center" role="status" aria-live="polite">
      <div className="flex justify-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-warning/10">
          <AlertCircle className="size-6 text-warning" aria-hidden />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-foreground">{feedback.title}</p>
        <p className="text-sm text-muted-foreground">{feedback.description}</p>
        {feedback.help && <p className="text-sm text-muted-foreground">{feedback.help}</p>}
      </div>
      <Button className="min-h-[44px] w-full" render={<Link href="/forgot-password" />}>
        ขอลิงก์ตั้งรหัสผ่านใหม่
      </Button>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleIdentityApi {
  initialize(config: {
    client_id: string
    nonce: string
    auto_select: false
    button_auto_select: false
    use_fedcm_for_button: true
    ux_mode: 'popup'
    callback: (response: GoogleCredentialResponse) => void
  }): void
  renderButton(container: HTMLElement, options: {
    type: 'standard'
    theme: 'outline'
    size: 'large'
    text: 'continue_with'
    locale: 'th'
    width: string
  }): void
}

interface GoogleIdentityButtonProps {
  clientId: string
  nonceHash: string
  expiresAt: number
  busy: boolean
  onCredential: (credential: string) => Promise<void>
  onError: (message: string) => void
}

/** Mount only after the server has verified the current password. Never prompt
 * One Tap, select a Google account automatically, or retain an ID token. */
export function GoogleIdentityButton({ clientId, nonceHash, expiresAt, busy, onCredential, onError }: GoogleIdentityButtonProps) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const reportError = useRef(onError)
  const blocked = useRef(busy)
  const [ready, setReady] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)

  useEffect(() => { callback.current = onCredential; reportError.current = onError; blocked.current = busy }, [onCredential, onError, busy])

  useEffect(() => {
    if (!ready || !container.current) return
    const target = container.current
    setRendered(false)
    const identity = (window as Window & { google?: { accounts?: { id?: GoogleIdentityApi } } }).google?.accounts?.id
    if (!identity) {
      setSdkError('โหลด Google ไม่สำเร็จ กรุณายกเลิกและโหลดหน้านี้ใหม่ก่อนลองอีกครั้ง')
      return
    }

    let active = true
    try {
      identity.initialize({
        client_id: clientId,
        nonce: nonceHash,
        auto_select: false,
        button_auto_select: false,
        use_fedcm_for_button: true,
        ux_mode: 'popup',
        callback(response) {
          if (!active || blocked.current) return
          if (Date.now() >= expiresAt) {
            reportError.current('การยืนยันตัวตนหมดอายุ กรุณายืนยันรหัสผ่านอีกครั้ง')
            return
          }
          if (!response.credential) {
            reportError.current('ยังไม่ได้รับการยืนยันจาก Google กรุณาลองเลือกบัญชีอีกครั้ง')
            return
          }
          // The credential goes directly to the server action; no component
          // state, URL, browser storage or logging receives the token.
          void callback.current(response.credential)
        },
      })
      identity.renderButton(target, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'th',
        width: String(Math.max(200, Math.min(400, Math.floor(target.getBoundingClientRect().width)))),
      })
      setSdkError(null)
      setRendered(true)
    } catch {
      active = false
      setSdkError('แสดงปุ่ม Google ไม่สำเร็จ กรุณายกเลิกและลองใหม่')
    }
    return () => {
      active = false
      target.replaceChildren()
    }
  }, [ready, clientId, nonceHash, expiresAt])

  useEffect(() => {
    if (ready || sdkError) return
    const timer = window.setTimeout(() => {
      setSdkError('โหลด Google นานเกินไป กรุณายกเลิกและโหลดหน้านี้ใหม่ก่อนลองอีกครั้ง')
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [ready, sdkError])

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Script
        id="korkru-account-link-google"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => { setSdkError(null); setReady(true) }}
        onError={() => {
          setSdkError('โหลด Google ไม่สำเร็จ กรุณายกเลิกและโหลดหน้านี้ใหม่ก่อนลองอีกครั้ง')
        }}
      />
      {!rendered && !sdkError && <p role="status" className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />กำลังโหลดปุ่ม Google…</p>}
      {sdkError && <Alert variant="destructive"><AlertDescription>{sdkError}</AlertDescription></Alert>}
      {/* Google controls its official button's size; do not stretch the iframe. */}
      <div ref={container} inert={busy} aria-disabled={busy || undefined} className={cn('flex min-h-[44px] w-full min-w-0 items-center', busy && 'pointer-events-none opacity-50')} />
    </div>
  )
}

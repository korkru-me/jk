import type { Metadata } from 'next'
import { Card } from '@/components/ui/card'
import { loadIocReviewByToken, recordIocExpertOpen } from '@/lib/ioc-review-server'
import { IocReviewClient } from './_components/ioc-review-client'

export const dynamic = 'force-dynamic'

// A link carries a whole exam. It must never end up in a search index, and it
// must not be cached anywhere between the server and the expert's browser.
export const metadata: Metadata = {
  title: 'ประเมินความสอดคล้อง (IOC)',
  robots: { index: false, follow: false, nocache: true },
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function IocReviewPage({ params }: Props) {
  const { token } = await params
  const lookup = await loadIocReviewByToken(token)

  if (!lookup.ok) return <LinkUnusable />

  const { context } = lookup
  await recordIocExpertOpen(context.expert)

  return <IocReviewClient token={token} context={context} />
}

/**
 * One page for every reason: wrong token, expired, revoked, closed form. A
 * visitor who is told which one is being told how to try again.
 */
function LinkUnusable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <Card padding="2xl" className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-2xl" aria-hidden="true">
          🔗
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">ลิงก์นี้ใช้ไม่ได้แล้ว</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          ลิงก์ประเมินความสอดคล้องอาจหมดอายุ ถูกยกเลิก หรือถูกออกใหม่ไปแล้ว
          กรุณาขอลิงก์ล่าสุดจากครูผู้ออกข้อสอบที่ส่งลิงก์นี้ให้ท่าน
        </p>
      </Card>
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, FileText, Loader2, PackageOpen } from 'lucide-react'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import { withBackHref } from '@/lib/back-link'

/**
 * The two ways โจทย์ get into the คลัง without being typed.
 *
 * Both also sit as buttons on the คลังโจทย์ page, where a teacher who already
 * knows the feature will look for them. This page is the entrance for one who
 * does not: it is what the sidebar's "นำเข้าโจทย์" points at, and it says what
 * each file is before asking anyone to pick one.
 */
const CARD =
  'flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md'

export function ImportChoice() {
  const router = useRouter()

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Link
        href={withBackHref('/questions/import/word', '/questions/import')}
        className={`${CARD} border-tint-1/20 bg-tint-1/10 text-tint-1`}
      >
        <FileText className="mt-0.5 size-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">จากไฟล์ Word (.docx)</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-75">
            แบบฝึกหัดหรือข้อสอบที่พิมพ์ไว้แล้ว ระบบอ่านโจทย์ ตัวเลือก รูป และเฉลยที่ทำเครื่องหมายสีไว้ให้
          </p>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-40" aria-hidden />
      </Link>

      <ImportQuestionsButton onImported={() => router.refresh()}>
        {({ open, isPending }) => (
          <button
            type="button"
            onClick={open}
            disabled={isPending}
            className={`${CARD} border-success/20 bg-success/10 text-success disabled:opacity-60`}
          >
            {isPending
              ? <Loader2 className="mt-0.5 size-6 shrink-0 animate-spin" aria-hidden />
              : <PackageOpen className="mt-0.5 size-6 shrink-0" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">จากไฟล์ KorKru (.korkru.json)</p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-75">
                ไฟล์ที่ส่งออกจากคลังโจทย์ของ KorKru — ใช้ย้ายโจทย์ข้ามบัญชี หรือรับไฟล์ที่ครูคนอื่นส่งมา
              </p>
            </div>
            <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-40" aria-hidden />
          </button>
        )}
      </ImportQuestionsButton>
    </div>
  )
}

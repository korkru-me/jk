import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { backHrefFromSearchParams, withBackHref } from '@/lib/back-link'
import { WordTypeChoice } from './_components/word-type-choice'

/**
 * Which kind of โจทย์ is in the file, asked before the file.
 *
 * This route used to be the uploader itself. It is the chooser now because one
 * page of formatting advice cannot serve every question type: what a ปรนัย
 * worksheet must look like and what a ตารางจำแนก worksheet must look like have
 * almost nothing in common, and advice that covers both is advice a teacher
 * cannot act on. The uploader lives one level down, per type, with the rules
 * and the example for that type beside it.
 */
export default async function ImportFromWordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  // Reached from the import chooser and from a button on the คลัง, so the arrow
  // follows whoever linked here — and each type card carries that memory one
  // step further, so a teacher three screens in still returns where they began.
  const backHref = backHrefFromSearchParams(sp, '/questions/import')
  const selfHref = withBackHref('/questions/import/word', backHref)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">นำเข้าโจทย์จากไฟล์ Word</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกก่อนว่าโจทย์ในไฟล์เป็นประเภทไหน — แต่ละประเภทจัดไฟล์ไม่เหมือนกัน
          </p>
        </div>
      </div>

      <WordTypeChoice selfHref={selfHref} />
    </div>
  )
}

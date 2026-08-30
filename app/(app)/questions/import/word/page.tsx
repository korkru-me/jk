import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags, getFormulaPresets } from '@/lib/actions/questions'
import { backHrefFromSearchParams } from '@/lib/back-link'
import { WordImportClient } from './_components/word-import-client'

export default async function ImportFromWordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The same two lookups every authoring route makes — the โจทย์ on this page
  // are edited with those very forms.
  const [allTags, presets, sp] = await Promise.all([getAllTags(), getFormulaPresets(), searchParams])

  // This page is reached from the import chooser and from a button on the
  // คลัง, so the arrow follows whoever linked here rather than a fixed parent.
  const backHref = backHrefFromSearchParams(sp, '/questions/import')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">นำเข้าโจทย์จากไฟล์ Word</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ก่อคลังโจทย์โดยครู — เอาแบบฝึกหัดหรือข้อสอบที่มีอยู่แล้วเข้าคลัง โดยไม่ต้องพิมพ์ใหม่
          </p>
        </div>
      </div>

      <WordImportClient allTags={allTags} presets={presets} />
    </div>
  )
}

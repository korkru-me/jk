import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAllTags, getFormulaPresets } from '@/lib/actions/questions'
import { backHrefFromSearchParams, withBackHref } from '@/lib/back-link'
import { findProfile } from '@/lib/docx-import/profiles'
import { ImportFormatGuide } from '../_components/import-format-guide'
import { PlannedTypeNotice } from '../_components/planned-type-notice'
import { WordImportClient } from '../_components/word-import-client'

/**
 * Reading a Word file, for one kind of โจทย์.
 *
 * The chooser one level up decided what the file holds; this page says what
 * that kind of file has to look like and takes it. A type the parser cannot
 * read yet still has a page — it shows the format and refuses the upload,
 * which is worth more to a teacher than a card that silently does nothing.
 */
export default async function ImportFromWordTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ type }, sp] = await Promise.all([params, searchParams])

  const profile = findProfile(type)
  if (!profile) notFound()

  const backHref = backHrefFromSearchParams(sp, '/questions/import/word')
  // Whoever linked here usually *is* the chooser; only a link from elsewhere
  // needs the memory carried forward so the way back still works from there.
  const cameFromChooser = backHref === '/questions/import/word' || backHref.startsWith('/questions/import/word?')
  const chooserHref = cameFromChooser ? backHref : withBackHref('/questions/import/word', backHref)

  const guide = <ImportFormatGuide profile={profile} />

  if (profile.status === 'planned') {
    return (
      <Layout profile={profile} backHref={backHref}>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <PlannedTypeNotice profile={profile} chooserHref={chooserHref} />
          {guide}
        </div>
      </Layout>
    )
  }

  // The same two lookups every authoring route makes — the โจทย์ on this page
  // are edited with those very forms. Only fetched for a type that can
  // actually reach them.
  const [allTags, presets] = await Promise.all([getAllTags(), getFormulaPresets()])

  return (
    <Layout profile={profile} backHref={backHref}>
      <WordImportClient allTags={allTags} presets={presets} profile={profile} guide={guide} />
    </Layout>
  )
}

function Layout({
  profile,
  backHref,
  children,
}: {
  profile: NonNullable<ReturnType<typeof findProfile>>
  backHref: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">นำเข้าโจทย์{profile.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ก่อคลังโจทย์โดยครู — เอาแบบฝึกหัดหรือข้อสอบที่มีอยู่แล้วเข้าคลัง โดยไม่ต้องพิมพ์ใหม่
          </p>
        </div>
      </div>

      {children}
    </div>
  )
}

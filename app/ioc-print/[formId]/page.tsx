import { Sarabun } from 'next/font/google'
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadIocDocument } from '@/lib/ioc-document-server'
import { parseIocPrintOptions } from '@/lib/ioc-print'
import { IocPrintDocument } from './_components/ioc-print-document'

// The document font. Loaded on this route only: every other page of the app
// reads better in IBM Plex Sans Thai, and Sarabun is what Thai official
// paperwork is set in.
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const dynamic = 'force-dynamic'
export const metadata = { title: 'เอกสาร IOC — KorKru' }

interface Props {
  params: Promise<{ formId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Long enough to render and print, short enough not to become a shareable link. */
const SIGNATURE_URL_TTL_SECONDS = 900

export default async function IocPrintPage({ params, searchParams }: Props) {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const { formId } = await params
  const options = parseIocPrintOptions(await searchParams)
  const supabase = await createClient()

  const document = await loadIocDocument(supabase, formId, options)
  if (!document) notFound()

  // Signed URLs are minted only for the signatures this document will show, so
  // a printout with signatures turned off never reaches for the files at all.
  if (document.signaturePaths.length > 0) {
    const admin = createAdminClient()
    const urls = new Map<string, string>()
    for (const path of document.signaturePaths) {
      const { data } = await admin.storage
        .from('ioc-signatures')
        .createSignedUrl(path, SIGNATURE_URL_TTL_SECONDS)
      if (data?.signedUrl) urls.set(path, data.signedUrl)
    }
    for (const section of document.sections) {
      for (const block of section.signatures) {
        if (block.signaturePath) block.imageUrl = urls.get(block.signaturePath) ?? null
      }
    }
  }

  // Deliberately outside the app shell: the shell clamps its height and hides
  // overflow so the app can scroll its own pane, and printing inside it would
  // clip the document to one screen and carry the sidebar onto the paper.
  return (
    <main className={sarabun.variable}>
      <IocPrintDocument
        sections={document.sections}
        criteriaNote={document.criteriaNote}
        watermarkText={document.watermarkText}
        backHref={`/research/ioc/${formId}`}
      />
    </main>
  )
}

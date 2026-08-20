import { notFound } from 'next/navigation'
import { StylePreview } from './_components/style-preview'

export const metadata = { title: 'ลองสไตล์ — KorKru' }

/**
 * Development-only workbench for the data-style presets in app/globals.css.
 *
 * Not reachable in production: presets are a design tool, not a feature, and
 * this page would otherwise be a public route showing internal UI.
 */
export default function StylePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <StylePreview />
}

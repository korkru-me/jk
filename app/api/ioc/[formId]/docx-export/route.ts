import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encodeRfc5987Filename } from '@/lib/exam-proctor-report'
import { loadIocDocument } from '@/lib/ioc-document-server'
import { parseIocPrintOptions } from '@/lib/ioc-print'
import { buildIocDocxDocument, iocDocxFileName, packIocDocx } from '@/lib/ioc-docx'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * The same document the print page draws, handed over as a .docx.
 *
 * It takes the print page's own query string, so whatever the teacher set on
 * the export panel — which copy, whose signature, comments on or off — comes
 * across unchanged and the two formats cannot disagree about what was asked
 * for.
 */
export async function GET(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params
  if (!UUID.test(formId)) return jsonError('ฟอร์มไม่ถูกต้อง', 400)

  const user = await getAuthUser()
  if (!user) return jsonError('กรุณาเข้าสู่ระบบก่อนดาวน์โหลด', 401)

  const url = new URL(request.url)
  const options = parseIocPrintOptions(Object.fromEntries(url.searchParams.entries()))

  // RLS decides: a form this teacher may not manage simply does not come back.
  const supabase = await createClient()
  const document = await loadIocDocument(supabase, formId, options)
  if (!document) return jsonError('ไม่พบฟอร์มนี้ หรือยังไม่มีเนื้อหาให้ส่งออก', 404)

  // A Word file carries its own images, so these are bytes rather than links —
  // and only for the signatures this document was asked to show.
  const signatureImages = new Map<string, Uint8Array>()
  if (document.signaturePaths.length > 0) {
    const admin = createAdminClient()
    for (const path of document.signaturePaths) {
      const { data, error } = await admin.storage.from('ioc-signatures').download(path)
      if (error || !data) {
        // A missing file leaves a dotted line rather than failing the download:
        // the rest of the document is still the document.
        console.error('[ioc] signature missing for docx', path, error)
        continue
      }
      signatureImages.set(path, new Uint8Array(await data.arrayBuffer()))
    }
  }

  let file: Buffer
  try {
    file = await packIocDocx(buildIocDocxDocument({
      sections: document.sections,
      criteriaNote: document.criteriaNote,
      watermarkText: document.watermarkText,
      signatureImages,
      title: document.form.exam_title || 'แบบประเมินความสอดคล้อง (IOC)',
      author: document.form.author_name,
    }))
  } catch (error) {
    console.error('[ioc] docx build failed', error)
    return jsonError('สร้างไฟล์ Word ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 500)
  }

  // The same append-only trail the printed documents and the workbook write.
  try {
    const admin = createAdminClient()
    await admin.rpc('record_ioc_form_event', {
      p_form_id: formId,
      p_event_type: 'document_exported',
      p_actor_id: user.id,
      p_expert_id: options.doc === 'expert' ? options.expertId : null,
      p_detail: { format: 'docx', doc: options.doc, section_count: document.sections.length },
    })
  } catch (error) {
    console.error('[ioc] could not record export event', error)
  }

  const fileName = iocDocxFileName({
    doc: options.doc,
    examTitle: document.form.exam_title,
    expertName: document.expertName,
    generatedAt: new Date(),
  })

  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Disposition': `attachment; filename="KorKru-ioc-${options.doc}.docx"; filename*=UTF-8''${encodeRfc5987Filename(fileName)}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

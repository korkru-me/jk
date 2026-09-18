import { getAuthUser } from '@/lib/auth/server'
import { encodeRfc5987Filename } from '@/lib/exam-proctor-report'
import { findProfile } from '@/lib/docx-import/profiles'
import { packSampleDocx, sampleFileName } from '@/lib/docx-import/sample-docx'

export const dynamic = 'force-dynamic'

/**
 * The example worksheet for one kind of โจทย์, as a file to open in Word.
 *
 * Generated per request from the same lines the import screen draws, rather
 * than served from `public/`: a checked-in file would keep its old shape after
 * a change to the parser and quietly become an example the app cannot read.
 * `lib/docx-import/sample-docx.test.ts` reads each one back to prove it can.
 *
 * It holds no one's data — it is the same file for every teacher — but it
 * stays behind the login because the whole /questions area is, and an open
 * endpoint would be a way to make the server build documents for free.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const profile = findProfile(slug)
  // A type whose format is still a proposal has no example to hand out: a file
  // written to a convention that may change is worse than none.
  if (!profile || profile.status !== 'ready') {
    return Response.json({ error: 'ยังไม่มีไฟล์ตัวอย่างของประเภทนี้' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: 'กรุณาเข้าสู่ระบบก่อนดาวน์โหลด' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  let file: Buffer
  try {
    file = await packSampleDocx(profile)
  } catch (error) {
    console.error('[import-sample] could not build the sample docx', slug, error)
    return Response.json({ error: 'สร้างไฟล์ตัวอย่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  return new Response(new Uint8Array(file), {
    headers: {
      // The ASCII name is the fallback for clients that cannot read the
      // encoded one; the Thai name is what a teacher will look for later.
      'Content-Disposition':
        `attachment; filename="KorKru-word-import-${profile.slug}.docx"; `
        + `filename*=UTF-8''${encodeRfc5987Filename(sampleFileName(profile))}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'

/** Synthetic answers; only the announcement PDF is also available on isolated Staging. */
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  if (!isExamScreenLabEnabled(process.env)) return new Response(null, { status: 404 })
  const { filename } = await params
  if (process.env.NODE_ENV === 'production' && filename !== 'file-0.pdf') return new Response(null, { status: 404 })
  const match = /^(work|file)-(\d+)\.(svg|pdf)$/.exec(filename)
  if (!match || Number(match[2]) > 31 || (match[1] === 'work' ? match[3] !== 'svg' : match[3] !== 'pdf')) return new Response(null, { status: 404 })
  const student = Number(match[2]) + 1
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
  if (match[1] === 'work') {
    const answer = (student - 1) % 5 === 1 ? '4' : '5'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="350" viewBox="0 0 720 350"><rect width="720" height="350" fill="#fffef9"/><g stroke="#e2e9ef">${[96,154,212,270,328].map(y => `<path d="M26 ${y}H694"/>`).join('')}</g><g fill="#2e4158" font-family="sans-serif" font-size="28"><text x="38" y="66">วิธีทำ · นักเรียนจำลอง ${student}</text><text x="38" y="126">กำหนด s = 20 m, t = 4 s</text><text x="38" y="186">v = s / t = 20 / 4</text><text x="38" y="246">ตอบ ${answer} m/s</text></g></svg>`
    return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } })
  }
  const stream = `BT /F1 18 Tf 50 750 Td (Motion worksheet - local sample ${student}) Tj 0 -40 Td /F1 13 Tf (1. Average speed = distance / time) Tj 0 -25 Td (2. Velocity includes direction.) Tj 0 -25 Td (Example: walking east for 20 meters in 4 seconds.) Tj 0 -40 Td (Answer: v = 20 / 4 = 5 m/s) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Response(pdf, { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length) } })
}

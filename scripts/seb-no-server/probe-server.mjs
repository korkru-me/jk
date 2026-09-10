/** Loopback diagnostic, NOT a student/teacher service and never an admission issuer. */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { matchesConfigProof } from '../seb-phase1/config.mjs'
import { parseProbeOrigin } from './kit.mjs'

export function checkProof({ url, configKey, browserKeys, proof }) {
  const shapeOK = proof !== null && typeof proof === 'object' && !Array.isArray(proof)
    && Object.keys(proof).length === 2 && ['configKeyHash', 'browserExamKeyHash'].every(key =>
      typeof proof[key] === 'string' && /^[a-f0-9]{64}$/i.test(proof[key]))
  if (!shapeOK) return { configMatches: false, browserMatches: false, result: 'INVALID_PROOF' }
  const configMatches = matchesConfigProof(url, configKey, proof.configKeyHash)
  const browserMatches = browserKeys.some(key => matchesConfigProof(url, key, proof.browserExamKeyHash))
  return { configMatches, browserMatches,
    result: !configMatches ? 'KEY_MISMATCH' : browserKeys.length === 0 ? 'BEK_PENDING'
      : browserMatches ? 'MATCHED_BOTH' : 'KEY_MISMATCH' }
}

// Native Apple updateKeys resolves callback.name globally. Keep this named global.
export const CLIENT_SCRIPT = `
let sending = false;
let apiTimer;
async function n2KeysReady() {
  if (sending) return;
  const security = window.SafeExamBrowser && window.SafeExamBrowser.security;
  if (!security || !/^[a-f0-9]{64}$/i.test(security.configKey || '') || !/^[a-f0-9]{64}$/i.test(security.browserExamKey || '')) return;
  sending = true;
  clearTimeout(apiTimer);
  try {
    const response = await fetch(location.pathname + '/check' + location.search, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({configKeyHash: security.configKey, browserExamKeyHash: security.browserExamKey})
    });
    const result = await response.json();
    document.getElementById('result').textContent = !response.ok ? 'ตรวจไม่สำเร็จ กดโหลดหน้าใหม่แล้วลองอีกครั้ง'
      : result.result === 'MATCHED_BOTH' ? 'CK และ BEK ตรงกับชุดทดลองที่เลือก — ไม่ใช่สิทธิ์เข้าสอบจริง'
      : result.result === 'BEK_PENDING' ? 'CK ตรงแล้ว แต่ยังไม่มี BEK จากผู้ทดสอบที่ลงทะเบียนไว้ จึงยังไม่ผ่านครบ'
      : 'Key ไม่ตรงหรือไม่ครบ — อย่าเปลี่ยน Key ของเว็บจริงเพื่อให้ชุดทดลองผ่าน';
    if (response.ok && result.result === 'MATCHED_BOTH' && result.quitUrl) {
      const link = document.createElement('a');
      link.textContent = 'ทดลองลิงก์ออกจาก SEB (ไม่มีการส่งข้อสอบจริง)';
      link.href = result.quitUrl;
      document.getElementById('exit').replaceChildren(link);
    }
  } catch (_) { document.getElementById('result').textContent = 'ติดต่อเครื่องมือตรวจไม่ได้ ยังไม่ถือว่าตรวจผ่าน'; }
}
window.n2KeysReady = n2KeysReady;
document.getElementById('check').addEventListener('click', function () {
  if (sending) { location.assign(location.pathname); return; }
  document.getElementById('result').textContent = 'กำลังรอสัญญาณจาก SEB…';
  clearTimeout(apiTimer);
  apiTimer = setTimeout(function () {
    document.getElementById('result').textContent = 'ยังอ่าน Key จาก SEB ไม่ได้ ไม่ใช่ผลผ่าน — แจ้งรุ่น SEB และข้อความนี้ให้ผู้ช่วยตรวจ';
  }, 5000);
  try {
    const security = window.SafeExamBrowser && window.SafeExamBrowser.security;
    if (security && typeof security.updateKeys === 'function') security.updateKeys(window.n2KeysReady);
    else n2KeysReady();
  } catch (_) { /* Keep timeout result, never treat presence of API as a pass. */ }
});
`

function page(nonce, caseId) {
  // Deliberately plain diagnostic HTML, outside the product UI/navigation.
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KorKru N2.1 — ห้องทดลองเท่านั้น</title><main>
<h1>ทดลองไฟล์ SEB — ชุดที่คาดหวัง: ${caseId}</h1>
<p>นี่ไม่ใช่เว็บสอบจริง ไม่อ่านบัญชี คำตอบ หรือข้อมูลนักเรียน และไม่เริ่มเวลาสอบ</p>
<p>ไฟล์นี้ไม่เข้ารหัสและผ่อนคลายข้อจำกัดเพื่อกู้คืนง่าย ไม่ใช้รับรองการล็อกเครื่อง</p>
<p>หากเปิดหน้านี้ใน Safari/Chrome จะไม่ผ่านการตรวจ SEB เป็นพฤติกรรมที่คาดไว้</p>
<button type="button" id="check">ตรวจ Key ของชุดทดลอง</button>
<p id="result" role="status">ยังไม่ได้ตรวจ</p><p id="exit"></p>
<p>ก่อนทดลองออก ต้องจดรหัสออกไว้นอกเครื่องแล้ว ลิงก์ออกเป็นเพียงการทดลอง native ไม่ได้พิสูจน์ว่าครูอนุญาตหรือส่งข้อสอบสำเร็จ</p>
<p>ถ้าหน้าเปิดไม่ได้ ใช้ปุ่มออกของ SEB และ quitPassword ของไฟล์นั้น ไม่ใช้รหัสเว็บจริง</p>
</main><script nonce="${nonce}">${CLIENT_SCRIPT}</script></html>`
}

async function bodyJson(req) {
  if (req.headers['content-type'] !== 'application/json') throw new Error('Invalid content type')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024) throw new Error('Request too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createProbeServer({ manifest, caseId, browserKeys = [], origin = manifest.origin, now = Date.now,
  testOnlyAllowEphemeralLoopback = false }) {
  // Native CLI uses exact loopback/private-Wi-Fi port 4175. Tests may allocate an ephemeral loopback port.
  const parsed = parseProbeOrigin(origin, { allowEphemeralLoopback: testOnlyAllowEphemeralLoopback })
  const fixture = manifest.cases.find(item => item.id === caseId)
  if (!fixture || !/^(a|b|a-modified)$/.test(caseId)) throw new Error('Invalid fixture')
  const pathname = new URL(manifest.startUrl).pathname
  const quitPath = new URL(manifest.quitUrl).pathname
  const tickets = new Map()
  return createServer(async (req, res) => {
    const respond = (status, value, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY', ...res.getHeaders() })
      res.end(type === 'application/json' ? JSON.stringify(value) : value)
    }
    try {
      if (req.headers.host !== parsed.host) return respond(403, { error: 'HOST_REJECTED' })
      const url = new URL(req.url, origin)
      if (url.origin !== origin) return respond(403, { error: 'ORIGIN_REJECTED' })
      for (const [id, ticket] of tickets) if (ticket.expires <= now()) tickets.delete(id)
      if (req.method === 'GET' && url.pathname === pathname && !url.search) {
        if (tickets.size >= 64) return respond(429, { error: 'TOO_MANY_PROBES' })
        const token = randomBytes(24).toString('hex')
        const pageUrl = `${origin}${pathname}?ticket=${token}`
        tickets.set(token, { url: pageUrl, expires: now() + 300000 })
        res.setHeader('Location', pageUrl)
        return respond(303, { message: 'NEW_DIAGNOSTIC' })
      }
      const token = url.searchParams.get('ticket')
      const ticket = tickets.get(token)
      if (req.method === 'GET' && url.pathname === pathname && ticket && url.href === ticket.url) {
        const nonce = randomBytes(16).toString('base64')
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`)
        return respond(200, page(nonce, caseId), 'text/html')
      }
      if (req.method === 'POST' && url.pathname === `${pathname}/check`) {
        if (req.headers.origin !== origin || !ticket || url.href !== ticket.url.replace(`${pathname}?`, `${pathname}/check?`)) {
          return respond(403, { error: 'DIAGNOSTIC_EXPIRED_OR_WRONG_ORIGIN' })
        }
        tickets.delete(token) // one-use including malformed/failed proof, never auto-enroll
        const proof = await bodyJson(req)
        const result = checkProof({ url: ticket.url, configKey: fixture.expectedConfigKey, browserKeys, proof })
        return respond(200, { ...result, admissionGranted: false,
          ...(result.result === 'MATCHED_BOTH' ? { quitUrl: `${origin}${quitPath}` } : {}) })
      }
      if (req.method === 'GET' && url.pathname === quitPath) {
        // A real native Quit URL may never reach HTTP. This response is NOT a quit acknowledgement.
        return respond(200, { nativeQuitConfirmed: false, message: 'HTTP reached; cannot confirm native quit' })
      }
      return respond(404, { error: 'NOT_FOUND' })
    } catch (_) { return respond(400, { error: 'INVALID_DIAGNOSTIC_REQUEST' }) }
  })
}

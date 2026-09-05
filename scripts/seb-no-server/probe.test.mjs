import { describe, it, expect } from 'vitest'
import { once } from 'node:events'
import { request } from 'node:http'
import { runInNewContext } from 'node:vm'
import { createProbeServer, checkProof, CLIENT_SCRIPT } from './probe-server.mjs'
import { createFixtures, ORIGIN } from './kit.mjs'
import { configKey, requestHash } from '../seb-phase1/config.mjs'
import { verifySebRequestHashes } from '../../lib/seb.ts'

const ck = 'c'.repeat(64), bek = 'b'.repeat(64)
const url = `${ORIGIN}/n2/synthetic?ticket=one`
const proofFor = (page = url, config = ck, browser = bek) => ({
  configKeyHash: requestHash(page, config), browserExamKeyHash: requestHash(page, browser),
})

describe('N2 diagnostic requires separately trusted BEK', () => {
  it('never turns CK-only into a passed full check or production admission', () => {
    expect(checkProof({ url, configKey: ck, browserKeys: [], proof: proofFor() }).result).toBe('BEK_PENDING')
    expect(checkProof({ url, configKey: ck, browserKeys: [bek], proof: proofFor() }).result).toBe('MATCHED_BOTH')
    expect(verifySebRequestHashes({ requestUrl: url, configKey: ck, browserExamKeys: [], ...proofFor() })).toBe(false)
  })
  it.each([null, {}, [], { ...proofFor(), extra: true }, { configKeyHash: ck, browserExamKeyHash: 'not a key' }])('invalid proof %#', proof => {
    expect(checkProof({ url, configKey: ck, browserKeys: [bek], proof }).result).toBe('INVALID_PROOF')
  })
  it('rejects wrong query, CK, BEK, A/B swap and modified config', () => {
    for (const proof of [proofFor(`${url}2`), proofFor(url, 'a'.repeat(64)), proofFor(url, ck, 'd'.repeat(64))]) {
      expect(checkProof({ url, configKey: ck, browserKeys: [bek], proof }).result).toBe('KEY_MISMATCH')
    }
    const { fixtures: [a, b, modified] } = createFixtures()
    for (const fixture of [b, modified]) {
      expect(checkProof({ url, configKey: configKey(a.settings), browserKeys: [bek],
        proof: proofFor(url, configKey(fixture.settings)) }).result).toBe('KEY_MISMATCH')
    }
    expect(checkProof({ url, configKey: ck, browserKeys: [bek], proof: proofFor(`${url}#anchor`) }).result).toBe('MATCHED_BOTH')
  })
})

async function withServer(run, { enrolled = true, clock } = {}) {
  const manifest = { origin: ORIGIN, startUrl: `${ORIGIN}/n2/test`, quitUrl: `${ORIGIN}/quit/test`,
    cases: [{ id: 'a', expectedConfigKey: ck }] }
  // Bind before deriving its exact origin; not a LAN listener.
  const placeholder = createProbeServer({ manifest, caseId: 'a' })
  placeholder.listen(0, '127.0.0.1')
  await once(placeholder, 'listening')
  const port = placeholder.address().port
  // Swap the request handler while retaining the allocated socket.
  const origin = `http://127.0.0.1:${port}`
  const handler = createProbeServer({ manifest, caseId: 'a', browserKeys: enrolled ? [bek] : [], origin, now: clock })
  placeholder.removeAllListeners('request')
  placeholder.on('request', handler.listeners('request')[0])
  try { await run(origin) }
  finally { placeholder.closeAllConnections(); await new Promise(resolve => placeholder.close(resolve)) }
}

async function ticket(origin) {
  const redirect = await fetch(`${origin}/n2/test`, { redirect: 'manual' })
  expect(redirect.status).toBe(303)
  const page = redirect.headers.get('location')
  return { page, check: page.replace('/n2/test?', '/n2/test/check?') }
}
const post = (origin, target, proof) => fetch(target, { method: 'POST', headers: {
  Origin: origin, 'Content-Type': 'application/json',
}, body: JSON.stringify(proof) })

describe('loopback transport boundaries (synthetic, not native)', () => {
  it('serves a no-store probe and consumes exact challenges once without returning secrets', async () => withServer(async origin => {
    const t = await ticket(origin)
    const page = await fetch(t.page)
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    const html = await page.text()
    expect(html).toContain('window.n2KeysReady = n2KeysReady')
    expect(html).not.toContain(ck)
    expect(html).not.toContain(bek)
    const result = await post(origin, t.check, proofFor(t.page))
    expect(await result.json()).toEqual({ result: 'MATCHED_BOTH', configMatches: true,
      browserMatches: true, admissionGranted: false, quitUrl: `${origin}/quit/test` })
    expect((await post(origin, t.check, proofFor(t.page))).status).toBe(403)
    expect((await fetch(t.page)).status).toBe(404)
  }))
  it('does not provide the diagnostic exit link before trusted BEK enrollment', async () => withServer(async origin => {
    const t = await ticket(origin)
    const result = await (await post(origin, t.check, proofFor(t.page))).json()
    expect(result.result).toBe('BEK_PENDING')
    expect(result.admissionGranted).toBe(false)
    expect(result).not.toHaveProperty('quitUrl')
  }, { enrolled: false }))
  it('rejects cross-origin, wrong query, expired, oversized and invalid requests', async () => {
    let time = 0
    await withServer(async origin => {
      const t = await ticket(origin)
      expect((await post('https://foreign.invalid', t.check, proofFor(t.page))).status).toBe(403)
      expect((await post(origin, `${t.check}&extra=1`, proofFor(t.page))).status).toBe(403)
      expect((await post(origin, t.check, 'x'.repeat(1025))).status).toBe(400)
      const expired = await ticket(origin)
      time = 300001
      expect((await post(origin, expired.check, proofFor(expired.page))).status).toBe(403)
      expect((await fetch(`${origin}/private-manifest.json`)).status).toBe(404)
      // fetch may normalize/ignore Host; use the raw HTTP transport for this assertion.
      const status = await new Promise((resolve, reject) => {
        const req = request(`${origin}/n2/test`, { headers: { Host: 'foreign.invalid' } }, res => {
          res.resume(); resolve(res.statusCode)
        })
        req.on('error', reject); req.end()
      })
      expect(status).toBe(403)
    }, { clock: () => time })
  })
  it('caps outstanding tickets and does not treat HTTP quit as native acknowledgement', async () => withServer(async origin => {
    for (let i = 0; i < 64; i++) await ticket(origin)
    expect((await fetch(`${origin}/n2/test`, { redirect: 'manual' })).status).toBe(429)
    expect((await (await fetch(`${origin}/quit/test`)).json()).nativeQuitConfirmed).toBe(false)
  }))
  it('refuses LAN/public origin in this first kit', () => {
    expect(() => createProbeServer({ manifest: { origin: 'https://www.korkru.com' }, caseId: 'a' })).toThrow()
  })
})

describe('native bridge callback compatibility, simulated only', () => {
  it('uses a globally named callback on Apple, with no duplicate sends', async () => {
    const elements = Object.fromEntries(['check', 'result', 'exit'].map(id => [id, { textContent: '', addEventListener(_, fn) { this.click = fn } }]))
    const calls = []
    const context = { document: { getElementById: id => elements[id] },
      location: { pathname: '/n2/test', search: '?ticket=one' },
      setTimeout: () => 1, clearTimeout: () => {},
      fetch: async (_, options) => { calls.push(options); return { ok: true, json: async () => ({ result: 'BEK_PENDING' }) } },
    }
    context.window = context
    context.SafeExamBrowser = { security: { configKey: ck, browserExamKey: bek,
      updateKeys(callback) { context[callback.name](); context[callback.name]() } } }
    runInNewContext(CLIENT_SCRIPT, context)
    elements.check.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(calls).toHaveLength(1)
    expect(elements.result.textContent).toContain('ยังไม่มี BEK')
  })
  it('API absence/timeout never posts a proof or grants exit', () => {
    let expire
    let posted = false
    const elements = Object.fromEntries(['check', 'result'].map(id => [id, { addEventListener(_, fn) { this.click = fn } }]))
    const context = { document: { getElementById: id => elements[id] },
      setTimeout: fn => { expire = fn; return 1 }, clearTimeout: () => {}, fetch: () => { posted = true } }
    context.window = context
    runInNewContext(CLIENT_SCRIPT, context)
    elements.check.click()
    expire()
    expect(posted).toBe(false)
    expect(elements.result.textContent).toContain('ไม่ใช่ผลผ่าน')
  })
})

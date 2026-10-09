#!/usr/bin/env node
/** Portable browser-only W6 exercise. Never accepts a deployed origin, Auth,
 * native keys, private fixtures or a backend bypass. CDP Fetch intercepts the
 * synthetic canonical API before Start; every unrecognized request is blocked.
 * Requires the existing localhost dev server and agent-browser >=0.31.1.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const ORIGIN = 'http://localhost:3011'
const LAB_PATH = '/exam-screen-lab/seb-waiting-client'
const BASE = '/exam/30000000-0000-4000-8000-000000000013/r/1'
const SUBMISSION = '40000000-0000-4000-8000-000000000014'
const WRITTEN = '50000000-0000-4000-8000-000000000015'
const MCQ = '50000000-0000-4000-8000-000000000016'
const FILE = '50000000-0000-4000-8000-000000000017'
const CSRF = 'ui-lab-not-server-authority'
const BACKUP = `korkru_exam_${SUBMISSION}`
const FIXTURE_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, description, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(100)
  }
  throw new Error(`UI_QA_TIMEOUT:${description}`)
}

function cdpClient(url) {
  const socket = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  const listeners = new Set()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(`CDP_${message.error.code}:${message.error.message}`))
      else waiter.resolve(message.result)
    } else for (const listener of listeners) listener(message)
  })
  socket.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('UI_QA_CDP_DISCONNECTED'))
    pending.clear()
  })
  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    }),
    on: listener => listeners.add(listener),
    send: (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    }),
    close: () => socket.close(),
  }
}

export async function runWaitingClientBrowserQa({ discover = false } = {}) {
  const derived = await execute('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'seb-w6-client-qa'])
  const session = derived.stdout.trim()
  assert.match(session, /^seb-w6-client-qa-[a-f0-9]+$/)
  const browser = async args => (await execute('agent-browser', ['--session', session, '--restore', '--headed',
    '--enable', 'react-devtools', '--no-webmcp', ...args],
    { timeout: 35_000, maxBuffer: 2 * 1024 * 1024 })).stdout.trim()
  const observations = [], unexpected = [], requests = [], uploadObjects = new Map()
  const activeExceptions = new Map()
  let cdp, pageSession, saveMode = 'success', submitMode = 'refusal', uploadCount = 0, lostUploadResponse = true
  let interceptionFailure = null, observeClientExceptions = false
  try {
    await browser(['open', 'about:blank'])
    const address = (await browser(['get', 'cdp-url'])).split('\n').find(line => line.startsWith('ws://'))
    assert.match(address, /^ws:\/\/127\.0\.0\.1:[0-9]+\/devtools\/browser\/[a-f0-9-]+$/)
    cdp = cdpClient(address)
    await cdp.ready
    const targets = await cdp.send('Target.getTargets')
    const pages = targets.targetInfos.filter(target => target.type === 'page' && target.url === 'about:blank')
    assert.equal(pages.length, 1, 'owned browser must have exactly one blank page')
    pageSession = (await cdp.send('Target.attachToTarget', { targetId: pages[0].targetId, flatten: true })).sessionId
    const send = (method, params) => cdp.send(method, params, pageSession)
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error('UI_QA_EVALUATION_FAILED')
      return result.result.value
    }
    const fulfill = (id, payload, mime = 'application/json', code = 200) => send('Fetch.fulfillRequest', {
      requestId: id, responseCode: code,
      responseHeaders: [{ name: 'content-type', value: mime }, { name: 'cache-control', value: 'no-store' },
        { name: 'x-content-type-options', value: 'nosniff' }],
      body: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).toString('base64'),
    })
    const block = id => send('Fetch.failRequest', { requestId: id, errorReason: 'BlockedByClient' })
    cdp.on(message => {
      if (message.sessionId !== pageSession) return
      if (message.method === 'Runtime.exceptionRevoked') {
        activeExceptions.delete(message.params.exceptionId); return
      }
      if (message.method === 'Runtime.exceptionThrown') {
        if (observeClientExceptions) activeExceptions.set(message.params.exceptionDetails.exceptionId, true)
        return
      }
      if (message.method !== 'Fetch.requestPaused' || message.sessionId !== pageSession) return
      void (async () => {
        const { requestId, request } = message.params
        const url = new URL(request.url)
        const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]))
        if (url.origin !== ORIGIN || headers['next-action']) {
          unexpected.push({ method: request.method, path: url.origin === ORIGIN ? url.pathname : 'external-origin' })
          await block(requestId); return
        }
        if (request.method === 'POST' && url.pathname === `${BASE}/api` && !url.search) {
          assert.equal(headers['x-korkru-seb-csrf'], CSRF)
          assert.match(headers['content-type'], /^application\/json/)
          const input = JSON.parse(request.postData)
          assert.deepEqual(Object.keys(input).sort(), ['args', 'operation'])
          assert.ok(Array.isArray(input.args))
          requests.push({ operation: input.operation, args: input.args })
          if (input.operation === 'saveAnswer') {
            assert.ok([WRITTEN, FILE, MCQ].includes(input.args[0]))
            await fulfill(requestId, { result: saveMode === 'refusal' ? { error: 'UI QA ปฏิเสธการบันทึกสังเคราะห์' } : { success: true } }); return
          }
          if (input.operation === 'prepareExamAttachmentUpload') {
            const prepared = input.args[0]
            assert.equal(prepared.submissionAnswerId, FILE)
            assert.equal(prepared.kind, 'submission_file')
            assert.equal(prepared.mimeType, 'application/pdf')
            assert.equal(prepared.size, FIXTURE_PDF.length)
            const file = { url: `https://synthetic.invalid/submission-files/${prepared.uploadId}.pdf`, name: prepared.name, type: prepared.mimeType }
            const reused = prepared.retry === true && uploadObjects.has(prepared.uploadId)
            await fulfill(requestId, { result: reused ? { success: true, reused: true, uploadId: prepared.uploadId, file }
              : { success: true, reused: false, uploadId: prepared.uploadId, bucket: 'submission-files',
                path: `synthetic/${prepared.uploadId}.pdf`, token: '', examUploadReceipt: `ui-receipt:${prepared.uploadId}` } }); return
          }
          if (input.operation === 'completeExamAttachmentUpload') {
            const completed = input.args[0]
            assert.ok(uploadObjects.has(completed.uploadId))
            await fulfill(requestId, { result: { success: true, file: { url: `https://synthetic.invalid/submission-files/${completed.uploadId}.pdf`,
              name: completed.name, type: completed.mimeType } } }); return
          }
          if (input.operation === 'submitSubmission') {
            assert.equal(input.args[0], SUBMISSION)
            await fulfill(requestId, { result: submitMode === 'refusal' ? { error: 'UI QA ปฏิเสธการส่งสังเคราะห์' } : { success: true, totalScore: 0 } }); return
          }
          if (input.operation === 'getStudentWorkArtifacts') {
            await fulfill(requestId, { result: { success: true, artifacts: [] } }); return
          }
          unexpected.push({ method: 'POST', path: url.pathname, operation: 'unexpected-operation' })
          await block(requestId); return
        }
        if (request.method === 'POST' && url.pathname === `${BASE}/resource/upload` && !url.search) {
          assert.equal(headers['x-korkru-seb-csrf'], CSRF)
          assert.equal(headers['content-type'], 'application/pdf')
          const receipt = headers['x-korkru-seb-upload-receipt']
          assert.match(receipt, /^ui-receipt:[a-f0-9-]{36}$/)
          uploadObjects.set(receipt.slice('ui-receipt:'.length), true)
          uploadCount += 1
          if (lostUploadResponse) { lostUploadResponse = false; await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); return }
          await fulfill(requestId, { success: true }); return
        }
        if (request.method === 'GET' && url.pathname === `${BASE}/submitted` && !url.search) {
          await fulfill(requestId, '<!doctype html><html lang="th"><meta charset="utf-8"><title>UI QA synthetic receipt</title><body><h1>UI QA · ใบรับจำลอง ไม่ใช่ native exit</h1></body></html>', 'text/html; charset=utf-8'); return
        }
        if (request.method === 'GET' && url.pathname === `${BASE}/resource` && url.searchParams.get('src')?.startsWith('https://synthetic.invalid/')) {
          await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [{ name: 'content-type', value: 'application/pdf' }, { name: 'cache-control', value: 'no-store' }],
            body: FIXTURE_PDF.toString('base64') }); return
        }
        if (request.method === 'GET' && (url.pathname === LAB_PATH || url.pathname.startsWith('/_next/')
          || ['/favicon.ico', '/icon.png', '/apple-icon.png', '/brand/deer-mark.svg'].includes(url.pathname))) {
          await send('Fetch.continueRequest', { requestId }); return
        }
        unexpected.push({ method: request.method, path: url.pathname })
        await block(requestId)
      })().catch(error => {
        interceptionFailure = error
        void block(message.params.requestId).catch(() => {})
      })
    })
    await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    await browser(['open', `${ORIGIN}${LAB_PATH}`])
    await browser(['wait', '--text', 'เริ่มจำลองในเครื่อง'])
    const baselineErrors = JSON.parse(await browser(['errors', '--json']))
    assert.equal(baselineErrors.success, true)
    assert.ok(Array.isArray(baselineErrors.data?.errors))
    const baselineErrorIds = new Set(baselineErrors.data.errors.map(error => JSON.stringify(error)))
    observeClientExceptions = true
    // Reset only this harness's synthetic recovery keys; never inspect or
    // clear cookies, unrelated localStorage, Auth state, or real attempts.
    await evaluate(`localStorage.removeItem(${JSON.stringify(BACKUP)}); sessionStorage.removeItem('korkru:seb-waiting-client-lab:started-at')`)
    assert.equal(await evaluate('document.querySelectorAll("math-field").length'), 0)
    assert.equal(await evaluate(`document.querySelector('[aria-label="คำตอบตัวเลข"]')`), null)
    assert.equal(await evaluate(`document.querySelector('[aria-label^="เวลาที่เหลือ"]')`), null)
    await browser(['find', 'role', 'button', 'click', '--name', 'เริ่มจำลองในเครื่อง'])
    try { await browser(['wait', '[aria-label="คำตอบตัวเลข"]']) }
    catch (error) {
      process.stdout.write(`${JSON.stringify({ unexpected, requests, interceptionFailure: interceptionFailure?.message })}\n`)
      process.stdout.write(`${await browser(['snapshot', '-i'])}\n`)
      process.stdout.write(`${await browser(['errors'])}\n`)
      throw error
    }
    assert.equal(await evaluate('location.pathname'), `${BASE}/take`)
    const startedAt = await evaluate('document.querySelector("[data-seb-client-lab]").dataset.startedAt')
    assert.ok(Number.isFinite(Date.parse(startedAt)))
    const reactTree = await browser(['react', 'tree', '--json'])
    if (discover) {
      process.stdout.write(`${await browser(['snapshot', '-i'])}\n`)
      process.stdout.write(`${reactTree}\n`)
      process.stdout.write(`${JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('[aria-label="คำตอบตัวเลข"], [aria-label^="เวลาที่เหลือ"]')).map(node => ({tag:node.tagName, role:node.getAttribute('role'),label:node.getAttribute('aria-label'),value:node.value,html:node.outerHTML.slice(0,500)}))`))}\n`)
      return { status: 'discovered', startedAt, unexpected }
    }
    assert.match(reactTree, /ExamClient/)
    assert.match(reactTree, /WaitingExamRunner/)
    const backup = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(BACKUP)}) || 'null')`)
    const inputValue = () => evaluate(`document.querySelector('[aria-label="คำตอบตัวเลข"]')?.value`)
    const saves = () => requests.filter(request => request.operation === 'saveAnswer')
    const currentStart = () => evaluate('document.querySelector("[data-seb-client-lab]").dataset.startedAt')
    const timerSeconds = async () => {
      const label = await evaluate(`document.querySelector('[aria-label^="เวลาที่เหลือ"]')?.getAttribute('aria-label')`)
      const match = label?.match(/([0-9]+):([0-9]+)$/)
      assert.ok(match, 'real exam countdown is visible')
      return Number(match[1]) * 60 + Number(match[2])
    }
    const fillNumeric = value => browser(['find', 'role', 'textbox', 'fill', value, '--name', 'คำตอบตัวเลข'])
    observations.push({ case: 'explicit_start_real_exam_client', passed: true, startedAt,
      canonicalPath: `${BASE}/take`, reactComponents: ['WaitingExamRunner', 'ExamClient'] })

    await fillNumeric('4')
    await until(async () => saves().some(request => request.args[0] === WRITTEN
      && request.args[1] === '4') && await backup() === null, 'numeric-autosave')
    observations.push({ case: 'real_numeric_autosave', passed: true, answerId: WRITTEN,
      value: '4', localBackupCleared: true })

    saveMode = 'refusal'
    const savesBeforeRefusal = saves().length
    await fillNumeric('5')
    await until(async () => saves().length === savesBeforeRefusal + 1
      && (await backup())?.entries?.[WRITTEN]?.value === '5', 'received-save-refusal')
    await browser(['wait', '--text', 'รอซิงก์ 1'])
    // A received refusal must not be replayed automatically. This bounded
    // quiet window is a negative assertion, not a generic navigation wait.
    await sleep(1500)
    assert.equal(saves().length, savesBeforeRefusal + 1)
    assert.equal(await inputValue(), '5')
    assert.equal(await evaluate('location.pathname'), `${BASE}/take`)
    observations.push({ case: 'explicit_save_refusal', passed: true, pendingRetained: true,
      automaticReplayCount: 0 })

    saveMode = 'success'
    await browser(['set', 'offline', 'on'])
    await until(() => evaluate('navigator.onLine === false'), 'offline-event')
    const savesBeforeOffline = saves().length
    await fillNumeric('6')
    await until(async () => (await backup())?.entries?.[WRITTEN]?.value === '6', 'offline-backup')
    const secondsBeforeRemount = await timerSeconds()
    await browser(['find', 'role', 'button', 'click', '--name', 'เมานต์หน้าสอบเดิมใหม่'])
    await browser(['wait', '[aria-label="คำตอบตัวเลข"]'])
    await until(async () => await inputValue() === '6', 'offline-remount-restore')
    assert.equal(await currentStart(), startedAt)
    assert.equal(saves().length, savesBeforeOffline)
    const secondsAfterRemount = await timerSeconds()
    assert.ok(secondsAfterRemount <= secondsBeforeRemount, 'remount cannot restart the clock')
    await browser(['set', 'offline', 'off'])
    await until(async () => saves().some(request => request.args[0] === WRITTEN
      && request.args[1] === '6') && await backup() === null, 'reconnect-autosave')
    assert.equal(await currentStart(), startedAt)
    observations.push({ case: 'offline_queue_remount_reconnect', passed: true, sameStartedAt: true,
      restoredValue: '6', requestsWhileOffline: 0, secondsBeforeRemount, secondsAfterRemount,
      localBackupClearedAfterReconnect: true })

    await browser(['find', 'role', 'button', 'click', '--name', 'ไปข้อ 2'])
    await browser(['wait', '--text', 'เลือกคำตอบของ 1 + 1'])
    // Confirm the option from the actual student accessibility tree.
    assert.match(await browser(['snapshot', '-i']), /radio "[^"\n]*2"/)
    await browser(['find', 'role', 'radio', 'click', '--name', '2'])
    await until(async () => saves().some(request => request.args[0] === MCQ)
      && await backup() === null, 'mcq-autosave')
    observations.push({ case: 'real_mcq_autosave', passed: true, answerId: MCQ })

    await browser(['find', 'role', 'button', 'click', '--name', 'ไปข้อ 3'])
    await browser(['wait', '--fn', `document.querySelector('[aria-label="เลือกไฟล์คำตอบ"]') !== null`])
    const fixtureDir = await mkdtemp(join(tmpdir(), 'seb-w6-ui-qa-'))
    const fixturePath = join(fixtureDir, 'synthetic-answer.pdf')
    await writeFile(fixturePath, FIXTURE_PDF, { mode: 0o600 })
    await browser(['upload', '[aria-label="เลือกไฟล์คำตอบ"]', fixturePath])
    await browser(['wait', '[aria-label="ลองอัปโหลดไฟล์ synthetic-answer.pdf อีกครั้ง"]'])
    const firstPrepare = requests.find(request => request.operation === 'prepareExamAttachmentUpload')
    assert.ok(firstPrepare)
    assert.equal(firstPrepare.args[0].retry, false)
    assert.equal(uploadCount, 1)
    await browser(['find', 'role', 'button', 'click', '--name', 'ลองอัปโหลดไฟล์ synthetic-answer.pdf อีกครั้ง'])
    await browser(['wait', '[aria-label="นำไฟล์ synthetic-answer.pdf ออก"]'])
    const preparations = requests.filter(request => request.operation === 'prepareExamAttachmentUpload')
    assert.equal(preparations.length, 2)
    assert.equal(preparations[1].args[0].retry, true)
    assert.equal(preparations[1].args[0].uploadId, firstPrepare.args[0].uploadId)
    assert.equal(uploadCount, 1, 'reconciliation must not upload a second binary')
    await until(async () => saves().some(request => request.args[0] === FILE)
      && await backup() === null, 'uploaded-file-answer-save')
    const fileSave = saves().findLast(request => request.args[0] === FILE)
    const references = JSON.parse(fileSave.args[1])
    assert.equal(references.length, 1)
    assert.equal(references[0].name, 'synthetic-answer.pdf')
    observations.push({ case: 'lost_upload_response_retry', passed: true, sameUploadId: true,
      binaryUploadCount: uploadCount, answerReferenceCount: references.length })

    const confirmSubmission = async () => {
      // The last page intentionally has two submit buttons. Use the first
      // actual accessibility ref from a fresh snapshot, not a guessed index.
      const snapshot = await browser(['snapshot', '-i'])
      const submitRef = snapshot.match(/button "ส่งคำตอบ ✓" \[ref=(e[0-9]+)\]/)?.[1]
      assert.ok(submitRef)
      await browser(['click', `@${submitRef}`])
      await browser(['wait', '--text', 'ยืนยันการส่งข้อสอบ'])
      await browser(['wait', '--text', 'ยืนยันส่งเลย'])
      await browser(['find', 'role', 'button', 'click', '--name', 'ยืนยันส่งเลย'])
    }
    await confirmSubmission()
    await until(() => requests.some(request => request.operation === 'submitSubmission'), 'submit-refusal')
    await browser(['wait', '--text', 'UI QA ปฏิเสธการส่งสังเคราะห์'])
    assert.equal(await evaluate('location.pathname'), `${BASE}/take`)
    assert.ok(await evaluate(`document.querySelector('[aria-label="นำไฟล์ synthetic-answer.pdf ออก"]') !== null`))
    observations.push({ case: 'submit_refusal_no_navigation', passed: true, retainedExamDom: true })
    const browserErrors = JSON.parse(await browser(['errors', '--json']))
    assert.equal(browserErrors.success, true)
    assert.ok(Array.isArray(browserErrors.data?.errors), 'version-matched browser error response')
    const newBrowserErrors = browserErrors.data.errors.filter(error => !baselineErrorIds.has(JSON.stringify(error)))
    assert.deepEqual(newBrowserErrors, [], 'no new errors during the active real-client exercise')
    assert.equal(activeExceptions.size, 0, 'no active real-time uncaught client exceptions')

    submitMode = 'success'
    await confirmSubmission()
    await browser(['wait', '--text', 'UI QA · ใบรับจำลอง ไม่ใช่ native exit'])
    assert.equal(await evaluate('location.pathname'), `${BASE}/submitted`)
    assert.equal(requests.filter(request => request.operation === 'submitSubmission').length, 2)
    observations.push({ case: 'successful_submit_canonical_receipt_navigation', passed: true,
      canonicalPath: `${BASE}/submitted`, receipt: 'intercepted_browser_only' })
    assert.equal(interceptionFailure, null)
    assert.deepEqual(unexpected, [])
    return { status: 'passed', scope: 'real_client_browser_only_synthetic_interception',
      backendAuthDbNativeProof: 'not_exercised_pending_w7', observations, unexpected,
      operations: requests.map(request => request.operation), uploadCount,
      activeClientUncaughtErrorCount: activeExceptions.size,
      newBrowserErrorCount: newBrowserErrors.length,
      preexistingBrowserLogErrorCount: baselineErrors.data.errors.length }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ observations, unexpected, requests,
      interceptionFailure: interceptionFailure?.message })}\n`)
    process.stdout.write(`${await browser(['snapshot', '-i']).catch(() => 'UI_QA_SNAPSHOT_UNAVAILABLE')}\n`)
    throw error
  } finally {
    // Close the owned browser before removing interception, so no late request
    // can escape to the unchanged server after the harness disconnects.
    await browser(['close']).catch(() => {})
    cdp?.close()
  }
}

if (process.argv[1]?.endsWith('seb-waiting-client-browser-qa.mjs')) {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/seb-waiting-client-browser-qa.mjs [--discover]\n'
      + 'Browser-only synthetic QA; requires the existing localhost:3011 lab-enabled next dev.\n'
      + 'No Auth/DB/native fixtures, remote origin, enrollment, or backend bypass.\n')
    process.exit(0)
  }
  assert.ok(args.every(arg => arg === '--discover'), 'only --discover is accepted; origin is localhost:3011 only')
  runWaitingClientBrowserQa({ discover: args.includes('--discover') }).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }).catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}

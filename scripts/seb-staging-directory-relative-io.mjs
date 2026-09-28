import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HELPER_PATH = fileURLToPath(new URL(
  './seb-staging-directory-relative-io.py',
  import.meta.url,
))
const PYTHON_EXECUTABLE = '/usr/bin/python3'
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const OPERATION_TIMEOUT_MS = 10_000
const KILL_CLOSE_GRACE_MS = 5_000
const SAFE_NAME = /^[a-z0-9.-]{1,160}$/
const DEFAULT_RUNTIME = Object.freeze({
  pythonExecutable: PYTHON_EXECUTABLE,
  helperPath: HELPER_PATH,
  operationTimeoutMs: OPERATION_TIMEOUT_MS,
  killCloseGraceMs: KILL_CLOSE_GRACE_MS,
  environment: Object.freeze({}),
})

function isDataRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactFields(value, fields) {
  if (!isDataRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function safeName(value) {
  return typeof value === 'string'
    && SAFE_NAME.test(value)
    && value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('\0')
}

function parseOwnership(value, expectedName = null) {
  if (!exactFields(value, ['name', 'dev', 'ino'])
    || !safeName(value.name)
    || (expectedName !== null && value.name !== expectedName)
    || typeof value.dev !== 'string'
    || !/^[0-9]+$/.test(value.dev)
    || typeof value.ino !== 'string'
    || !/^[0-9]+$/.test(value.ino)) {
    return null
  }
  return Object.freeze({ name: value.name, dev: value.dev, ino: value.ino })
}

function immutableResult(value) {
  return Object.freeze(value)
}

function parseProtocolResponse(stdout, code, signal, timedOut, protocolFailed) {
  if (timedOut || protocolFailed || signal !== null || (code !== 0 && code !== 1)) {
    return null
  }
  try {
    const parsed = JSON.parse(stdout)
    if (!isDataRecord(parsed)) return null
    if (code === 0 && parsed.ok === true) return parsed
    if (code === 1 && parsed.ok === false) return parsed
    return null
  } catch {
    return null
  }
}

function invokeHelper(directoryHandle, operation, request, runtime) {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(runtime.pythonExecutable, ['-I', '-B', runtime.helperPath, operation], {
        stdio: ['pipe', 'pipe', 'ignore', directoryHandle.fd],
        env: runtime.environment,
      })
    } catch {
      resolve(Object.freeze({
        response: null,
        quiescent: true,
        completion: Promise.resolve(),
      }))
      return
    }

    let resultSettled = false
    let timedOut = false
    let protocolFailed = false
    let terminationStarted = false
    let stdout = ''
    let operationTimer = null
    let killCloseTimer = null
    let completeClose
    const completion = new Promise(resolveClose => {
      completeClose = resolveClose
    })
    const finish = (response, quiescent) => {
      if (resultSettled) return
      resultSettled = true
      if (operationTimer) clearTimeout(operationTimer)
      if (killCloseTimer) clearTimeout(killCloseTimer)
      resolve(Object.freeze({ response, quiescent, completion }))
    }

    const terminate = () => {
      if (terminationStarted) return
      terminationStarted = true
      try {
        child.kill('SIGKILL')
      } catch {}
      killCloseTimer = setTimeout(() => finish(null, false), runtime.killCloseGraceMs)
    }

    operationTimer = setTimeout(() => {
      timedOut = true
      terminate()
    }, runtime.operationTimeoutMs)

    child.on('error', () => {
      protocolFailed = true
      terminate()
    })
    child.stdout.on('data', chunk => {
      if (resultSettled) return
      stdout += chunk.toString('utf8')
      if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES) {
        protocolFailed = true
        terminate()
      }
    })
    child.stdout.on('error', () => {
      protocolFailed = true
      terminate()
    })
    child.stdin.on('error', () => {
      protocolFailed = true
      terminate()
    })
    child.on('close', (code, signal) => {
      completeClose()
      const response = parseProtocolResponse(
        stdout,
        code,
        signal,
        timedOut,
        protocolFailed,
      )
      finish(response, true)
    })
    try {
      child.stdin.end(JSON.stringify(request))
    } catch {
      protocolFailed = true
      terminate()
    }
  })
}

function validRuntime(value) {
  return isDataRecord(value)
    && typeof value.pythonExecutable === 'string'
    && value.pythonExecutable.startsWith('/')
    && typeof value.helperPath === 'string'
    && value.helperPath.startsWith('/')
    && Number.isInteger(value.operationTimeoutMs)
    && value.operationTimeoutMs >= 10
    && value.operationTimeoutMs <= 30_000
    && Number.isInteger(value.killCloseGraceMs)
    && value.killCloseGraceMs >= 10
    && value.killCloseGraceMs <= 30_000
    && isDataRecord(value.environment)
}

/**
 * Bind every evidence filename operation to an already-open directory handle.
 * Construction fails when the host cannot provide Python's POSIX dir_fd
 * primitives; there is intentionally no pathname fallback.
 */
async function createDirectoryRelativeIo({
  directoryHandle,
  directoryIdentity,
} = {}, runtime, testPauseAfterStatMs = 0, testNotifyAfterStatName = null) {
  if (!directoryHandle
    || !Number.isInteger(directoryHandle.fd)
    || directoryHandle.fd < 0
    || !isDataRecord(directoryIdentity)
    || typeof directoryIdentity.dev !== 'string'
    || !/^[0-9]+$/.test(directoryIdentity.dev)
    || typeof directoryIdentity.ino !== 'string'
    || !/^[0-9]+$/.test(directoryIdentity.ino)
    || !validRuntime(runtime)
    || !Number.isInteger(testPauseAfterStatMs)
    || testPauseAfterStatMs < 0
    || testPauseAfterStatMs > 2_000
    || (testNotifyAfterStatName !== null && !safeName(testNotifyAfterStatName))) {
    return null
  }
  const directory = Object.freeze({ ...directoryIdentity })
  const probeExecution = await invokeHelper(directoryHandle, 'probe', { directory }, runtime)
  const probe = probeExecution.response
  if (!exactFields(probe, ['ok']) || probe.ok !== true) return null
  let unresolvedHelperObligation = false
  const pendingHelperCompletions = new Set()

  async function invoke(operation, request) {
    const execution = await invokeHelper(directoryHandle, operation, request, runtime)
    if (!execution.quiescent) {
      let trackedCompletion
      trackedCompletion = execution.completion.finally(() => {
        pendingHelperCompletions.delete(trackedCompletion)
      })
      pendingHelperCompletions.add(trackedCompletion)
    }
    if (execution.response === null) unresolvedHelperObligation = true
    return execution.response
  }

  async function createOwnedFile(name, bytes) {
    if (!safeName(name) || !(bytes instanceof Uint8Array)) {
      return immutableResult({ status: 'failed', ownership: null })
    }
    const response = await invoke('create-owned', {
      directory,
      name,
      bytesBase64: Buffer.from(bytes).toString('base64'),
    })
    if (exactFields(response, ['ok', 'ownership']) && response.ok === true) {
      const ownership = parseOwnership(response.ownership, name)
      if (ownership) return immutableResult({ status: 'created', ownership })
    }
    if (exactFields(response, ['ok', 'code'])
      && response.ok === false
      && response.code === 'exists') {
      return immutableResult({ status: 'exists', ownership: null })
    }
    if (exactFields(response, ['ok', 'code', 'ownership']) && response.ok === false) {
      const ownership = parseOwnership(response.ownership, name)
      if (ownership) return immutableResult({ status: 'failed', ownership })
    }
    unresolvedHelperObligation = true
    return immutableResult({ status: 'failed', ownership: null })
  }

  async function linkOwned(ownership, destination) {
    const source = parseOwnership(ownership)
    if (!source || !safeName(destination)) return immutableResult({ status: 'failed' })
    const request = {
      directory,
      source,
      destination,
      ...(testPauseAfterStatMs > 0 || testNotifyAfterStatName !== null
        ? { testPauseAfterStatMs, testNotifyAfterStatName }
        : {}),
    }
    const response = await invoke('link-owned', request)
    if (exactFields(response, ['ok', 'status'])
      && response.ok === true
      && (response.status === 'linked' || response.status === 'exists')
    ) return immutableResult({ status: response.status })
    // A failed publication may have reached link(2) before its rollback failed.
    // The helper intentionally exposes no "safe to continue" failure class, so
    // retain a permanent obligation instead of claiming a clean close.
    unresolvedHelperObligation = true
    return immutableResult({ status: 'failed' })
  }

  async function readRegularFile(name) {
    if (!safeName(name)) return immutableResult({ status: 'failed' })
    const response = await invoke('read-regular', {
      directory,
      name,
    })
    const ownership = parseOwnership(response?.ownership, name)
    if (!exactFields(response, ['ok', 'ownership', 'bytesBase64'])
      || response.ok !== true
      || !ownership
      || typeof response.bytesBase64 !== 'string') {
      return immutableResult({ status: 'failed' })
    }
    try {
      const bytes = Buffer.from(response.bytesBase64, 'base64')
      if (bytes.toString('base64') !== response.bytesBase64) {
        return immutableResult({ status: 'failed' })
      }
      return immutableResult({ status: 'read', ownership, bytes })
    } catch {
      return immutableResult({ status: 'failed' })
    }
  }

  async function unlinkOwned(ownership) {
    const parsed = parseOwnership(ownership)
    if (!parsed) return immutableResult({ status: 'failed' })
    const response = await invoke('unlink-owned', {
      directory,
      ownership: parsed,
    })
    if (exactFields(response, ['ok']) && response.ok === true) {
      return immutableResult({ status: 'unlinked' })
    }
    if (!exactFields(response, ['ok', 'code']) || response.ok !== false) {
      unresolvedHelperObligation = true
    }
    return immutableResult({ status: 'failed' })
  }

  function hasUnresolvedObligations() {
    return unresolvedHelperObligation || pendingHelperCompletions.size !== 0
  }

  async function awaitQuiescence() {
    if (pendingHelperCompletions.size === 0) return true
    let timer
    await Promise.race([
      Promise.allSettled([...pendingHelperCompletions]),
      new Promise(resolve => {
        timer = setTimeout(resolve, runtime.killCloseGraceMs)
      }),
    ])
    if (timer) clearTimeout(timer)
    return pendingHelperCompletions.size === 0
  }

  return Object.freeze({
    createOwnedFile,
    linkOwned,
    readRegularFile,
    unlinkOwned,
    hasUnresolvedObligations,
    awaitQuiescence,
  })
}

export async function createSebStagingDirectoryRelativeIo(options = {}) {
  return createDirectoryRelativeIo(options, DEFAULT_RUNTIME)
}

export async function createSebStagingDirectoryRelativeIoForTests(
  options = {},
  {
    runtime = DEFAULT_RUNTIME,
    testPauseAfterStatMs = 0,
    testNotifyAfterStatName = null,
  } = {},
) {
  if (process.env.NODE_ENV !== 'test') return null
  const testRuntime = testPauseAfterStatMs > 0 || testNotifyAfterStatName !== null
    ? {
        ...runtime,
        environment: {
          ...runtime.environment,
          SEB_STAGING_DIRECTORY_IO_TEST_MODE: '1',
        },
      }
    : runtime
  return createDirectoryRelativeIo(
    options,
    testRuntime,
    testPauseAfterStatMs,
    testNotifyAfterStatName,
  )
}

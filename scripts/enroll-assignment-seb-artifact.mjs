#!/usr/bin/env node

import { open, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { inspectEnvFilePermission, parseEnvFile } from './check-seb-readiness-core.mjs'
import {
  SebArtifactOperatorError,
  enrollAssignmentSebStagingArtifact,
  inspectAssignmentSebPlaintextArtifact,
  operatorEnvironmentBlockerFields,
  parseOperatorArguments,
  readAssignmentSebOperatorContext,
} from './seb-assignment-artifact-core.mjs'

const DEFAULT_ENV_FILE = new URL('../.env.qa.local', import.meta.url)
const MAX_EVIDENCE_BYTES = 24_000

async function loadEnvironment(customPath) {
  const envPath = customPath ? resolve(customPath) : DEFAULT_ENV_FILE
  let contents = ''
  let handle = null
  try {
    handle = await open(envPath, 'r')
    const metadata = await handle.stat()
    const permission = inspectEnvFilePermission({
      exists: true,
      mode: metadata.mode,
      platform: process.platform,
    })
    if (permission.status === 'blocker') throw new SebArtifactOperatorError('SEB_OPERATOR_ENV_FILE_PERMISSIONS')
    contents = await handle.readFile('utf8')
  } catch (error) {
    if (error instanceof SebArtifactOperatorError) throw error
    if (error?.code !== 'ENOENT' || customPath) throw new SebArtifactOperatorError('SEB_OPERATOR_ENV_FILE_INVALID')
  } finally {
    await handle?.close()
  }
  const parsed = parseEnvFile(contents, process.env)
  if (parsed.warnings.length > 0) throw new SebArtifactOperatorError('SEB_OPERATOR_ENV_FILE_INVALID')
  return { ...parsed.values, ...process.env }
}

function createStagingAdmin(environment) {
  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  )
}

async function readEvidenceFromStdin() {
  if (process.stdin.isTTY) throw new SebArtifactOperatorError('SEB_NATIVE_EVIDENCE_STDIN_REQUIRED')
  process.stdin.setEncoding('utf8')
  let value = ''
  for await (const chunk of process.stdin) {
    value += chunk
    if (Buffer.byteLength(value, 'utf8') > MAX_EVIDENCE_BYTES) {
      throw new SebArtifactOperatorError('SEB_NATIVE_EVIDENCE_INVALID')
    }
  }
  if (!value.trim()) throw new SebArtifactOperatorError('SEB_NATIVE_EVIDENCE_STDIN_REQUIRED')
  return value
}

function printSafe(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function main() {
  const options = parseOperatorArguments(process.argv.slice(2), 'enroll')
  const environment = await loadEnvironment(options['env-file'])
  const blockers = operatorEnvironmentBlockerFields(environment)
  if (blockers.length > 0) {
    printSafe({ status: 'blocked', code: 'SEB_OPERATOR_ENVIRONMENT_BLOCKED', fields: blockers })
    process.exitCode = 1
    return
  }

  const artifactBytes = await readFile(resolve(options.artifact))
  inspectAssignmentSebPlaintextArtifact(artifactBytes)

  if (!options.apply) {
    printSafe({
      status: 'ready',
      mode: 'dry-run',
      assignmentId: options.assignment,
      revision: options.revision,
      networkUsed: false,
      mutationUsed: false,
    })
    return
  }

  const evidence = await readEvidenceFromStdin()
  const admin = createStagingAdmin(environment)
  const context = await readAssignmentSebOperatorContext(admin, options.assignment, options.revision)
  const result = await enrollAssignmentSebStagingArtifact({
    admin,
    context,
    artifactBytes,
    evidence,
    environment,
  })
  printSafe({ status: 'enrolled', uploadStatus: result.uploadStatus, ...result.release })
}

try {
  await main()
} catch (error) {
  const code = error instanceof SebArtifactOperatorError
    ? error.code
    : error?.code === 'ENOENT'
      ? 'SEB_OPERATOR_FILE_MISSING'
      : 'SEB_OPERATOR_FAILED'
  printSafe({ status: 'failed', code })
  process.exitCode = 1
}

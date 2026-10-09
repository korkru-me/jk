#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { readAssignmentSebOperatorContext } from './seb-assignment-artifact-core.mjs'
import {
  enrollWaitingSebOperator, loadWaitingOperatorEnvironment, parseWaitingOperatorArguments,
  readWaitingNativeEvidenceFromStdin, readWaitingOperatorFile,
  waitingOperatorAssignmentIsPasswordless, waitingOperatorEnvironmentBlockers, waitingOperatorSafeFailure,
} from './seb-waiting-operator-core.mjs'

export async function main(argv = process.argv.slice(2)) {
  const options = parseWaitingOperatorArguments(argv, 'enroll')
  const environment = await loadWaitingOperatorEnvironment(options['env-file'])
  const blockers = waitingOperatorEnvironmentBlockers(environment)
  if (blockers.length) return { status: 'blocked', code: 'SEB_OPERATOR_ENVIRONMENT_BLOCKED', fields: blockers }
  const artifactBytes = await readWaitingOperatorFile(resolve(options.artifact), { privateFile: true })
  // No evidence/credential reads or service client on a local policy dry-run.
  const evidence = !options.apply ? undefined : options['evidence-file']
    ? new TextDecoder('utf-8', { fatal: true }).decode(await readWaitingOperatorFile(resolve(options['evidence-file']), { privateFile: true, maxBytes: 24_000 }))
    : await readWaitingNativeEvidenceFromStdin(process.stdin)
  const admin = !options.apply ? undefined : createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  const readContext = (assignmentId, revision) => readAssignmentSebOperatorContext(admin, assignmentId, revision)
  return enrollWaitingSebOperator({ options, environment, artifactBytes, evidence }, { admin, readContext,
    checkPasswordlessAssignment: assignmentId => waitingOperatorAssignmentIsPasswordless(admin, assignmentId) })
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.status === 'blocked') process.exitCode = 1
  }).catch(error => {
    process.stdout.write(`${JSON.stringify(waitingOperatorSafeFailure(error))}\n`)
    process.exitCode = 1
  })
}

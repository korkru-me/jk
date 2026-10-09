#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { readAssignmentSebOperatorContext } from './seb-assignment-artifact-core.mjs'
import {
  loadWaitingOperatorEnvironment, parseWaitingOperatorArguments, prepareWaitingSebOperator,
  readWaitingOperatorFile, waitingOperatorAssignmentIsPasswordless, waitingOperatorEnvironmentBlockers, waitingOperatorSafeFailure,
} from './seb-waiting-operator-core.mjs'

export async function main(argv = process.argv.slice(2)) {
  const options = parseWaitingOperatorArguments(argv, 'prepare')
  const environment = await loadWaitingOperatorEnvironment(options['env-file'])
  const blockers = waitingOperatorEnvironmentBlockers(environment)
  if (blockers.length) return { status: 'blocked', code: 'SEB_OPERATOR_ENVIRONMENT_BLOCKED', fields: blockers }
  const templateBytes = await readWaitingOperatorFile(resolve(options.template))
  // Lazy service client: a dry-run performs no network/data work.
  let admin
  const readContext = (assignmentId, revision) => {
    admin ??= createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    return readAssignmentSebOperatorContext(admin, assignmentId, revision)
  }
  return prepareWaitingSebOperator({ options, environment, templateBytes }, { readContext,
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

#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

import {
  formatSebPhysicalUatReport,
  inspectSebPhysicalUatEvidence,
} from './check-seb-physical-uat-core.mjs'

const manifest = JSON.parse(await readFile(
  new URL('../config/seb-physical-uat-evidence.json', import.meta.url),
  'utf8',
))
const inspection = inspectSebPhysicalUatEvidence(manifest)
process.stdout.write(`${formatSebPhysicalUatReport(inspection.checks)}\n`)
if (!inspection.ready) process.exitCode = 1

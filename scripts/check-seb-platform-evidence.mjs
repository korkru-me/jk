#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  formatSebPlatformEvidenceReport,
  inspectSebPlatformEvidence,
} from './check-seb-platform-evidence-core.mjs'

const MANIFEST_URL = new URL('../config/seb-platform-evidence.json', import.meta.url)
const REGISTRY_URL = new URL('../config/seb-release-registry.json', import.meta.url)
let manifest = null
let releaseRegistry = null
try {
  manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'))
} catch {
  manifest = {}
}
try {
  releaseRegistry = JSON.parse(await readFile(REGISTRY_URL, 'utf8'))
} catch {
  releaseRegistry = {}
}

const result = inspectSebPlatformEvidence(manifest, { releaseRegistry })
console.log(formatSebPlatformEvidenceReport(result.checks))
if (!result.ready) process.exitCode = 1

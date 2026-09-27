#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  formatSebReleaseRegistryReport,
  inspectSebReleaseRegistry,
} from './check-seb-release-registry-core.mjs'

const REGISTRY_URL = new URL('../config/seb-release-registry.json', import.meta.url)

let manifest = {}
try {
  manifest = JSON.parse(await readFile(REGISTRY_URL, 'utf8'))
} catch {
  // The inspector reports a fixed-schema blocker without echoing parse data.
}

let candidateArtifactSha256 = null
const candidate = Array.isArray(manifest?.revisions)
  ? manifest.revisions.find(row => row?.revision === manifest?.candidateRevision)
  : null
if (typeof candidate?.artifactPath === 'string' && /^\/exam\/[A-Za-z0-9._-]+\.seb$/.test(candidate.artifactPath)) {
  try {
    const artifact = await readFile(new URL(`../public${candidate.artifactPath}`, import.meta.url))
    candidateArtifactSha256 = createHash('sha256').update(artifact).digest('hex')
  } catch {
    candidateArtifactSha256 = null
  }
}

const result = inspectSebReleaseRegistry(manifest, { candidateArtifactSha256 })
console.log(formatSebReleaseRegistryReport(result.checks))
if (!result.ready) process.exitCode = 1

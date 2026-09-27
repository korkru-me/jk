#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

import {
  formatNextSebPhysicalUatStep,
  nextSebPhysicalUatStep,
} from './check-seb-physical-uat-core.mjs'

const manifest = JSON.parse(await readFile(
  new URL('../config/seb-physical-uat-evidence.json', import.meta.url),
  'utf8',
))
process.stdout.write(`${formatNextSebPhysicalUatStep(nextSebPhysicalUatStep(manifest))}\n`)

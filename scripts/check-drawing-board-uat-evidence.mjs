#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import {
  formatDrawingBoardUatEvidenceReport,
  inspectDrawingBoardUatEvidence,
} from './check-drawing-board-uat-evidence-core.mjs'

const manifest = JSON.parse(await readFile(
  new URL('../config/drawing-board-uat-evidence.json', import.meta.url),
  'utf8',
))
const result = inspectDrawingBoardUatEvidence(manifest)

console.log(formatDrawingBoardUatEvidenceReport(result.checks))
if (!result.ready) process.exitCode = 1

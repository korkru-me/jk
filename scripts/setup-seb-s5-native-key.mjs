#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { chmod, mkdir, open, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const DEFAULT_KEY_PATH = resolve('.local/seb-s5/native-automation-key')
const BLOCKED_MESSAGE = 'SEB S5 native key setup blocked'

async function readExisting(path) {
  try {
    const value = (await readFile(path, 'utf8')).trim()
    const bytes = Buffer.from(value, 'base64')
    return bytes.length === 32 && bytes.toString('base64') === value ? value : null
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const rotate = process.argv.includes('--rotate')
  const pathArgument = process.argv.slice(2).find(value => value !== '--rotate')
  const path = pathArgument ? resolve(pathArgument) : DEFAULT_KEY_PATH
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const existing = rotate ? null : await readExisting(path)
  if (existing === null) {
    const value = randomBytes(32).toString('base64')
    const flags = rotate
      ? fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_WRONLY
      : fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY
    const handle = await open(path, flags, 0o600)
    try {
      await handle.writeFile(`${value}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  await chmod(path, 0o600)
  process.stdout.write(`${JSON.stringify({ status: 'ready', path })}\n`)
}

main().catch(() => {
  process.stderr.write(`${BLOCKED_MESSAGE}\n`)
  process.exitCode = 1
})

import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LabError, validateConfig } from './client.mjs'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

// Accept only the private lab's connection file, not .env.local or arbitrary
// filesystem paths. No secrets on the command line or from production env vars.
export async function readLabConfig(path, root = repoRoot) {
  let handle
  try {
    const requested = resolve(root, path)
    const actual = await realpath(requested)
    const directory = dirname(actual)
    const labRoot = await realpath(resolve(root, '.local'))
    if (actual !== requested || basename(actual) !== 'connection.json' ||
        dirname(directory) !== labRoot || !/^seb-phase2-[a-zA-Z0-9]+$/.test(basename(directory))) {
      throw new Error('path')
    }
    const dirInfo = await stat(directory)
    if ((dirInfo.mode & 0o077) !== 0 || dirInfo.uid !== process.getuid()) throw new Error('directory permissions')
    handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile() || info.size > 8192 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error('file permissions')
    const value = JSON.parse(await handle.readFile('utf8'))
    validateConfig(value)
    return value
  } catch {
    throw new LabError('PRIVATE_LAB_CONFIG_REQUIRED')
  } finally {
    await handle?.close()
  }
}

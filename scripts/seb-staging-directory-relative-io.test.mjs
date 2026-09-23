import { constants as fsConstants } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createSebStagingDirectoryRelativeIo,
  createSebStagingDirectoryRelativeIoForTests,
} from './seb-staging-directory-relative-io.mjs'

const roots = []
const handles = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'seb-directory-io-'))
  roots.push(root)
  const directory = join(root, 'evidence')
  await mkdir(directory, { mode: 0o700 })
  const handle = await open(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  )
  handles.push(handle)
  const value = await handle.stat({ bigint: true })
  const io = await createSebStagingDirectoryRelativeIo({
    directoryHandle: handle,
    directoryIdentity: { dev: String(value.dev), ino: String(value.ino) },
  })
  expect(io).not.toBeNull()
  return { root, directory, handle, io }
}

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map(handle => handle.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('SEB Staging directory-relative I/O', () => {
  it('links only inside the opened directory when its pathname is replaced', async () => {
    const { root, directory, io } = await fixture()
    const moved = join(root, 'opened-directory')
    const attacker = join(root, 'attacker-directory')
    const temporaryName = '.seb-s5-dir-link.01010101010101010101010101010101.tmp'
    const finalName = 'seb-s5-dir-link.json'
    const created = await io.createOwnedFile(temporaryName, Buffer.from('evidence'))
    expect(created.status).toBe('created')

    await rename(directory, moved)
    await mkdir(attacker)
    await symlink(attacker, directory)

    await expect(io.linkOwned(created.ownership, finalName))
      .resolves.toEqual({ status: 'linked' })
    await expect(readdir(attacker)).resolves.toEqual([])
    await expect(readdir(moved)).resolves.toEqual([finalName, temporaryName].sort())
    await expect(io.unlinkOwned(created.ownership)).resolves.toEqual({ status: 'unlinked' })
    const read = await io.readRegularFile(finalName)
    expect(read.status).toBe('read')
    expect(read.bytes.toString('utf8')).toBe('evidence')
  })

  it('never unlinks a same-named attacker file after pathname replacement', async () => {
    const { root, directory, io } = await fixture()
    const moved = join(root, 'opened-directory')
    const attacker = join(root, 'attacker-directory')
    const temporaryName = '.seb-s5-dir-unlink.02020202020202020202020202020202.tmp'
    const created = await io.createOwnedFile(temporaryName, Buffer.from('owned'))
    expect(created.status).toBe('created')

    await rename(directory, moved)
    await mkdir(attacker)
    await writeFile(join(attacker, temporaryName), 'attacker-sentinel', 'utf8')
    await symlink(attacker, directory)

    await expect(io.unlinkOwned(created.ownership)).resolves.toEqual({ status: 'unlinked' })
    await expect(readFile(join(attacker, temporaryName), 'utf8'))
      .resolves.toBe('attacker-sentinel')
    await expect(readdir(moved)).resolves.toEqual([])
  })

  it('rolls back the destination if the source inode is swapped before link', async () => {
    const { directory, handle } = await fixture()
    const temporaryName = '.seb-s5-dir-source-swap.03030303030303030303030303030303.tmp'
    const savedName = '.seb-s5-dir-source-swap-saved.tmp'
    const attackerName = '.seb-s5-dir-source-swap-attacker.tmp'
    const notifyName = '.seb-s5-dir-source-swap-ready.tmp'
    const finalName = 'seb-s5-dir-source-swap.json'
    const value = await handle.stat({ bigint: true })
    const io = await createSebStagingDirectoryRelativeIoForTests({
      directoryHandle: handle,
      directoryIdentity: { dev: String(value.dev), ino: String(value.ino) },
    }, {
      testPauseAfterStatMs: 500,
      testNotifyAfterStatName: notifyName,
    })
    expect(io).not.toBeNull()
    const created = await io.createOwnedFile(temporaryName, Buffer.from('owned'))
    expect(created.status).toBe('created')
    await writeFile(join(directory, attackerName), 'attacker', 'utf8')

    const publication = io.linkOwned(created.ownership, finalName)
    let notified = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        notified = await readFile(join(directory, notifyName), 'utf8') === 'ready'
      } catch {}
      if (notified) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(notified).toBe(true)
    await rename(join(directory, temporaryName), join(directory, savedName))
    await rename(join(directory, attackerName), join(directory, temporaryName))

    await expect(publication).resolves.toEqual({ status: 'failed' })
    expect(io.hasUnresolvedObligations()).toBe(true)
    await expect(readFile(join(directory, finalName), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, temporaryName), 'utf8'))
      .resolves.toBe('attacker')
    await expect(readFile(join(directory, savedName), 'utf8')).resolves.toBe('owned')
  })

  it('revalidates source ownership before reporting an existing destination', async () => {
    const { directory, handle } = await fixture()
    const value = await handle.stat({ bigint: true })
    const temporaryName = '.seb-s5-dir-exists-swap.05050505050505050505050505050505.tmp'
    const savedName = '.seb-s5-dir-exists-swap-saved.tmp'
    const attackerName = '.seb-s5-dir-exists-swap-attacker.tmp'
    const notifyName = '.seb-s5-dir-exists-swap-ready.tmp'
    const finalName = 'seb-s5-dir-exists-swap.json'
    const io = await createSebStagingDirectoryRelativeIoForTests({
      directoryHandle: handle,
      directoryIdentity: { dev: String(value.dev), ino: String(value.ino) },
    }, {
      testPauseAfterStatMs: 500,
      testNotifyAfterStatName: notifyName,
    })
    expect(io).not.toBeNull()
    const created = await io.createOwnedFile(temporaryName, Buffer.from('owned'))
    expect(created.status).toBe('created')
    await writeFile(join(directory, attackerName), 'attacker', 'utf8')
    await writeFile(join(directory, finalName), 'existing-final', 'utf8')

    const publication = io.linkOwned(created.ownership, finalName)
    let notified = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        notified = await readFile(join(directory, notifyName), 'utf8') === 'ready'
      } catch {}
      if (notified) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(notified).toBe(true)
    await rename(join(directory, temporaryName), join(directory, savedName))
    await rename(join(directory, attackerName), join(directory, temporaryName))

    await expect(publication).resolves.toEqual({ status: 'failed' })
    expect(io.hasUnresolvedObligations()).toBe(true)
    await expect(readFile(join(directory, finalName), 'utf8'))
      .resolves.toBe('existing-final')
  })

  it('waits for a timed-out helper to close before returning control', async () => {
    const { root, directory, handle } = await fixture()
    const value = await handle.stat({ bigint: true })
    const helperPath = join(root, 'slow-helper.py')
    await writeFile(helperPath, [
      'import json, os, sys, time',
      'request = json.load(sys.stdin)',
      'if sys.argv[1] == "probe":',
      '    os.fstat(3)',
      '    print("{\\"ok\\":true}", flush=True)',
      '    raise SystemExit(0)',
      'time.sleep(0.7)',
      'fd = os.open("late-marker", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=3)',
      'os.write(fd, b"late")',
      'os.close(fd)',
      'print("{\\"ok\\":false,\\"code\\":\\"late\\"}", flush=True)',
      'raise SystemExit(1)',
      '',
    ].join('\n'), 'utf8')
    const io = await createSebStagingDirectoryRelativeIoForTests({
      directoryHandle: handle,
      directoryIdentity: { dev: String(value.dev), ino: String(value.ino) },
    }, {
      runtime: {
        pythonExecutable: '/usr/bin/python3',
        helperPath,
        operationTimeoutMs: 200,
        killCloseGraceMs: 1_000,
        environment: {},
      },
    })
    expect(io).not.toBeNull()

    await expect(io.createOwnedFile(
      '.seb-s5-timeout.04040404040404040404040404040404.tmp',
      Buffer.from('evidence'),
    )).resolves.toEqual({ status: 'failed', ownership: null })
    await expect(readdir(directory)).resolves.toEqual([])
    await new Promise(resolve => setTimeout(resolve, 800))
    await expect(readdir(directory)).resolves.toEqual([])
    expect(await io.awaitQuiescence()).toBe(true)
    expect(io.hasUnresolvedObligations()).toBe(true)
  })

  it('rejects a success payload from a helper that exits nonzero', async () => {
    const { root, handle } = await fixture()
    const value = await handle.stat({ bigint: true })
    const helperPath = join(root, 'wrong-exit-helper.py')
    await writeFile(helperPath, [
      'import json, sys',
      'json.load(sys.stdin)',
      'print("{\\"ok\\":true}", flush=True)',
      'raise SystemExit(1)',
      '',
    ].join('\n'), 'utf8')

    await expect(createSebStagingDirectoryRelativeIoForTests({
      directoryHandle: handle,
      directoryIdentity: { dev: String(value.dev), ino: String(value.ino) },
    }, {
      runtime: {
        pythonExecutable: '/usr/bin/python3',
        helperPath,
        operationTimeoutMs: 1_000,
        killCloseGraceMs: 1_000,
        environment: {},
      },
    })).resolves.toBeNull()
  })

  it('has no pathname fallback after the trusted directory handle is closed', async () => {
    const { handle } = await fixture()
    const value = await handle.stat({ bigint: true })
    await handle.close()

    await expect(createSebStagingDirectoryRelativeIo({
      directoryHandle: handle,
      directoryIdentity: { dev: String(value.dev), ino: String(value.ino) },
    })).resolves.toBeNull()
  })
})

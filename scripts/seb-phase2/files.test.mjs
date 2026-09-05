import { chmod, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { readLabConfig } from './files.mjs'
import { prepareLab } from './prepare.mjs'

let root
beforeEach(async () => { root = await realpath(await mkdtemp(resolve(tmpdir(), 'korkru-seb-phase2-test-'))) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

it('creates fresh private credentials without replacing prior runs', async () => {
  const a = await prepareLab(root)
  const b = await prepareLab(root)
  expect(a.directory).not.toBe(b.directory)
  expect(a.projectName).not.toBe(b.projectName)
  expect(a.projectName).toMatch(/^korkru-seb-phase2-[a-f0-9]{12}$/)
  const configA = await readLabConfig(resolve(a.directory, 'connection.json'), root)
  const configB = await readLabConfig(resolve(b.directory, 'connection.json'), root)
  expect(configA.password).not.toBe(configB.password)
  expect(configA.clientSecret).not.toBe(configB.clientSecret)
  const env = await readFile(resolve(a.directory, '.env'), 'utf8')
  const entries = Object.fromEntries(env.trim().split('\n').map((line) => line.split('=')))
  expect(entries.LAB_ADMIN_PASSWORD).toBe(configA.password)
  expect(entries.LAB_SERVICE_PASSWORD).toBe(configA.clientSecret)
  expect(new Set(Object.entries(entries).filter(([k]) => k.endsWith('PASSWORD')).map(([, v]) => v)).size).toBe(4)
  expect((await stat(a.directory)).mode & 0o777).toBe(0o700)
  for (const file of ['.env', 'connection.json']) expect((await stat(resolve(a.directory, file))).mode & 0o777).toBe(0o600)
  expect(Object.keys(a).sort()).toEqual(['directory', 'projectName'])
})

it('rejects connection files readable by other users', async () => {
  const { directory } = await prepareLab(root)
  const path = resolve(directory, 'connection.json')
  await chmod(path, 0o644)
  await expect(readLabConfig(path, root)).rejects.toThrow('PRIVATE_LAB_CONFIG_REQUIRED')
})

it('rejects shared lab directories', async () => {
  const { directory } = await prepareLab(root)
  await chmod(directory, 0o755)
  await expect(readLabConfig(resolve(directory, 'connection.json'), root)).rejects.toThrow('PRIVATE_LAB_CONFIG_REQUIRED')
})

it('rejects arbitrary paths, symlinks, large and malformed config files', async () => {
  const { directory } = await prepareLab(root)
  const path = resolve(directory, 'connection.json')
  const alias = resolve(directory, 'alias.json')
  await symlink(path, alias)
  for (const value of [alias, resolve(root, '.env.local'), resolve(directory, '.env')]) {
    await expect(readLabConfig(value, root)).rejects.toThrow('PRIVATE_LAB_CONFIG_REQUIRED')
  }
  for (const value of ['{broken', 'x'.repeat(8193), '{"labOnly":false}']) {
    await writeFile(path, value)
    await expect(readLabConfig(path, root)).rejects.toThrow('PRIVATE_LAB_CONFIG_REQUIRED')
  }
})

it('does not prepare secrets through a symlinked .local directory', async () => {
  await symlink(root, resolve(root, '.local'))
  await expect(prepareLab(root)).rejects.toThrow('LAB_DIRECTORY_REQUIRED')
})

it('keeps compose isolated, pinned, without demo seeds or public database ports', async () => {
  const compose = JSON.parse(await readFile(new URL('../../infra/seb-phase2/compose.json', import.meta.url), 'utf8'))
  expect(Object.keys(compose.services).sort()).toEqual(['db', 'server'])
  expect(compose.networks.lab.internal).toBe(true)
  expect(compose.services.server.ports).toEqual(['127.0.0.1:18080:8080'])
  expect(compose.services.db.ports).toBeUndefined()
  expect(compose.services.db.volumes).toEqual(['lab-db:/var/lib/mysql'])
  expect(compose.services.server.volumes).toBeUndefined()
  expect(compose.name).toContain('${LAB_PROJECT_NAME:?')
  for (const service of Object.values(compose.services)) {
    expect(service.image).toMatch(/@sha256:[a-f0-9]{64}$/)
    expect(service.restart).toBe('no')
    expect(service.container_name).toBeUndefined()
    expect(service.privileged).toBeUndefined()
    expect(service.network_mode).toBeUndefined()
  }
  const env = compose.services.server.environment
  expect(env.spring_profiles_active).toBe('bundled')
  expect(env.spring_datasource_username).toBe('seb_lab')
  expect(env.sebserver_init_adminaccount_init_pwd).toContain('${LAB_ADMIN_PASSWORD:?')
  const properties = JSON.parse(env.SPRING_APPLICATION_JSON)
  expect(properties['logging.level.ch.ethz.seb.SEB_SERVER_INIT']).toBe('WARN')
  expect(properties['sebserver.feature.exam.seb.screenProctoring.enabled']).toBe(false)
  expect(properties['sebserver.feature.exam.seb.screenProctoring.bundled']).toBe(false)
})

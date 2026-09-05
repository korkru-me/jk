import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeLab, validateConfig } from './client.mjs'
import { syntheticConfig, syntheticConnectionData, syntheticDiscovery, syntheticExam, syntheticToken } from './fixtures.mjs'

const config = () => ({ ...syntheticConfig(), connection: { id: 27 } })
const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
function responses(data = syntheticConnectionData(), exam = syntheticExam()) {
  const fetch = vi.fn()
  for (const value of [syntheticDiscovery(), syntheticToken(), exam, data]) fetch.mockResolvedValueOnce(json(value))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('exact connection read preparation (not student integrity verification)', () => {
  it.each([null, {}, { id: '27' }, { id: '../27' }, { id: 0 }, { id: -1 }, { id: Number.MAX_SAFE_INTEGER + 1 },
    { id: 27, token: 'SYNTHETIC' }, { id: 27, url: 'https://example.invalid' }])('rejects ambiguous selectors without network IO', async connection => {
    const fetch = responses()
    await expect(probeLab({ ...config(), connection })).rejects.toThrow('EXACT_CONNECTION_REQUIRED')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('requires an exact exam before a connection and keeps only the numeric selector', () => {
    expect(() => validateConfig({ ...config(), exam: undefined })).toThrow('EXACT_CONNECTION_REQUIRED')
    expect(validateConfig(config()).connection).toEqual({ id: 27 })
  })
  it('reads only the selected connection after matching the exam and redacts the row', async () => {
    const fetch = responses()
    const result = await probeLab(config())
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls[3][0]).toBe('http://127.0.0.1:18080/admin-api/v1/seb-client-connection/data/27')
    expect(fetch.mock.calls[3][1]).toMatchObject({
      redirect: 'error', headers: { Authorization: 'Bearer SYNTHETIC-ACCESS-TOKEN', 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    expect(result.studentIntegrityVerified).toBe(false)
    expect(result.connection).toEqual({
      bindingMatched: true, status: 'ACTIVE', missingPing: false,
      reportedSecurityCheckGranted: true, reportedClientVersionGranted: true,
      explicitTrustedBuildVerified: false, freshnessVerified: false, studentBindingVerified: false,
    })
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|192\.0\.2\.1|connectionToken|examUserSessionId|seb_info|clientAddress/)
  })
  it('does not query the connection after an exam mismatch', async () => {
    const fetch = responses(syntheticConnectionData(), { ...syntheticExam(), institutionId: 4 })
    await expect(probeLab(config())).rejects.toThrow('EXAM_BINDING_MISMATCH')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it.each([{ id: 28 }, { id: '27' }, { examId: 13 }, { institutionId: 4 }])('rejects a mismatched returned connection binding', async override => {
    responses({ ...syntheticConnectionData(), cdat: { ...syntheticConnectionData().cdat, ...override } })
    await expect(probeLab(config())).rejects.toThrow('CONNECTION_BINDING_MISMATCH')
  })
  it.each(['UNDEFINED', 'CONNECTION_REQUESTED', 'READY', 'ACTIVE', 'CLOSED', 'DISABLED'])('never promotes %s or reported grants to proof', async status => {
    responses({ ...syntheticConnectionData(), cdat: { ...syntheticConnectionData().cdat, status } })
    expect((await probeLab(config())).connection).toMatchObject({
      status, explicitTrustedBuildVerified: false, freshnessVerified: false, studentBindingVerified: false,
    })
  })
  it.each([null, undefined, false, true])('preserves grant/ping uncertainty without truthy coercion (%s)', async value => {
    responses({ ...syntheticConnectionData(), miss: value, cdat: {
      ...syntheticConnectionData().cdat, securityCheckGranted: value, clientVersionGranted: value,
    } })
    expect((await probeLab(config())).connection).toMatchObject({
      missingPing: value ?? null, reportedSecurityCheckGranted: value ?? null,
      reportedClientVersionGranted: value ?? null, freshnessVerified: false,
    })
  })
  it.each([
    { cdat: null }, { cdat: [] },
    { miss: 'false' }, { miss: 0 },
    { cdat: { ...syntheticConnectionData().cdat, status: 'SYNTHETIC-SECRET' } },
    { cdat: { ...syntheticConnectionData().cdat, securityCheckGranted: 'true' } },
    { cdat: { ...syntheticConnectionData().cdat, clientVersionGranted: 1 } },
  ])('rejects malformed states without reflecting private fields', async override => {
    responses({ ...syntheticConnectionData(), ...override })
    const error = await probeLab(config()).catch(error => error)
    expect(error.message).toBe('INVALID_CONNECTION')
    expect(error.cause).toBeUndefined()
  })
})

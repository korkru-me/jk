import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { probeLab } from './client.mjs'
import { syntheticConfig, syntheticDiscovery, syntheticExam, syntheticToken } from './fixtures.mjs'

// Real loopback HTTP, but the peer below is a synthetic stub, NOT SEB Server.
const servers = []
async function listen(handler) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${server.address().port}`
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections()
    server.close(resolve)
  })))
})
function send(response, data) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(data))
}

it('uses discovery, form OAuth and exact exam GET over actual loopback HTTP', async () => {
  const calls = []
  const baseUrl = await listen((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      calls.push({ url: request.url, method: request.method, headers: request.headers, body })
      if (request.url === '/exam-api/discovery') send(response, syntheticDiscovery(baseUrl))
      else if (request.url === '/oauth/token') send(response, syntheticToken())
      else if (request.url === '/admin-api/v1/exam/12') send(response, syntheticExam())
      else { response.writeHead(404); response.end() }
    })
  })
  expect((await probeLab({ ...syntheticConfig(), baseUrl })).studentIntegrityVerified).toBe(false)
  expect(calls.map((c) => [c.method, c.url])).toEqual([
    ['GET', '/exam-api/discovery'], ['POST', '/oauth/token'], ['GET', '/admin-api/v1/exam/12'],
  ])
  expect(calls[0].headers.authorization).toBeUndefined()
  expect(calls[1].headers.authorization).toBe(`Basic ${Buffer.from('guiClient:SYNTHETIC-CLIENT-SECRET').toString('base64')}`)
  expect(Object.fromEntries(new URLSearchParams(calls[1].body))).toEqual({
    grant_type: 'password', username: 'synthetic-admin', password: 'SYNTHETIC-PASSWORD', scope: 'read',
  })
  expect(calls[2].headers.authorization).toBe('Bearer SYNTHETIC-ACCESS-TOKEN')
  expect(calls[2].headers['content-type']).toBe('application/x-www-form-urlencoded')
})

it('never follows a credential-bearing token redirect, including another loopback port', async () => {
  let stolenRequests = 0
  const destination = await listen((_request, response) => { stolenRequests++; send(response, syntheticToken()) })
  const baseUrl = await listen((request, response) => {
    if (request.url === '/exam-api/discovery') send(response, syntheticDiscovery(baseUrl))
    else { response.writeHead(307, { Location: `${destination}/capture` }); response.end() }
  })
  await expect(probeLab({ ...syntheticConfig(), baseUrl })).rejects.toThrow('CONNECTION_FAILED')
  expect(stolenRequests).toBe(0)
})

it.each(['headers', 'body'])('times out when the peer stalls during %s', async (stage) => {
  const baseUrl = await listen((_request, response) => {
    if (stage === 'body') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.write('{')
    }
  })
  await expect(probeLab({ ...syntheticConfig(), baseUrl }, { timeoutMs: 100 })).rejects.toThrow('REQUEST_TIMEOUT')
})

// Synthetic wire examples, derived from the pinned upstream controller/model
// contract. NOT captured traffic and NOT evidence of a running SEB Server.
export const syntheticConfig = () => ({
  labOnly: true, baseUrl: 'http://127.0.0.1:18080',
  username: 'synthetic-admin', password: 'SYNTHETIC-PASSWORD', clientSecret: 'SYNTHETIC-CLIENT-SECRET',
  exam: { id: 12, institutionId: 3, startUrl: 'https://example.invalid/lab-a' },
})

export const syntheticDiscovery = (baseUrl = syntheticConfig().baseUrl) => ({
  title: 'Safe Exam Browser Server / Exam API Description',
  'server-location': baseUrl,
  'api-versions': [{ name: 'v1', endpoints: [
    { name: 'access-token-endpoint', location: '/oauth/token', authorization: 'Basic' },
    { name: 'seb-handshake-endpoint', location: '/exam-api/v1/handshake', authorization: 'Bearer' },
    { name: 'seb-configuration-endpoint', location: '/exam-api/v1/examconfig', authorization: 'Bearer' },
    { name: 'seb-ping-endpoint', location: '/exam-api/v1/sebping', authorization: 'Bearer' },
    { name: 'seb-log-endpoint', location: '/exam-api/v1/seblog', authorization: 'Bearer' },
  ] }],
})

export const syntheticToken = () => ({
  access_token: 'SYNTHETIC-ACCESS-TOKEN', refresh_token: 'SYNTHETIC-REFRESH-TOKEN',
  token_type: 'bearer', expires_in: 3600, scope: 'read',
})

export const syntheticExam = () => ({
  id: 12, institutionId: 3, lmsSetupId: null, externalId: 'not-the-start-url',
  name: 'SYNTHETIC EXAM - NEVER OUTPUT', owner: 'SYNTHETIC-OWNER',
  quitPassword: 'SYNTHETIC-QUIT-PASSWORD', browserExamKeys: 'SYNTHETIC-BEK',
  active: true, status: 'RUNNING', additionalAttributes: {
    quiz_start_url: 'https://example.invalid/lab-a',
    SIGNATURE_KEY_CHECK_ENABLED: 'true', NUMERICAL_TRUST_THRESHOLD: '0',
  },
})

export const syntheticConnectionData = () => ({
  cdat: {
    id: 27, institutionId: 3, examId: 12, status: 'ACTIVE',
    securityCheckGranted: true, clientVersionGranted: true,
    connectionToken: 'SYNTHETIC-CONNECTION-TOKEN', examUserSessionId: 'SYNTHETIC-STUDENT-SESSION',
    clientAddress: '192.0.2.1', clientOsName: 'SYNTHETIC-OS', clientVersion: 'SYNTHETIC-VERSION',
    seb_info: 'SYNTHETIC-DEVICE-INFO', ask: 'SYNTHETIC-ASK-NEVER-OUTPUT',
  },
  miss: false, pnot: false, iVal: [], cg: [],
})

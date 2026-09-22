const REQUIRED_TARGETS = ['macos', 'ipados', 'ios', 'windows']
const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'candidateRevision', 'productionRevision', 'revisions'])
const REVISION_FIELDS = new Set([
  'revision',
  'configId',
  'lifecycle',
  'artifactPath',
  'artifactSha256',
  'canonicalStartUrl',
  'supersedes',
  'rollbackRevision',
  'rollbackStrategy',
  'retiredAt',
  'policy',
  'builds',
])
const POLICY_FIELDS = new Set([
  'startUrl',
  'navigationFilters',
  'uploads',
  'quitPassword',
  'adminPassword',
  'distribution',
])
const BUILD_FIELDS = new Set([
  'id',
  'target',
  'runtimePlatform',
  'osVersion',
  'versionString',
  'buildNumber',
  'approval',
])
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,120}$/
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9.+-]{1,40}$/
const PLACEHOLDER = 'record during final UAT'

function hasExactFields(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(field => fields.has(field))
}

function safeId(value) {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value)
}

function safeText(value, maxLength = 100) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && value.length <= maxLength
    && !value.includes('://')
    && !value.includes('@')
}

function validIsoOrNull(value) {
  if (value === null) return true
  if (typeof value !== 'string' || value.length > 40) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function validCanonicalStartUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
      && url.pathname.startsWith('/assignments')
  } catch {
    return false
  }
}

function revisionReleaseReady(revision, candidateArtifactSha256) {
  const policiesReady = Object.values(revision.policy ?? {}).every(value => value === 'approved')
  const buildsReady = Array.isArray(revision.builds)
    && revision.builds.length === REQUIRED_TARGETS.length
    && revision.builds.every(build => build.approval === 'approved'
      && SAFE_METADATA_PATTERN.test(build.versionString)
      && SAFE_METADATA_PATTERN.test(build.buildNumber)
      && build.osVersion !== PLACEHOLDER)
  return revision.lifecycle === 'candidate'
    && policiesReady
    && buildsReady
    && candidateArtifactSha256 === revision.artifactSha256
}

/** Validate only public release metadata. No CK, BEK or password value belongs here. */
export function inspectSebReleaseRegistry(manifest, { candidateArtifactSha256 } = {}) {
  const checks = []
  const revisions = Array.isArray(manifest?.revisions) ? manifest.revisions : []
  checks.push(manifest?.schemaVersion === 1
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 1' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 1' })
  checks.push(hasExactFields(manifest, TOP_LEVEL_FIELDS)
    ? { status: 'pass', field: 'registry schema', message: 'fixed schema ถูกต้อง' }
    : { status: 'blocker', field: 'registry schema', message: 'พบ field ขาด/เกิน schema' })
  checks.push(safeId(manifest?.candidateRevision)
    ? { status: 'pass', field: 'candidate revision', message: 'มี candidate revision แบบไม่เป็นความลับ' }
    : { status: 'blocker', field: 'candidate revision', message: 'candidate revision ไม่ถูกต้อง' })
  checks.push(manifest?.productionRevision === null || safeId(manifest?.productionRevision)
    ? { status: 'pass', field: 'production revision metadata', message: 'รูปแบบ production revision ถูกต้อง' }
    : { status: 'blocker', field: 'production revision metadata', message: 'production revision ไม่ถูกต้อง' })

  const revisionIds = revisions.map(row => row?.revision)
  checks.push(new Set(revisionIds).size === revisionIds.length && revisions.length > 0
    ? { status: 'pass', field: 'revision ids', message: 'revision ไม่ซ้ำ' }
    : { status: 'blocker', field: 'revision ids', message: 'ต้องมี revision และห้ามซ้ำ' })

  for (const revision of revisions) {
    const field = safeId(revision?.revision) ? 'revision schema' : 'invalid revision schema'
    const baseShapeReady = hasExactFields(revision, REVISION_FIELDS)
      && safeId(revision.revision)
      && safeId(revision.configId)
      && ['candidate', 'active', 'retired'].includes(revision.lifecycle)
      && /^\/exam\/[A-Za-z0-9._-]+\.seb$/.test(revision.artifactPath)
      && SHA256_PATTERN.test(revision.artifactSha256)
      && revision.revision === `${revision.configId}-${revision.artifactSha256}`
      && validCanonicalStartUrl(revision.canonicalStartUrl)
      && (revision.supersedes === null || safeId(revision.supersedes))
      && (revision.rollbackRevision === null || safeId(revision.rollbackRevision))
      && revision.rollbackStrategy === 'restore-deployment-and-secrets'
      && validIsoOrNull(revision.retiredAt)
      && hasExactFields(revision.policy, POLICY_FIELDS)
      && Object.values(revision.policy).every(value => value === 'pending' || value === 'approved')
      && Array.isArray(revision.builds)
    checks.push(baseShapeReady
      ? { status: 'pass', field, message: 'revision metadata ครบ' }
      : { status: 'blocker', field, message: 'revision metadata ไม่ครบหรือไม่ canonical' })
    if (!baseShapeReady) continue

    const targets = revision.builds.map(build => build?.target)
    const buildIds = revision.builds.map(build => build?.id)
    let buildsShapeReady = revision.builds.length === REQUIRED_TARGETS.length
      && new Set(targets).size === targets.length
      && new Set(buildIds).size === buildIds.length
      && REQUIRED_TARGETS.every(target => targets.includes(target))
    for (const build of revision.builds) {
      const expectedRuntime = build?.target === 'ipados' || build?.target === 'ios'
        ? 'ios'
        : build?.target
      const approvedMetadata = build?.approval !== 'approved'
        || (build.osVersion !== PLACEHOLDER
          && SAFE_METADATA_PATTERN.test(build.versionString)
          && SAFE_METADATA_PATTERN.test(build.buildNumber))
      buildsShapeReady = buildsShapeReady
        && hasExactFields(build, BUILD_FIELDS)
        && safeId(build.id)
        && safeText(build.osVersion)
        && (SAFE_METADATA_PATTERN.test(build.versionString) || build.versionString === PLACEHOLDER)
        && (SAFE_METADATA_PATTERN.test(build.buildNumber) || build.buildNumber === PLACEHOLDER)
        && build.runtimePlatform === expectedRuntime
        && (build.approval === 'pending' || build.approval === 'approved')
        && approvedMetadata
    }
    checks.push(buildsShapeReady
      ? { status: 'pass', field: 'platform build schema', message: 'มี build metadata ครบทุก target' }
      : { status: 'blocker', field: 'platform build schema', message: 'target/build metadata ขาด ซ้ำ หรือไม่ตรง runtime' })

    if (revision.revision === manifest.candidateRevision) {
      const artifactMatches = candidateArtifactSha256 === revision.artifactSha256
      checks.push(artifactMatches
        ? { status: 'pass', field: 'candidate artifact', message: 'checksum ตรงกับไฟล์ใน repository' }
        : { status: 'blocker', field: 'candidate artifact', message: 'ไฟล์หายหรือ checksum ไม่ตรง revision' })
      checks.push(revisionReleaseReady(revision, candidateArtifactSha256)
        ? { status: 'pass', field: 'candidate release gate', message: 'policy และ build matrix ได้รับอนุมัติครบ' }
        : { status: 'blocker', field: 'candidate release gate', message: 'ยังมี policy/build/ไฟล์ที่ไม่ได้ยืนยัน' })
    }
  }

  const candidate = revisions.find(row => row?.revision === manifest?.candidateRevision)
  checks.push(candidate?.lifecycle === 'candidate'
    ? { status: 'pass', field: 'candidate linkage', message: 'candidate revision ชี้รายการ candidate เดียวกัน' }
    : { status: 'blocker', field: 'candidate linkage', message: 'candidate revision ไม่พบหรือ lifecycle ไม่ตรง' })
  const production = manifest?.productionRevision === null
    ? null
    : revisions.find(row => row?.revision === manifest.productionRevision)
  checks.push(manifest?.productionRevision === null || production?.lifecycle === 'active'
    ? { status: 'pass', field: 'production linkage', message: 'production revision linkage ถูกต้อง' }
    : { status: 'blocker', field: 'production linkage', message: 'production revision ต้องชี้รายการ active' })

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatSebReleaseRegistryReport(checks) {
  const lines = [
    'SEB release registry (fixed schema, no secrets)',
    '',
    ...checks.map(check => `[${check.status === 'pass' ? 'PASS' : 'BLOCKER'}] ${check.field}: ${check.message}`),
  ]
  const blockers = checks.filter(check => check.status === 'blocker').length
  lines.push('', blockers === 0
    ? 'READY: candidate config revision and supported builds are approved.'
    : `NOT READY: ${blockers} registry blocker(s).`)
  return lines.join('\n')
}

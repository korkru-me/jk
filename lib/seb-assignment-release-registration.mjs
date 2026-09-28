import { createHash } from 'node:crypto'

/**
 * Shared service-role I/O for the application boundary and the local operator
 * command. Validation and authorization happen before this function; the
 * database RPC repeats assignment/revision/tenant/attempt checks atomically.
 *
 * Keeping the Storage download + byte verification here prevents the operator
 * command from drifting into a weaker registration path.
 */
export async function verifyStoredAssignmentSebArtifactAndRegister(admin, input) {
  const { data: artifact, error: artifactError } = await admin.storage
    .from('assignment-seb-configs')
    .download(input.artifactPath)
  if (artifactError || !artifact) {
    return { code: 'artifact_missing', data: null, error: null }
  }

  const bytes = Buffer.from(await artifact.arrayBuffer())
  if (
    bytes.length !== input.artifactSizeBytes
    || createHash('sha256').update(bytes).digest('hex') !== input.artifactSha256
  ) {
    return { code: 'artifact_mismatch', data: null, error: null }
  }

  const response = await admin.rpc('register_assignment_seb_config_release', {
    p_assignment_id: input.assignmentId,
    p_revision: input.revision,
    p_artifact_storage_path: input.artifactPath,
    p_artifact_sha256: input.artifactSha256,
    p_artifact_size_bytes: input.artifactSizeBytes,
    p_config_key: input.configKey,
    p_browser_exam_keys: input.browserExamKeys,
    p_security_mode: input.securityMode,
  })

  return { ...response, code: response.error ? 'persistence_failed' : 'ok' }
}

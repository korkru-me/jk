type ReadResult<T> = { data: T | null; error?: unknown }

/** Only the unreleased SEB revision column may use the legacy projection.
 * Permission, network and other schema errors remain failures. Callers must
 * reject SEB-required access when revisionColumnAvailable is false. */
export async function readWithSubmissionRevision<T>(
  read: (includeRevision: boolean) => PromiseLike<ReadResult<unknown>>,
): Promise<ReadResult<T> & { revisionColumnAvailable: boolean }> {
  const result = await read(true)
  const error = result.error as { code?: unknown; message?: unknown } | null | undefined
  if (error?.code !== '42703' || typeof error.message !== 'string'
    || !/\bseb_config_revision\b.*does not exist/i.test(error.message)) {
    return { ...result, data: result.data as T | null, revisionColumnAvailable: true }
  }
  const legacy = await read(false)
  return { ...legacy, data: legacy.data as T | null, revisionColumnAvailable: false }
}

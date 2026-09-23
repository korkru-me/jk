export function shouldOfferSebExit(input: {
  isOwnSubmission: boolean
  secureBrowserMode: string | null | undefined
  secureBrowserVerifiedAt: string | null | undefined
}): boolean {
  return input.isOwnSubmission
    && input.secureBrowserMode === 'seb_required'
    && typeof input.secureBrowserVerifiedAt === 'string'
    && input.secureBrowserVerifiedAt.length > 0
}

/**
 * Shared API-version grammar for both native verification and signed-session
 * reads. Parsing is metadata validation, never authorization: the caller must
 * still verify both URL-bound key hashes before issuing a signed session.
 *
 * @param {unknown} value
 * @returns {{platform: 'windows' | 'macos' | 'ios', version: string, versionString: string, buildNumber: string} | null}
 */
export function parseSebVersionCore(value) {
  if (
    typeof value !== 'string'
    || value.length < 5
    || value.length > 240
    || /[\u0000-\u001f\u007f]/.test(value)
  ) return null

  const match = value.match(/_(Windows|macOS|iOS)_([A-Za-z0-9.+-]+)_([A-Za-z0-9.+-]+)_[^\s]+$/)
  if (!match) {
    // Windows 3.10.2 injects its four-part file version. The alternate
    // grammar is Windows-only and full-string anchored.
    const windowsMatch = value.match(/^SEB_Windows_(\d+\.\d+\.\d+)\.(\d+)$/)
    if (!windowsMatch) return null
    return {
      platform: 'windows',
      version: value,
      versionString: windowsMatch[1],
      buildNumber: windowsMatch[2],
    }
  }

  return {
    platform: match[1] === 'Windows' ? 'windows' : match[1] === 'macOS' ? 'macos' : 'ios',
    version: value,
    versionString: match[2],
    buildNumber: match[3],
  }
}

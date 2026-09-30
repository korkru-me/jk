export const SEB_QUIT_PASSWORD_MIN_LENGTH = 6
export const SEB_QUIT_PASSWORD_MAX_LENGTH = 64

const PRINTABLE_ASCII_PATTERN = /^[\x21-\x7e]+$/

/**
 * A quit password is a classroom escape control, not a student login secret.
 * Keep it memorable enough for an invigilator to type on a locked-down device,
 * while rejecting very short values, whitespace and cross-platform-ambiguous
 * characters.
 */
export function isValidSebQuitPassword(password: string): boolean {
  return (
    typeof password === 'string'
    && password.length >= SEB_QUIT_PASSWORD_MIN_LENGTH
    && password.length <= SEB_QUIT_PASSWORD_MAX_LENGTH
    && PRINTABLE_ASCII_PATTERN.test(password)
  )
}

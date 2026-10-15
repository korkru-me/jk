/** Shared draft-presence rule for exam, exercise and personal-practice navigation. */
export function hasStudentAnswer(raw: string | null | undefined): boolean {
  const value = raw?.trim() ?? ''
  if (!value) return false
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) && parsed.some(entry => typeof entry === 'string' ? entry.trim() !== '' : entry != null)
    } catch { return false }
  }
  return true
}

export const PROFILE_READ_FAILED_MESSAGE = 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองใหม่'
export const AUTH_UNAVAILABLE_MESSAGE = 'ระบบยืนยันตัวตนไม่พร้อมชั่วคราว กรุณาลองใหม่'

/**
 * A profile may be auto-created only after the database confirms that no row
 * exists. Timeouts, 5xx and permission errors also return null data, so
 * treating them as "missing" inserts duplicates and signs healthy users out.
 */
export function isProfileRowMissing(error: { code?: string } | null | undefined): boolean {
  return !error || error.code === 'PGRST116'
}

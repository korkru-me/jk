export type RecoveryFailure = 'browser_required' | 'link_expired' | 'verification_failed'

/** Display hints only. These values never authorize a password change. */
export function recoveryFailure(value: unknown): RecoveryFailure | undefined {
  return value === 'browser_required' || value === 'link_expired' || value === 'verification_failed'
    ? value
    : undefined
}

export function recoveryFailureFromCode(code: string | undefined | null): RecoveryFailure {
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found') return 'link_expired'
  if (code === 'pkce_code_verifier_not_found' || code === 'bad_code_verifier') return 'browser_required'
  return 'verification_failed'
}

export const recoveryFeedback = {
  browser_required: {
    title: 'เปิดลิงก์ในเบราว์เซอร์เดิมที่ขอลิงก์',
    description: 'ไม่พบข้อมูลยืนยันคำขอในเบราว์เซอร์นี้ กรุณาเปิดลิงก์จากอีเมลในเบราว์เซอร์และอุปกรณ์เดิมที่ใช้ขอลิงก์',
    help: 'หากใช้เบราว์เซอร์เดิมอยู่แล้ว ให้ขอลิงก์ใหม่และเปิดอีเมลฉบับล่าสุด',
  },
  link_expired: {
    title: 'ลิงก์นี้หมดอายุหรือถูกใช้แล้ว',
    description: 'ขอลิงก์ใหม่ แล้วเปิดอีเมลฉบับล่าสุดในเบราว์เซอร์และอุปกรณ์เดิมที่ใช้ขอลิงก์',
    help: undefined,
  },
  verification_failed: {
    title: 'ยังยืนยันลิงก์ตั้งรหัสผ่านไม่ได้',
    description: 'กรุณาลองอีกครั้ง หรือขอลิงก์ใหม่แล้วเปิดอีเมลฉบับล่าสุดในเบราว์เซอร์เดิมที่ใช้ขอลิงก์',
    help: undefined,
  },
} satisfies Record<RecoveryFailure, { title: string; description: string; help: string | undefined }>

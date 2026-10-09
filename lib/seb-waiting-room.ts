/** Question-free projection only. Callers must authenticate and authorize the
 * exact assignment/release first. This module never creates an attempt. */
export type SebWaitingPhase = 'unavailable' | 'not_open' | 'closed' | 'ready' | 'active' | 'submitted'

export interface SebWaitingFacts {
  title: string
  durationMinutes: number | null
  published: boolean
  authorized: boolean
  releaseReady: boolean
  verified: boolean
  opensAt: string | null
  closesAt: string | null
  attempt: null | {
    id: string
    status: 'in_progress' | 'submitted' | 'graded'
    startedAt: string
  }
  canCreateAttempt: boolean
  receiptAvailable?: boolean
  now?: number
}

export interface SebWaitingView {
  title: string
  durationMinutes: number | null
  phase: SebWaitingPhase
  verified: boolean
  canStart: boolean
  canResume: boolean
  needsFinalization: boolean
  hasReceipt: boolean
  message: string
  opensAt: string | null
  closesAt: string | null
}

export function projectSebWaitingRoom(facts: SebWaitingFacts): SebWaitingView {
  const now = facts.now ?? Date.now()
  const base: SebWaitingView = {
    title: facts.title,
    durationMinutes: facts.durationMinutes,
    phase: 'unavailable',
    verified: facts.verified,
    canStart: false,
    canResume: false,
    needsFinalization: false,
    hasReceipt: false,
    message: 'ข้อสอบยังไม่พร้อม กรุณาแจ้งครูผู้คุมสอบ',
    opensAt: facts.opensAt,
    closesAt: facts.closesAt,
  }
  const opens = facts.opensAt === null ? null : Date.parse(facts.opensAt)
  const closes = facts.closesAt === null ? null : Date.parse(facts.closesAt)
  if (!Number.isFinite(now)
    || (facts.durationMinutes !== null && (!Number.isFinite(facts.durationMinutes) || facts.durationMinutes <= 0))
    || (opens !== null && !Number.isFinite(opens))
    || (closes !== null && !Number.isFinite(closes))
    || !facts.published || !facts.authorized || !facts.releaseReady) return base
  if (facts.attempt?.status === 'submitted' || facts.attempt?.status === 'graded') {
    base.hasReceipt = facts.receiptAvailable !== false
    if (!facts.canCreateAttempt || (closes !== null && now >= closes)) {
      return { ...base, phase: 'submitted', message: 'รอบสอบนี้ส่งสำเร็จแล้ว' }
    }
  }
  if (facts.attempt?.status === 'in_progress') {
    const startedAt = Date.parse(facts.attempt.startedAt)
    if (!Number.isFinite(startedAt)) return base
    const durationExpired = facts.durationMinutes !== null
      && now >= startedAt + facts.durationMinutes * 60_000
    const needsFinalization = durationExpired || (closes !== null && now >= closes)
    return {
      ...base, phase: 'active', needsFinalization,
      canResume: facts.verified,
      message: needsFinalization
        ? 'หมดเวลาทำข้อสอบแล้ว กดกลับเข้าสอบเพื่อให้ระบบยืนยันการส่ง'
        : 'คุณเริ่มรอบสอบนี้แล้ว เวลายังคงเดินต่อ กดกลับเข้าสอบเพื่อทำรอบเดิม',
    }
  }
  if (opens !== null && now < opens) {
    return { ...base, phase: 'not_open', message: 'ยังไม่ถึงเวลาเปิดสอบ' }
  }
  if (closes !== null && now >= closes) {
    return { ...base, phase: 'closed', message: 'ปิดรับการเริ่มสอบแล้ว กรุณาแจ้งครูผู้คุมสอบ' }
  }
  if (!facts.canCreateAttempt) return { ...base, message: 'คุณทำครบจำนวนครั้งหรือผ่านเงื่อนไขข้อสอบแล้ว' }
  return {
    ...base, phase: 'ready', canStart: facts.verified,
    message: facts.verified
      ? facts.attempt ? 'รอบก่อนส่งแล้ว ครูอนุญาตให้เริ่มรอบใหม่ได้ เวลาเริ่มเมื่อกดเข้าห้องสอบเท่านั้น' : 'เครื่องผ่านการตรวจแล้ว เวลาเริ่มเมื่อกดเข้าห้องสอบเท่านั้น'
      : 'ตรวจเครื่อง SEB ก่อนเข้าห้องสอบ การตรวจไม่เริ่มเวลาและไม่เปิดโจทย์',
  }
}

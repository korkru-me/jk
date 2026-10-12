import { AssignmentSettingHoverLabel } from '@/components/assignments/assignment-setting-hover-label'

export const INSTANT_CHECK_SETTING_LABEL = 'ให้นักเรียนกดตรวจคำตอบได้ทีละข้อ'
export const INSTANT_CHECK_SETTING_DESCRIPTION =
  'เมื่อเปิดใช้งาน นักเรียนจะทราบผลว่าตอบถูกหรือผิดทันทีหลังจากกดตรวจคำตอบในแต่ละข้อ หากไม่เปิดใช้งาน นักเรียนจะทราบผลเมื่อทำครบทุกข้อและส่งแบบฝึกหัดแล้ว'
export const INSTANT_CHECK_ANSWER_KEY_SETTING_LABEL = 'แสดงเฉลยหลังจากกดตรวจคำตอบ'
export const INSTANT_CHECK_ANSWER_KEY_SETTING_DESCRIPTION =
  'เมื่อเปิดใช้งาน นักเรียนจะเห็นคำตอบที่ถูกต้องหลังจากกดตรวจคำตอบในแต่ละข้อ หากไม่เปิดใช้งาน ระบบจะแจ้งเฉพาะผลการตรวจว่าคำตอบถูกหรือไม่ โดยไม่แสดงคำตอบที่ถูกต้อง'

export function InstantCheckSettingLabel() {
  return (
    <AssignmentSettingHoverLabel
      label={INSTANT_CHECK_SETTING_LABEL}
      description={INSTANT_CHECK_SETTING_DESCRIPTION}
    />
  )
}

export function InstantCheckAnswerKeySettingLabel() {
  return (
    <AssignmentSettingHoverLabel
      label={INSTANT_CHECK_ANSWER_KEY_SETTING_LABEL}
      description={INSTANT_CHECK_ANSWER_KEY_SETTING_DESCRIPTION}
    />
  )
}

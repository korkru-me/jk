import { AssignmentSettingHoverLabel } from '@/components/assignments/assignment-setting-hover-label'

export const INSTANT_CHECK_SETTING_LABEL = 'ให้นักเรียนกดตรวจคำตอบได้ทีละข้อ'
export const INSTANT_CHECK_SETTING_DESCRIPTION =
  'เมื่อเปิดใช้งาน นักเรียนจะทราบผลว่าตอบถูกหรือผิดทันทีหลังจากกดตรวจคำตอบในแต่ละข้อ หากไม่เปิดใช้งาน นักเรียนจะทราบผลเมื่อทำครบทุกข้อและส่งแบบฝึกหัดแล้ว'

export function InstantCheckSettingLabel() {
  return (
    <AssignmentSettingHoverLabel
      label={INSTANT_CHECK_SETTING_LABEL}
      description={INSTANT_CHECK_SETTING_DESCRIPTION}
    />
  )
}

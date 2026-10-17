import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document'
import { LEGAL_LINKS, OPERATOR_NAME, SUPPORT_EMAIL, SUPPORT_EMAIL_URL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'ติดต่อผู้ดูแล | KorKru',
  description: 'ช่องทางติดต่อผู้ดูแล KorKru สำหรับปัญหาบัญชี การใช้งาน และข้อมูลส่วนบุคคล',
}

const sections: LegalSection[] = [
  {
    id: 'support',
    title: 'ติดต่อผู้ดูแล',
    content: <>
      <p>{OPERATOR_NAME}</p>
      <p>อีเมล: <a href={SUPPORT_EMAIL_URL}>{SUPPORT_EMAIL}</a></p>
      <p>ใช้ช่องทางนี้สำหรับปัญหาการสมัคร เข้าสู่ระบบ การใช้งานเว็บไซต์ หรือสอบถามการจัดการข้อมูลของคุณและนักเรียนที่คุณดูแล</p>
    </>,
  },
  {
    id: 'report',
    title: 'แจ้งปัญหาการใช้งาน',
    content: <>
      <p>ระบุอีเมลที่ใช้กับบัญชี หน้าที่พบปัญหา เวลาโดยประมาณ และขั้นตอนที่ทำก่อนเกิดปัญหา หากแนบภาพหน้าจอ ให้ปิดข้อมูลส่วนตัวและข้อมูลของนักเรียนที่ไม่จำเป็นก่อนส่ง</p>
      <p>อย่าส่งรหัสผ่าน รหัส OTP ลิงก์ยืนยันบัญชี ลิงก์ตั้งรหัสผ่านใหม่ หรือข้อมูลเข้าสู่ระบบอื่น ผู้ดูแลไม่จำเป็นต้องใช้ข้อมูลเหล่านี้เพื่อรับแจ้งปัญหา</p>
      <p>คำถามเกี่ยวกับกำหนดส่ง กติกางาน และคะแนน ควรติดต่อครูผู้มอบหมายงานนั้นโดยตรง</p>
    </>,
  },
  {
    id: 'data-request',
    title: 'คำขอเกี่ยวกับบัญชีและข้อมูล',
    content: <>
      <p>หากต้องการขอเข้าถึง แก้ไข หรือลบข้อมูล ให้แจ้งประเภทคำขอและขอบเขตข้อมูลที่เกี่ยวข้องผ่านอีเมลข้างต้น ผู้ดูแลจะตรวจสอบตัวตนและความเกี่ยวข้องกับข้อมูลก่อนดำเนินการ</p>
      <p>นักเรียนขอให้ผู้ปกครองหรือครูช่วยติดต่อได้ อ่านรายละเอียดที่ <Link href={`${LEGAL_LINKS.privacy}#rights`}>คำขอเกี่ยวกับข้อมูลส่วนบุคคล</Link> และ <Link href={LEGAL_LINKS.terms}>เงื่อนไขการให้บริการ</Link></p>
    </>,
  },
]

export default function ContactPage() {
  return <LegalDocument title="ติดต่อผู้ดูแล" description="ช่องทางช่วยเหลือเรื่องบัญชี การใช้งาน และข้อมูลส่วนบุคคลของ KorKru / ก่อครู" sections={sections} />
}

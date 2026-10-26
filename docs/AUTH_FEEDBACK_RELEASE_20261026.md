# Signup feedback และการซิงก์ Auth — 26 ตุลาคม 2026

เจ้าของอนุมัติปล่อยแพตช์ signup/check-email ที่อยู่บน Staging, ซิงก์ Auth/dependency ไป actual localhost:3000 และปรับเอกสารเก่าให้ตรงงานที่เสร็จแล้ว คง Google/provider/account-linking/Confirm email และ Word ตารางจำแนกไว้พัฒนาต่อตามคำสั่ง ไม่เปลี่ยน SMTP/template/provider/flags/schema/migration หรือส่งอีเมลจริงจาก release นี้

## Source และขอบเขต

Production base `f45fae1c6291327a50195c047f472cf592771e1f` รับเฉพาะ application/test ของ `30886db`: `app/check-email/page.tsx`, shared account fields, signup/check-email forms, verified-session status action และชุดทดสอบ ไม่ส่ง Staging ทั้ง branch ขึ้น Production จึงคง SEB/งาน Staging อื่นและ reset-page branding ที่อยู่นอก scope ไว้

Status action ใช้ verified `getUser`, คืนอีเมลเฉพาะ session ที่ยืนยันแล้วและตรง expected email ที่ตรวจรูปแบบแล้ว ไม่ lookup บัญชีคนอื่นจากข้อมูลฟอร์ม Signup แสดงสรุปข้อผิดพลาด/focus ช่องแรก และ Google validation ยังใช้เฉพาะ role/acknowledgement Check-email อัปเดตเมื่อหน้า visible/focus/pageshow และใช้ absolute deadline สำหรับ cooldown

Guarded `/exam-screen-lab/signup-feedback` แสดง confirmed state ด้วยอีเมลสังเคราะห์ ไม่มีฟอร์มส่งอีเมลใน state นี้ ใช้ตรวจ Staging/actual localhost และต้อง 404 ใน Production

## เอกสารปัจจุบัน

นำ SMTP record/parity manifest และ recovery template artifacts จาก pushed `b690e70` และ Resend Production record จาก pushed `c458f4a` มาเก็บใน release ปัจจุบัน ปรับ setup/rollout/feature/architecture ให้เลิกอ้าง candidate ว่ายังไม่ deploy โดยคงหลักฐาน checkpoint เดิมเป็นประวัติ ไม่อ้าง independent login แทนผลที่เจ้าของรายงาน

## Checks และ deployment

กำลังตรวจ candidate/Staging ก่อนเผยแพร่ ต้องบันทึก Ready SHA, canonical domain, public lab isolation และ actual primary parity หลังปล่อย

## Primary sync

Primary `/Users/korkusonmasaen/Korkru/korkru` มีงานห้องเรียนใหม่ `5ed71fe` และ `058ce70` กับงาน dirty เดิม ต้องรักษาไว้ ซิงก์เฉพาะ Auth dependency closure และเอกสารที่อนุมัติ ไม่ reset/stash/merge master ทั้งชุดหรือคัดลอก secrets และไม่ถือว่า app ทั้งเว็บเท่ากับ Production หากยังมีงานร่วมที่ตั้งใจเก็บไว้

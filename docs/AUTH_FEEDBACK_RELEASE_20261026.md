# Signup feedback และการซิงก์ Auth — 26 ตุลาคม 2026

เจ้าของอนุมัติปล่อยแพตช์ signup/check-email ที่อยู่บน Staging, ซิงก์ Auth/dependency ไป actual localhost:3000 และปรับเอกสารเก่าให้ตรงงานที่เสร็จแล้ว คง Google/provider/account-linking/Confirm email และ Word ตารางจำแนกไว้พัฒนาต่อตามคำสั่ง ไม่เปลี่ยน SMTP/template/provider/flags/schema/migration หรือส่งอีเมลจริงจาก release นี้

## Source และขอบเขต

Production base `f45fae1c6291327a50195c047f472cf592771e1f` รับเฉพาะ application/test ของ `30886db`: `app/check-email/page.tsx`, shared account fields, signup/check-email forms, verified-session status action และชุดทดสอบ ไม่ส่ง Staging ทั้ง branch ขึ้น Production จึงคง SEB/งาน Staging อื่นและ reset-page branding ที่อยู่นอก scope ไว้

Status action ใช้ verified `getUser`, คืนอีเมลเฉพาะ session ที่ยืนยันแล้วและตรง expected email ที่ตรวจรูปแบบแล้ว ไม่ lookup บัญชีคนอื่นจากข้อมูลฟอร์ม Signup แสดงสรุปข้อผิดพลาด/focus ช่องแรก และ Google validation ยังใช้เฉพาะ role/acknowledgement Check-email อัปเดตเมื่อหน้า visible/focus/pageshow และใช้ absolute deadline สำหรับ cooldown

Guarded `/exam-screen-lab/signup-feedback` แสดง confirmed state ด้วยอีเมลสังเคราะห์ ไม่มีฟอร์มส่งอีเมลใน state นี้ ใช้ตรวจ Staging/actual localhost และต้อง 404 ใน Production

## เอกสารปัจจุบัน

นำ SMTP record/parity manifest และ recovery template artifacts จาก pushed `b690e70` และ Resend Production record จาก pushed `c458f4a` มาเก็บใน release ปัจจุบัน ปรับ setup/rollout/feature/architecture ให้เลิกอ้าง candidate ว่ายังไม่ deploy โดยคงหลักฐาน checkpoint เดิมเป็นประวัติ ไม่อ้าง independent login แทนผลที่เจ้าของรายงาน

## Checks และ deployment

Candidate ผ่าน Vitest 329 files / 4,758 tests, TypeScript, semantic-token lint และ production Webpack build การ build ครั้งแรกถูก sandbox บล็อก Google Fonts; รันใหม่โดยอนุญาต network แล้วผ่าน ไม่เปลี่ยน font/config เพื่อหลบปัญหา

Staging PR #88 merge `42109587d32997d578cf08f9ed155589724953b9` เป็น READY ที่ `dpl_ApRrPJfd76dBXK8g9MBtiCSM9DS1` และ canonical `staging.korkru.com` ตรวจ badge ก่อนทดสอบ Signup ว่างแสดงข้อผิดพลาดครบ/focus role แรก, สลับ Google validation เหลือเฉพาะ role/acknowledgement, mobile 390px ไม่ล้น, invalid-link notice แสดงถูก และ confirmed fixture ไม่มี resend form ไม่สร้างบัญชี/ยอมรับข้อตกลงแทนเจ้าของ/ส่งอีเมลจริง

Production release ใช้ [PR #89](https://github.com/korkru-me/jk/pull/89) เท่านั้น บันทึก exact Ready/deployment/local parity หลัง merge เป็น handoff ใน branch เดียวกันและผลท้าย PR โดยไม่เปิด flags หรือ replay migration

## Primary sync

Primary `/Users/korkusonmasaen/Korkru/korkru` มีงานห้องเรียนใหม่ `5ed71fe` และ `058ce70` กับงาน dirty เดิมที่รักษาไว้ ซิงก์ Auth dependency closure 101 paths (เปลี่ยนจริง 48 paths รวม helper/tests, settings ของครู/นักเรียน, legal routes/components, metadata `jose@6.2.2` และ migration source ที่ Production apply ไปแล้ว) และเอกสาร 14 paths โดย merge เฉพาะส่วนสถานะ Auth ในเอกสารที่มีงานร่วม ไม่ apply SQL ไม่ reset/stash/merge master ทั้งชุดหรือคัดลอก secrets

Primary full suite 331 files / 4,772 tests, TypeScript และ token lint ผ่าน Production build ของ actual primary snapshot แยกผ่านโดยไม่แตะ running `.next` การตรวจ hashes พบไฟล์เดิมนอกขอบเขต Auth/docs ที่อนุมัติเปลี่ยน 0 รายการ ไม่ถือว่า app ทั้งเว็บเท่ากับ Production เพราะยังมีงานห้องเรียนร่วมที่ตั้งใจเก็บไว้

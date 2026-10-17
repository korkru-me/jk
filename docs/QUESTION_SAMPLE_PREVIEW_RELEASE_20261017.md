# ปล่อยแพตช์ตัวอย่างโจทย์ — 17 ตุลาคม 2026

เจ้าของอนุมัติให้ทดสอบ Staging แล้ว merge PR #58 และ deploy Production เมื่อผ่าน งานนี้ไม่มี migration, Auth/config change หรือข้อมูลโจทย์/คะแนนที่ต้องย้าย

## Source ที่ตรวจ

- PR: https://github.com/korkru-me/jk/pull/58
- แพตช์ runtime: `a1f36d90d728ce679adb7f514af38b946f8a97ed`
- Staging integration: `77ea0127139cf0824c39f997a6e7f35c85f6276a` บน branch `staging`
- Staging deployment `dpl_CdFVF3vLuMvNauSsxFEAUHPod6tK` เป็น Ready และ alias `https://staging.korkru.com` แสดง source revision ตรงกัน ป้าย `STAGING · ระบบทดสอบ` มองเห็นก่อนทดสอบ
- ไฟล์ runtime ของแพตช์ตรงกันระหว่าง PR กับ Staging; ความต่างประวัติ SEB/QA เดิมของ Staging ไม่รวมกลับเข้า Production

## ขอบเขตการตรวจ

ใช้ `/exam-screen-lab/question-samples` ที่ import หน้าเลือกประเภทและตัวอย่างชุดเดียวกับ `/questions/new` ไม่สร้างบัญชี/โจทย์/attempt หรือเรียกฐานข้อมูล เปิดครบ 11 ประเภทพร้อมช่องตอบจริง ตัวเลขตรวจถูกทั้งสองช่องและหน้าครูแสดง 2/2 โดย evaluator เป็นไฟล์เพิ่มสองก้อนตอนเปิดโจทย์ตัวเลข ชนิดอื่นเปิดได้ก่อนโหลด evaluator

ตรวจ failure/retry โดยบล็อกไฟล์ mathjs ของ hosted build ใน browser เท่านั้น ไม่แก้ไฟล์บนเซิร์ฟเวอร์ และตรวจจอ 390px/1440px ไม่มี horizontal overflow ผลตรวจนี้ไม่ครอบคลุม authenticated app shell, การบันทึกโจทย์, uploads, SMTP หรือการส่งงานจริง ซึ่งไม่ได้เปลี่ยนในแพตช์นี้

Local checks ของแพตช์: TypeScript/token lint/production Turbopack build ผ่าน และ Vitest 287 files / 3,659 cases ผ่าน รวม regression ที่ห้าม scoring metadata import mathjs

## วิธีปล่อยและกู้คืน

Production ใช้ Git integration ของ Vercel project `jk` เมื่อ PR #58 merge เข้า `master` ต้องตรวจ deployment Ready, SHA ของ merge และ alias จริงก่อนรายงานเสร็จ ตรวจเว็บจริงแบบอ่านอย่างเดียวโดยไม่สร้างข้อมูล และยืนยัน lab ไม่เปิดใน Production

จุดกู้คืนก่อนปล่อย: Production `3230edfcfd35a17670af6064d4f94f005e0de0fe`, deployment `dpl_5GZHMrNuCekqXk49LPd9gcCf4jwR` (Ready) ไม่มี schema ที่ต้อง rollback

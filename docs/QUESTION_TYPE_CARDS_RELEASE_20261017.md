# ปล่อยกรอบเลือกประเภทโจทย์ — 17 ตุลาคม 2026

เจ้าของอนุมัติให้สร้าง PR ทดสอบ Staging แล้ว merge/deploy Production เมื่อผ่าน งานนี้เปลี่ยน UI สามไฟล์และเอกสาร ไม่มี migration, auth/config, รูปแบบโจทย์/Word, scoring หรือข้อมูลที่ต้องย้าย

## Source และผลตรวจ Staging

- PR: https://github.com/korkru-me/jk/pull/59
- Runtime source: `01c28c7bbe464c97e85e21f89a3105837cf911c8`
- Staging integration: `3e9e4c2fd4df8d64b90072b7b13eeea9cdd250ad`
- Deployment: `dpl_C7z7XVAwa3SQuqYFC7mXMxryUqpz`, Ready, alias `https://staging.korkru.com`
- ตรวจ source revision บนหน้าและป้าย `STAGING · ระบบทดสอบ` ก่อน QA ไฟล์ `page.tsx`, `sample-preview.tsx`, `question-types.module.css` ตรงกับ PR ทุกไฟล์ ใช้สิทธิ์ Vercel เดิมและ OIDC ชั่วคราว ไม่เปลี่ยน Deployment Protection

ตรวจ `/exam-screen-lab/question-samples` ซึ่ง import หน้าเลือกประเภทและตัวอย่างชุดเดียวกับ `/questions/new` โดยไม่ใช้ Auth/ฐานข้อมูล ไม่มีการสร้างบัญชี โจทย์ หรือ attempt:

- เปิดตัวอย่างครบ 11 ประเภท ไม่มีหน้ารอค้างหรือโหลดล้มเหลว ตัวเลขตอบถูกทั้งสองช่องและมุมมองครูได้ 2/2
- 320/390/768/1440px ไม่มี horizontal overflow ชื่อไม่ล้น ปุ่ม “ดูตัวอย่างโจทย์” ไม่เบียด “สร้างโจทย์” พื้นที่กดทั้งสองคำสั่งอย่างน้อย 44px ไอคอนพื้นหลัง 32px อยู่ครบในหัวสี
- การ์ดสูง 113.5px ที่ 390/768/1440px และ 113.5–133px ที่ 320px ตามการตัดบรรทัด หัวสีอ่อนกับส่วนล่างพื้น card แยกกัน
- Light/dark, focus ring ของลิงก์สร้าง และคีย์บอร์ดเปิด/ปิดตัวอย่างผ่าน จอมือถือเปิด/ปิดจับคู่ได้ ไม่พบ browser runtime error
- Local TypeScript, token lint, production build ผ่าน; independent read-only review ไม่พบ release blocker ไม่รัน unit suite ซ้ำเพราะไม่มีการเปลี่ยน lib/logic ตัวอย่างหรือคะแนน

ไม่ครอบคลุม authenticated app shell, การบันทึกโจทย์, uploads หรือการส่งงาน ซึ่งไม่ได้เปลี่ยนในแพตช์นี้ ไม่มีการเขียน Production data เพื่อทดสอบ

## Production และการกู้คืน

PR #59 merge เข้า `master` แล้วที่ `397183493460a22c7ee430ce63b081810a403e38` โดยไม่รวมประวัติ Staging-only กลับเข้า Production ไฟล์ runtime ตรงกับ PR ที่ผ่าน Staging Vercel project `jk` deploy จาก `master` อัตโนมัติ

Production deployment `dpl_FEQrrznNtrhvYXXNPhrEZmEFvhXK` เป็น Ready และ source SHA ตรงกับ merge มี canonical aliases `www.korkru.com` และ `korkru.com` ตรวจเว็บจริงแบบอ่านอย่างเดียวหลังเจ้าของอนุมัติ deploy: `/login` 200 พร้อม tier production และไม่มีป้าย Staging, `/questions/new` 307 ไป `/login` เมื่อไม่มี session, `/exam-screen-lab/question-samples` 404 ไม่มีการสร้างหรือแก้ข้อมูล Production

จุดกู้คืนก่อนปล่อย: commit `83c2e4cfcbbc42409bec67c86e60f1b1eed480b4`, deployment `dpl_7hgfeZUd7eNPL9pbeKtdUoNMepaH` (Ready) ไม่มี schema ให้ rollback

บันทึกผลหลัง deploy นี้เป็นเอกสารบน branch `codex/question-type-card-design` ที่ push แล้ว แยกจาก merge commit ของ UI เพื่อไม่สร้าง deployment ใหม่จากการบันทึกสถานะ

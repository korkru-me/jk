# ปล่อยกรอบเลือกวิธีนำเข้าโจทย์ — 18 ตุลาคม 2026

เจ้าของอนุมัติให้สร้าง PR ทดสอบ Staging แล้ว merge/deploy Production เมื่อผ่าน งานนี้เปลี่ยนเฉพาะ UI สามไฟล์, fixture ที่ปิดบน Production และเอกสาร ไม่มี parser, import callback/batching, Auth, schema, scoring, configuration หรือ migration เปลี่ยน

## Source และ Staging

- PR: https://github.com/korkru-me/jk/pull/60
- Runtime source: `857d9a7979fae76034693229805e08a5b50509bb`
- Staging integration: `b142331796d094122d09efa69146a2a3d631a8b9`
- Staging deployment: `dpl_AtuWCXvr6K7YfBBZkidLczfAXCzg`
- ไฟล์ `page.tsx`, `import-choice.tsx`, `import-choice.module.css` และ lab fixture ตรงกับ PR ทั้งสี่ไฟล์ รักษางาน Auth ที่มีอยู่บน Staging ไว้ แต่ไม่นำประวัติ Staging-only กลับเข้า Production

Staging เป็น Ready พร้อม alias `https://staging.korkru.com` และ source revision ตรงกับ integration commit ตรวจป้าย `STAGING · ระบบทดสอบ` ก่อน QA ใช้สิทธิ์ Vercel เดิมกับ OIDC ชั่วคราวโดยไม่เปลี่ยน Deployment Protection

Hosted QA ผ่าน:

- 320/390/768/1440px ไม่มี overflow ชื่อและไอคอนไม่ถูกตัด กรอบสูง 113.5px ทั้งคู่ ไอคอน 32px และคำสั่งสูงอย่างน้อย 44px
- container 500px บน viewport 1440px เรียงหนึ่งคอลัมน์ถูกต้อง พื้นหัวสีกับส่วนล่าง card แยกกัน
- Word URL คง `/questions/import/word?back=%2Fquestions%2Fimport`
- กดค้าง/ปล่อยบนหัว คำอธิบาย และ footer ของ KorKru รวม Enter/Space เรียก file input ได้รวม 5 ครั้ง โดยดัก click ไม่ให้เลือกไฟล์จริง พื้นที่กดไม่หดขณะ active
- Light/dark และ focus ring ผ่าน React controller มี callbacks เดิม, transition false, pending file null และ duplicates ว่าง ไม่มี browser runtime error

Local TypeScript, token lint และ production build ผ่าน Independent read-only review ไม่พบ release blocker ไม่รัน unit suite ซ้ำเพราะไม่มี `lib/` หรือ logic นำเข้าเปลี่ยน

ขอบเขต QA ใช้ `/exam-screen-lab/question-import-options` ที่ import หน้าจริง ตรวจ layout, link และการเรียก native file input โดยดัก click เพื่อไม่เลือกไฟล์หรือนำเข้าจริง ไม่ครอบคลุม authenticated shell, Word parser, duplicate resolution หรือการบันทึกโจทย์ ซึ่งไม่ได้เปลี่ยนในแพตช์นี้

## Production และการกู้คืน

PR #60 merge เข้า `master` แล้วที่ `1b85c28aae21b0bd2fb8263e74c8a25d298fa5fe` โดยไม่รวมประวัติ Staging-only ไฟล์ runtime ทั้งสี่ตรงกับ PR ที่ผ่าน Staging Vercel project `jk` deploy จาก `master` อัตโนมัติ

Production deployment `dpl_GgmT6sEaXm4MDvvX8HEJJYwhoxpb` เป็น Ready พร้อม source SHA ตรงกับ merge และ canonical aliases `www.korkru.com`/`korkru.com` ตรวจเว็บจริงแบบ read-only หลังเจ้าของอนุมัติ: `/login` 200 พร้อม tier production ไม่มีป้าย Staging, `/questions/import` และ `/questions/import/word?back=%2Fquestions%2Fimport` 307 ไป `/login` เมื่อไม่มี session, `/exam-screen-lab/question-import-options` 404 ไม่สร้างหรือแก้ข้อมูล Production

จุดกู้คืนก่อนปล่อย: commit `397183493460a22c7ee430ce63b081810a403e38`, deployment `dpl_FEQrrznNtrhvYXXNPhrEZmEFvhXK` (Ready) ไม่มี schema ให้ rollback

บันทึกหลัง deploy นี้ push บน branch `codex/question-import-card-design` แยกจาก merge commit ของ UI เพื่อไม่สร้าง deployment ใหม่จากการบันทึกสถานะ

# Staging phase 2B — guard และ fresh-project bootstrap contract

อัปเดต: 20 กันยายน 2026
สถานะ: **โค้ดป้องกันพร้อมแล้ว — ยังไม่ได้สร้างหรือแก้ Supabase/Vercel ภายนอก**

เฟสนี้แก้ blocker ที่พบใน 2A โดยไม่เพิ่ม migration ย้อนหลัง ไม่ link CLI ไปโปรเจกต์ใหม่ และไม่แตะ Production

## Environment contract

- `KORKRU_DEPLOYMENT_ENV` รับเฉพาะ `local`, `staging`, `production`
- local เดิมยังเปิดและ build ได้โดยไม่ต้องเพิ่มค่าใหม่
- Vercel Production เดิมอนุมาน `production` จาก `VERCEL_ENV=production` เพื่อไม่ทำให้ระบบจริงหยุดโดยไม่ตั้งใจ
- Vercel Preview ปฏิเสธการ build/start ถ้าไม่ระบุ `KORKRU_DEPLOYMENT_ENV=staging`
- Staging ต้องเป็น Preview, ต้องมี `EXAM_QA_ENVIRONMENT=staging`, และ site/Supabase origins ต้องเป็น HTTPS คนละแห่งกับ Production
- build guard อยู่ใน `next.config.ts`; startup guard อยู่ใน `instrumentation.ts`; root layout ตรวจซ้ำก่อน render
- error แสดงเฉพาะชื่อ field ที่ผิด ไม่แสดง URL, project ref, anon key หรือ service-role key

เมื่ออยู่ใน Staging ทุกหน้าจะแสดงป้าย `STAGING · ระบบทดสอบ` และส่ง metadata `noindex, nofollow, nocache` ส่วน Production ไม่มีป้ายและไม่ได้รับ robots rule นี้

## Bootstrap contract สำหรับ Supabase ใหม่

แหล่งจริงเพียงจุดเดียวคือ `supabase/bootstrap/manifest.json` และใช้เฉพาะ fresh Staging project:

1. apply `supabase/schema.sql` เป็น baseline รุ่นแรก
2. apply `supabase/bootstrap/010_question_images_prerequisite.sql` เพื่อสร้าง `question-images` ที่เดิมสร้างผ่าน Dashboard
3. apply `supabase/migrations` ตั้งแต่ `002` ตาม ledger เดิม
4. apply `supabase/bootstrap/900_disable_staging_cron.sql`
5. ตรวจ/ปรับ bucket ผ่าน Storage API ตาม manifest และลบ `classroom-post-images` เฉพาะเมื่อว่าง
6. ใช้ `supabase/seed.sql` ซึ่งตั้งใจว่าง ไม่มีข้อมูล Production

ลำดับนี้สร้างซ้ำได้กับ **โปรเจกต์ใหม่คนละโปรเจกต์** ไม่ใช่สคริปต์ reset โปรเจกต์ที่มีข้อมูล และไม่ได้ถูกเพิ่มเข้า migration ledger ของ Production

## Storage และ seed policy

- bucket ที่ต้องมีครบ 6 รายการ: `question-images`, `work-images`, `submission-files`, `classroom-post-files`, `math-work-artifacts`, `ioc-signatures`
- `classroom-post-images` เป็นชื่อเก่า ห้ามลบด้วย SQL; ใช้ Storage API และปฏิเสธการลบเมื่อพบ object
- `npm run reconcile:staging-storage` อ่านรายการและรายงาน drift เท่านั้น
- การแก้จริงต้องระบุ `--apply` และผ่าน guard ทุกชั้นก่อน จึงเก็บคำสั่งนี้ไว้ใช้ใน 2C หลังสร้าง project แล้ว
- ไม่ copy Auth users, organization, ห้องเรียน, ข้อสอบ, คำตอบ, คะแนน, งานวิจัย หรือ Storage objects จาก Production
- ข้อมูล UAT ต้องเป็นข้อมูลสังเคราะห์และสร้างผ่าน flow ของแอปในเฟสหลัง

## Cron policy

schema/functions ของ Staging ต้องเหมือน Production แต่ scheduled jobs ปิดไว้หลัง apply migrations:

- `homeroom-weekly-digest`
- `exam-proctor-retention-daily`
- `exam-android-approval-retention-daily`

Vercel Preview จะยังไม่ผูก scheduled cleanup route ในเฟสนี้ การเปิด cron ใดใน Staging ต้องเป็นการตัดสินใจแยกหลังพิสูจน์ target และข้อมูลแล้ว

## Preflight ที่ต้องผ่านก่อน 2C

คัดลอก `.env.qa.example` เป็น `.env.qa.local` แล้วใส่ค่าจาก Staging secret manager เท่านั้น จากนั้นรัน:

```bash
npm run check:exam-staging
npm run check:staging-bootstrap
```

ตัวตรวจ bootstrap ตรวจว่า database URL ชี้ project ref เดียวกับ Staging public URL และไม่ใช่ Production โดยไม่เรียก networkหรือพิมพ์ค่าใดออกมา ขณะยังไม่มี Staging จริง ผลที่ถูกต้องคือ `NOT READY`; ห้ามรัน schema/migration/storage mutation จนกว่าจะผ่านครบ

## หลักฐานการตรวจเฟส 2B

- `npm test`: ผ่าน 105 test files รวม 1,358 tests
- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน
- ตรวจ local runtime ผ่าน Next MCP: ไม่มี compilation/runtime error และ local ไม่มีป้าย Staging หรือ robots rule เพิ่ม
- ตรวจ simulated Staging runtime ผ่าน Next MCP และ browser: แสดง `STAGING · ระบบทดสอบ`, มี `noindex, nofollow, nocache` และไม่มี compilation/runtime error
- preflight แบบไม่มี Staging จริงปฏิเสธตามที่ออกแบบ และ preflight ด้วยค่าทดสอบที่แยกจาก Production ผ่านครบโดยไม่พิมพ์ secret

การตรวจ production build ในสภาพแวดล้อมนี้ยังไม่สำเร็จ: Turbopack ถูก sandbox ปฏิเสธการสร้าง process/เปิด port ระหว่างประมวลผล CSS ส่วน webpack fallback พบปัญหาเดิมที่ client import `node:crypto` ผ่าน `lib/ioc-token.ts` ซึ่งอยู่นอกขอบเขต 2B จึงต้องติดตามแยกก่อน release แต่ไม่ได้ลบล้างผล runtime และ regression tests ข้างต้น

## ขอบเขตที่ตั้งใจเลื่อนไป 2C

- สร้าง Supabase Staging project จริง
- เติม `.env.qa.local` บนเครื่องจาก secret manager
- รัน guarded preflight กับ target จริง
- apply baseline/migrations/bootstrap SQL ตามลำดับ
- รัน Storage reconciliation แบบ read-only ก่อน แล้วจึง `--apply`
- ตรวจ schema, RLS, Realtime, buckets และ cron บน target หลัง bootstrap

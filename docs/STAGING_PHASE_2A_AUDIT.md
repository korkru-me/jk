# Staging phase 2A — inventory และแผนแยกจาก Production

อัปเดต: 20 กันยายน 2026
สถานะ: **ตรวจ repository และ migration ledger แล้ว — ยังไม่อนุญาตให้สร้างข้อมูล QA**

เอกสารนี้บันทึกผลสำรวจแบบอ่านอย่างเดียวก่อนสร้าง Staging ของ KorKru ไม่เก็บ URL, project ref, token, CK/BEK, password หรือค่าของ environment variable ใด ๆ

## ขอบเขตที่ตรวจ

- Git revision และ branch ที่เป็นฐานของงาน
- ชื่อ environment variables ที่โค้ดใช้ โดยไม่อ่านหรือแสดงค่า
- Supabase Auth, Database/RLS, Storage, Realtime และ scheduled jobs
- Vercel deployment metadata, cron และสถานะการเชื่อม CLI
- callback, OAuth, email, webhook และบริการภายนอกที่พบใน repository
- ความสามารถในการสร้างฐานข้อมูลใหม่จากไฟล์ที่เก็บใน Git

ไม่ได้แก้ Vercel, Supabase, DNS, Auth provider, database หรือข้อมูลผู้ใช้ในเฟสนี้

## Baseline ที่ยืนยันแล้ว

- Source branch: `master`
- Source revision ตอนตรวจ: `9b180003b9031155d887bbe28bc3149c1337ee24`
- Local `master` ตรงกับ `origin/master` หลัง `git fetch`
- Working tree สะอาดก่อนเริ่มตรวจ
- ยังไม่มี branch ชื่อ `staging`
- Supabase CLI เชื่อมกับโปรเจกต์เดิมอยู่ แต่ local Vercel CLI ยังไม่ถูกติดตั้ง/เชื่อม (`.vercel/project.json` ไม่มี)
- `supabase migration list` ยืนยันว่า migration local/remote ตรงกันทั้ง 117 รายการ ณ เวลาตรวจ
- `.env.qa.local` ยังไม่มี และ `npm run check:exam-staging` จึงรายงาน 5 blockers กับ 1 warning ตามจริง

## Topology ปัจจุบัน

### Application และ deployment

- Next.js ใช้ Supabase เป็น Auth, Database, RLS, Storage และ Realtime
- `master` เป็น branch ที่ติดตามอยู่ในปัจจุบัน; repository ยังไม่มี staging deployment ที่ยืนยันได้
- `vercel.json` กำหนด region `sin1` และ Vercel Cron หนึ่งรายการสำหรับ `/api/internal/math-work-cleanup`
- route cleanup ปฏิเสธการทำงานเมื่อไม่มี `CRON_SECRET` ที่ยาวพอ และใช้ service role หลังตรวจ Bearer token แล้วเท่านั้น
- ไม่มี payment provider หรือ payment webhook ที่ทำงานจริงใน repository; pricing/billing ยังเป็นต้นแบบตามเอกสารผลิตภัณฑ์

### Environment contract ที่โค้ดใช้จริง

ค่าที่เปิดเผยต่อ browser ตามการออกแบบ:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SEB_CONFIG_URL`

ค่าฝั่ง server ที่ห้ามส่งเข้า browser หรือ commit:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `SEB_SESSION_SECRET`
- `SEB_CONFIG_KEY`
- `SEB_BROWSER_EXAM_KEYS`

metadata สำหรับตัวตรวจ Staging ซึ่งไม่ใช่ credential:

- `EXAM_QA_ENVIRONMENT`
- `VERCEL_ENV`
- `EXAM_QA_PRODUCTION_SITE_URL`
- `EXAM_QA_PRODUCTION_SUPABASE_URL`

`.env.example` มี runtime variables ครบ แต่ `.env.qa.example` มีเฉพาะส่วนที่ตัว isolation guard ต้องใช้และยังไม่มี cron/SEB variables จึงยังไม่ใช่แม่แบบ deployment ของ Staging ทั้งชุด

### Auth และ callback

- รองรับ email/password, Google OAuth, magic link และ password recovery
- Google OAuth, magic link และ recovery ประกอบ callback จาก `NEXT_PUBLIC_SITE_URL`; ถ้า Staging ตั้งค่านี้ผิด ลิงก์จะย้อนกลับผิด environment
- callback แลก Supabase session จาก URL ที่ request เข้ามา แต่จุดเริ่ม OAuth/recovery ยังอาศัย `NEXT_PUBLIC_SITE_URL`
- สถานะ Google provider, Site URL, redirect allowlist และ SMTP จริงอยู่ใน Supabase Dashboard และไม่ได้บันทึกใน Git จึงต้องตรวจแยกตอนเฟส 2C/2E
- repository ไม่มี SMTP provider secret หรือ external email delivery configuration ที่เปิดใช้งาน

### Database, RLS และ Realtime

- migration ledger ที่ link อยู่ตรงกับ local ทั้ง 117 รายการ
- Realtime ใช้กับ `exam_proctor_sessions`, `exam_proctor_events` และ `exam_android_approvals`
- `exam_seb_checkins` จงใจไม่อยู่ใน Realtime publication และหน้าคุมสอบอ่านผ่าน RLS-protected polling
- migration สร้าง `pg_cron` jobs สามรายการ:
  - `homeroom-weekly-digest`
  - `exam-proctor-retention-daily`
  - `exam-android-approval-retention-daily`
- digest เขียน notification ภายในฐานข้อมูล ไม่พบเส้นทางส่งอีเมลภายนอกใน repository

### Storage ที่ Staging ต้องมี

| Bucket | การอ่าน | แหล่งกำเนิดที่พบ |
| --- | --- | --- |
| `question-images` | public | เคยสร้างจาก Dashboard ก่อนใช้ CLI; migration มีเฉพาะการปรับ limit/policy |
| `work-images` | public | migration |
| `submission-files` | public | migration |
| `classroom-post-files` | public | migration |
| `math-work-artifacts` | private | migration; อ่าน/เขียนผ่าน signed URL หลัง server authorization |
| `ioc-signatures` | private | migration; server-mediated |

`classroom-post-images` เป็น bucket รุ่นเก่าที่ migration เคยสร้างแล้วเลิกใช้ การลบ bucket ต้องทำผ่าน Storage API และไม่สามารถทำด้วย `DELETE FROM storage.buckets` ใน migration ได้

## Blocker สำคัญ: schema ยังสร้างใหม่จาก migration folder อย่างเดียวไม่ได้

ห้าม link CLI ไป Staging ใหม่แล้วรัน `supabase db push` ทันที ด้วยเหตุผลต่อไปนี้:

1. migration history เริ่มที่ `002`; ไฟล์เหล่านี้ระบุเองว่าต้องรันหลัง `supabase/schema.sql`
2. `supabase/schema.sql` เป็น baseline รุ่นแรกที่อยู่นอก migration ledger
3. `supabase/legacy/sprint5_exam_system.sql` เป็นหลักฐาน SQL ที่เคยรันด้วยมือ ไม่ใช่ migration และมี syntax ที่รันซ้ำไม่ได้
4. `question-images` เคยสร้างผ่าน Dashboard จึงไม่มีคำสั่งสร้าง bucket อยู่ใน migration
5. `supabase/config.toml` เปิด seed และชี้ไป `./seed.sql` แต่ไฟล์นี้ไม่มีอยู่
6. การลบ bucket เก่า `classroom-post-images` เคยทำผ่าน Storage API นอก migration

ผลคือ production มี schema ครบและ ledger ตรง แต่ fresh project ยังไม่มีเส้นทาง bootstrap ที่ทำซ้ำได้จาก Git เพียงอย่างเดียว การสร้าง Staging ก่อนแก้เรื่องนี้เสี่ยงได้ฐานที่ขาดตาราง, bucket หรือ policy แล้วทำให้ผล UAT หลอกว่าเป็นปัญหาของแอป

ห้ามแก้ด้วยการเพิ่ม migration `001` เข้า `supabase/migrations` เพราะ repository ยัง link กับ Production และไฟล์นั้นจะกลายเป็น local-only migration ที่ Production พยายาม apply ภายหลัง

## ขอบเขตข้อมูลของ Staging ที่อนุมัติให้ใช้

- ใช้ Supabase project คนละแห่งกับ Production
- ใช้ Auth users, organizations, classrooms, questions, assignments, submissions และไฟล์ที่สร้างเพื่อ QA เท่านั้น
- ใช้ชื่อและอีเมลทดสอบ ไม่คัดลอกบัญชี รายชื่อนักเรียน คำตอบ คะแนน รูป ไฟล์ ลายเซ็น หรือข้อมูลวิจัยจาก Production
- ไม่คัดลอก `auth.users`, Storage objects หรือ row ใดจาก Production เพื่อความสะดวก
- category/reference rows ที่มาจาก versioned SQL ใช้ได้ เพราะไม่ใช่ข้อมูลผู้ใช้
- secret ทุกตัวต้องสร้างใหม่สำหรับ Staging รวมถึง service role, cron และ SEB session secret
- CK/BEK ของ release candidate บันทึกเฉพาะใน secret manager ของ Staging และ Production ตามงานที่ต้องใช้ ห้ามใส่ใน Git/เอกสาร/log

## สิ่งที่มีอยู่แล้วและใช้ต่อได้

- `.env.qa.example` แยก staging/production origins
- `npm run check:exam-staging` ตรวจว่า deployment ไม่ใช่ Production และ Supabase/site origins ไม่ซ้ำกัน โดยไม่พิมพ์ค่า
- `npm run check:exam-candidate`, `check:exam-uat`, `check:seb-platforms` และ `check:exam-release` ปิด release แบบ fail-closed
- เอกสาร UAT และ fixed-schema evidence manifests ไม่รับ URL หรือ credential

ตัวตรวจที่มีอยู่เป็น preflight จากไฟล์/ตัวแปรที่ส่งให้เท่านั้น ยังไม่ใช่ runtime/build guard ของตัวแอป และยังไม่ยืนยันว่า database target มี schema/buckets/policies ครบ

## งานบังคับสำหรับเฟส 2B

1. สร้าง environment contract กลางที่แยก `local`, `staging` และ `production` และทดสอบแบบ fail-closed
2. เพิ่ม build/runtime guard เพื่อไม่ให้ Staging เริ่มทำงานเมื่อชี้ Supabase หรือ site origin ของ Production
3. เพิ่มป้าย Staging และ `noindex` โดยไม่กระทบ Production
4. ออกแบบ bootstrap path ที่ versioned และตรวจซ้ำได้สำหรับ fresh Supabase project โดยไม่เพิ่ม migration ย้อนหลังให้ Production
5. ทำ bucket manifest ให้ครบ รวม `question-images` และขั้นตอนลบ bucket รุ่นเก่าผ่าน Storage API
6. ตัดสินใจ seed strategy: schema/reference-only กับข้อมูล QA สังเคราะห์ โดยไม่ใช้ข้อมูล Production
7. กำหนด cron policy ของ Staging ก่อน apply migration เพื่อไม่ให้ scheduled job ทำงานโดยไม่ตั้งใจ
8. เพิ่ม preflight ที่ตรวจ target project แบบไม่พิมพ์ project ref หรือ secret ก่อนคำสั่ง bootstrap/migration ทุกครั้ง

## งานที่ต้องยืนยันภายนอกในเฟสหลังจากนี้

- สร้าง Supabase project `korkru-staging` หรือชื่อที่เทียบเท่า
- ตรวจ Supabase Auth Site URL, redirect allowlist, Google provider และ email behavior
- ผูก Vercel Preview ของ branch `staging` และใส่ branch-specific environment variables
- ตรวจ Vercel deployment ID/URL โดยไม่ commit URL หรือ token

เฟส 2A ไม่ต้องให้เจ้าของผลิตภัณฑ์ทดสอบหน้าเว็บและไม่ต้องส่ง secret ใด ๆ

## คำสั่งที่ใช้ยืนยัน

- `git fetch origin`
- `git status --short --branch`
- `supabase migration list` — อ่านอย่างเดียว; local/remote ตรงกัน
- `npm run check:exam-staging` — จงใจต้องเป็น `NOT READY` จนกว่า Staging จริงจะมีอยู่
- static search เฉพาะชื่อ environment variable, callback, bucket, Realtime publication และ cron; ไม่พิมพ์ค่าที่ตั้งไว้

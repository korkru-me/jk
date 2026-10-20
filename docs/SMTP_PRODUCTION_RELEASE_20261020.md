# Production SMTP และ recovery — 20 ตุลาคม 2026

สถานะ: **Production application ปล่อยแล้วและตรวจ primary หลัง Ready แล้ว; SMTP ยังรอเจ้าของกรอก Password/Save และยังไม่ทดสอบอีเมล Production** PR [#76](https://github.com/korkru-me/jk/pull/76) merge เป็น `f488c93894346cf74736a43783a9cf6f5369a2f2` งานนี้ไม่เปิด Google, SEB หรือเปลี่ยนการยืนยันอีเมลสมัคร

## Production Ready และขั้นถัดไป

- Deployment `dpl_AGq5Kj9LbA3vgRVjfPTTbjZpwK5C` / `jk-7y2bwdxw8-korkru-mes-projects.vercel.app` เป็น **READY** ที่ `2026-10-20T05:13:45.043Z` (12:13:45 น. ไทย) source `f488c93894346cf74736a43783a9cf6f5369a2f2`, branch `master`, target Production และมี canonical alias `www.korkru.com` พร้อม `korkru.com`
- หลัง Ready: public HTTP แบบไม่ใช้ credentials ได้ 200 ทั้ง login success/warning, forgot-password และ reset-password ที่ไม่มี grant; success ใช้สีเขียว, warning ใช้สีเตือน และ anonymous reset ยังแสดง expired/used-link gate โดยไม่มีฟอร์มเปลี่ยนรหัส ผล query notice ตรวจเฉพาะ rendering ไม่ใช่หลักฐานว่าเปลี่ยนรหัสบัญชีจริงแล้ว
- ตรวจ actual primary อีกครั้งหลัง Ready: **18/18 hashes ตรง**, Next MCP ชี้ checkout `korkru`/port 3000 และ compilation issues `[]`; Cua หน้า login จริงยังแสดงผลสำเร็จตาม released scope หลัง local env reload ไม่ restart หรือทับงานร่วม ข้อจำกัดจอ 390px ยังบันทึกไว้ด้านล่าง
- ขั้นที่รอเจ้าของ: วางคีย์ `korkru-production-supabase-smtp` ใน Password ของฟอร์ม Supabase Production ที่เตรียมแล้วและกด Save เอง จากนั้นตรวจค่าแบบไม่เปิดเผย secret และพาทดสอบ recovery จริงทีละขั้น ยังไม่มี SMTP Save หรืออีเมลจริงจากรอบนี้ ไม่มี schema/migration หรือ hosted credential change โดย agent

## ขอบเขต source

- Base: fresh `origin/master` `216d492469259a3e22945413e4ca798e71439a1f` Branch `codex/recovery-production-20261020`, worktree `korkru-smtp-production-20261020` แยกจาก primary และ source recovery
- ใช้ผลลัพธ์ของ `be7ee0d` เฉพาะ `lib/actions/auth.ts`, `components/auth/reset-password-form.tsx`, `lib/auth/email-actions.test.ts` และ `e952b4b` เฉพาะ `app/login/page.tsx`, `components/ui/alert.tsx` ทั้งห้าไฟล์ตรงต้นทางแบบ byte-for-byte
- หลังตั้งรหัสสำเร็จ action redirect ไป login เพื่อให้ notice คงอยู่หลัง cookie cleanup/refresh; แสดง same-password เป็น field error และเก็บ grant ให้ลองรหัสอื่นได้; revocation ล้มเหลวมีคำเตือนที่ไม่อ้างว่าออกทุกอุปกรณ์แล้ว
- ไม่เปลี่ยน callback/intent/grant, signup/check-email feedback, branding, Google, SEB, quota, package/lockfile หรือ environment example ไม่มี schema/migration/env ใหม่จากสองแพตช์นี้ เอกสาร Production เดิมคงไว้ ไม่ cherry-pick เอกสาร source เก่าทับทั้งชุด

## การตั้งค่าที่ตรวจและสิ่งที่เจ้าของทำแล้ว

- Native Auth read-only แบบกรองค่าลับ: custom SMTP 4 รายการยัง absent, canonical Site URL `https://www.korkru.com`, autoconfirm `true`, recovery template มี `{{ .ConfirmationURL }}` ต้องรักษา autoconfirm เดิมและ current-password policy ไม่เปิด Confirm email จากงานนี้
- เจ้าของรายงานว่าสร้าง `korkru-production-supabase-smtp` แบบ **Sending access** จำกัด `mail.korkru.com` แล้ว เก็บ key เป็นส่วนตัว ไม่ใช้ Full access quota monitor key และไม่อ่าน/บันทึกค่าลับลง Git/แชท
- ค่าตั้ง SMTP ที่เตรียม: `smtp.resend.com`, port `465`, username `resend`, sender `auth@mail.korkru.com`, sender name `KorKru` ฟอร์ม Supabase เตรียมแล้วแต่ช่อง password ยังว่าง ให้เจ้าของกรอก key เองและ Save ภายหลัง ยังไม่มีการบันทึก SMTP
- Root ตรวจ Vercel native API สดเฉพาะ public key แล้ว: Production `NEXT_PUBLIC_SITE_URL` ตรง `https://www.korkru.com` และ Supabase Site URL ตรงกัน คง callback query `next=/reset-password`/`recovery_nonce` ผ่าน `{{ .ConfirmationURL }}` ไม่เปลี่ยนเป็น reset URL เปล่าหรือ signup-only token-hash endpoint ปิด tracking ของลิงก์ Auth ตามเดิม
- Quota rollout เดิมคง Production `RESEND_QUOTA_ALERTS_ENABLED=true`, Staging `false` และ webhook เดิม ไม่เปลี่ยน key/secret/flags/URL จากงานนี้

## หลักฐานและ gates

- Original Staging patches ผ่าน local full suite/build/runtime และเจ้าของรายงาน fresh recovery core flow/same-password/success/old-password rejection/new-password login ผ่านแล้ว ผลนี้แยกจาก Production manual test ที่ยังรอ
- Candidate full Vitest: **326 files / 4,671 tests ผ่าน**; TypeScript และ token lint ผ่าน Independent read-only review ไม่พบ blocker และยืนยัน exact five-file scope
- **Candidate `cd72687` Node24.19.0 Webpack production build ผ่าน** ใน snapshot ของ committed source ซึ่งใช้ dependency symlink ชุดเดียวกับ primary และ environment object ที่สร้างใหม่เท่านั้น ไม่สืบทอด process env, HOME, NODE_OPTIONS หรือ Vercel flags และไม่คัดลอกไฟล์ `.env` ใช้ loopback Supabase/fake keys/synthetic Auth secret เท่านั้น Compile 52s, TypeScript 25.7s, static generation **76/76** ใน 7.3s และ traces สำเร็จ exit 0; application ทั้งห้าไฟล์ใน snapshot ตรง candidate แบบ byte-for-byte Log ชื่อ `korkru-recovery-candidate-clean-env-webpack-20261020.log` ในพื้นที่ชั่วคราว ไม่มี app/Next config workaround
- ประวัติการตรวจที่ล้มเหลวก่อนหน้านั้น: inherited-environment builds พบ `Expected workStore to be initialized` ทั้ง candidate Webpack/default Turbopack และ baseline `216d492` Webpack จึงไม่ใช่อาการที่พิสูจน์ว่าเกิดจาก recovery patch เพียงอย่างเดียว Relevant Next registry/build/runtime 1,154 ไฟล์ตรง lock/tarball การตรวจ clean env พร้อม primary dependency set ข้างต้นผ่านแล้ว จึงไม่ถือเป็น build blocker ปัจจุบัน แต่ยังไม่แยกสาเหตุ env กับ dependency set เป็นรายตัว
- Snapshot local port 3074 เคยได้ Next MCP compilation issues `[]` แต่ Cua เปิด fixture ไม่ได้ จึงไม่ใช้เป็น UI proof และหยุด server แล้ว UI proof ปัจจุบันมาจาก **actual primary `localhost:3000`** ตามรายการถัดไปเท่านั้น ไม่ใช้ hosted Auth, บัญชีจริง หรือ SMTP ใน local checks

## Primary integration และการตรวจหลัง release

- Actual checkout `korkru`, branch `codex/student-classroom-cards`, HEAD `c36fb8b3fdd1e84b21eb0e87307ba9528779bbc8`, PID **54741** ไม่เปลี่ยนและไม่ restart Primary เดิมตาม core recovery ไม่ครบ จึงปิด dependency closure เฉพาะ **18 paths**: copy 15 paths จาก `216d492`/`be7ee0d`/`e952b4b`, narrow merge `lib/actions/auth.ts` กับ `app/auth/callback/route.ts` โดยรักษา non-recovery functions/handling และ source-derived focused test อีกหนึ่งไฟล์ ไม่แทนทั้งไฟล์ที่มีงานร่วมเดิม
- ผลตรวจ protected paths เปลี่ยน **0**; งาน dirty ที่ไม่เกี่ยวข้อง, Auth functions และ non-recovery callback เดิมคงอยู่ Source/check audit เดิมไม่มี env/package/schema change และไม่อ่านค่าลับ การ sync นี้ยังไม่ commit/push ใน shared primary โดยเจตนา แหล่ง reconstruct และ hashes บันทึกแบบ sanitized ใน [SMTP_PRIMARY_PARITY_20261020.json](SMTP_PRIMARY_PARITY_20261020.json) ไม่คัดลอก private patch ลง Git
- Local-config exception ที่พบภายหลัง: primary เดิมไม่มี `AUTH_FLOW_SECRET` ซึ่ง baseline recovery helpers ต้องใช้ Root สร้างค่าสุ่มใหม่ 256-bit สำหรับ local เท่านั้นใน ignored `.env.local` และเพิ่ม blank placeholder/comment ใน primary `.env.example` โดยไม่ทับงาน dirty/ค่าเดิม ไม่คัดลอกหรืออ่านค่า Production/Staging secret และไม่เปลี่ยน flags ยืนยัน `git check-ignore`, native Next env loader พบค่าที่ยาวอย่างน้อย 32 ตัว และ dev log แจ้ง reload `.env.local` แล้ว โดยไม่พิมพ์หรือ commit ค่าจริง Candidate มี contract เดิมแล้ว จึงไม่มี env requirement ใหม่ของ release นี้ แยกจากผล source/build/UI audit ก่อนหน้า
- Primary full suite **321 files / 4,500 tests**, focused **5 files / 47 tests**, TypeScript แบบไม่ใช้ incremental, token lint และ clean-env Node24 Webpack snapshot build **71/71 static pages** ผ่าน Snapshot ไม่มี real env/Production credentials หรือ fixture
- Root ใช้ **Cua บน actual `localhost:3000` ที่ desktop กว้าง 1507px** ตรวจ synthetic reused-password inline error/aria-invalid/focus, success notice สีเขียวที่คงอยู่หลัง reload, revocation warning สีเหลือง, provider/network errors และ success/warning callout ของหน้า login จริงผ่าน **ยังไม่มีหลักฐานจอ 390px ในรอบนี้** ลบ temporary fixture ทั้ง 4 ไฟล์แล้วและยืนยัน directory ไม่มีเหลือ ไม่ใช้ผล synthetic แทน SMTP จริง
- Integration เริ่มก่อน release และ Root ตรวจ source/runtime ซ้ำหลัง Production Ready ตาม checkpoint ด้านบนแล้ว การเตรียม candidate ไม่เปลี่ยน provider/DB หรือ hosted env; deploy ทำผ่าน merge PR #76 ตามขอบเขตที่เจ้าของอนุญาต
- หลัง release/parity แล้ว เจ้าของบันทึก SMTP ส่วนตัวและขอ recovery ใหม่หนึ่งครั้งในเบราว์เซอร์เดิม ตรวจ Inbox/ลิงก์/รหัสเดิมซ้ำ/รหัสใหม่/notice สีที่คงอยู่/old-password rejection/new-password login พร้อมตรวจ reused/expired link ตามโอกาส ไม่ใช้ผล mock แทนการยืนยัน SMTP จริง

อ้างอิง: [Resend SMTP](https://resend.com/docs/send-with-supabase-smtp), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

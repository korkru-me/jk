# Production SMTP และ recovery — 20 ตุลาคม 2026

สถานะ: **candidate ยังไม่ deploy/เปิด SMTP และยังไม่ทดสอบอีเมล Production; production build ยังไม่ผ่าน** เจ้าของอนุญาตตั้งค่าและทดสอบแบบทีละขั้นตอนแล้ว สถานะนี้ต่อจาก source handoff `d34acf4` ไม่ใช่การเปิด Google, SEB หรือเปลี่ยนการยืนยันอีเมลสมัคร

## ขอบเขต source

- Base: fresh `origin/master` `216d492469259a3e22945413e4ca798e71439a1f` Branch `codex/recovery-production-20261020`, worktree `korkru-smtp-production-20261020` แยกจาก primary และ source recovery
- ใช้ผลลัพธ์ของ `be7ee0d` เฉพาะ `lib/actions/auth.ts`, `components/auth/reset-password-form.tsx`, `lib/auth/email-actions.test.ts` และ `e952b4b` เฉพาะ `app/login/page.tsx`, `components/ui/alert.tsx` ทั้งห้าไฟล์ตรงต้นทางแบบ byte-for-byte
- หลังตั้งรหัสสำเร็จ action redirect ไป login เพื่อให้ notice คงอยู่หลัง cookie cleanup/refresh; แสดง same-password เป็น field error และเก็บ grant ให้ลองรหัสอื่นได้; revocation ล้มเหลวมีคำเตือนที่ไม่อ้างว่าออกทุกอุปกรณ์แล้ว
- ไม่เปลี่ยน callback/intent/grant, signup/check-email feedback, branding, Google, SEB, quota, package/lockfile หรือ environment example ไม่มี schema/migration/env ใหม่จากสองแพตช์นี้ เอกสาร Production เดิมคงไว้ ไม่ cherry-pick เอกสาร source เก่าทับทั้งชุด

## การตั้งค่าที่ตรวจและสิ่งที่เจ้าของทำแล้ว

- Native Auth read-only แบบกรองค่าลับ: custom SMTP 4 รายการยัง absent, canonical Site URL `https://www.korkru.com`, autoconfirm `true`, recovery template มี `{{ .ConfirmationURL }}` ต้องรักษา autoconfirm เดิมและ current-password policy ไม่เปิด Confirm email จากงานนี้
- เจ้าของรายงานว่าสร้าง `korkru-production-supabase-smtp` แบบ **Sending access** จำกัด `mail.korkru.com` แล้ว เก็บ key เป็นส่วนตัว ไม่ใช้ Full access quota monitor key และไม่อ่าน/บันทึกค่าลับลง Git/แชท
- ค่าตั้ง SMTP ที่เตรียม: `smtp.resend.com`, port `465`, username `resend`, sender `auth@mail.korkru.com`, sender name `KorKru` ช่อง password ให้เจ้าของกรอก key เอง การ Save ยังรอ
- รักษา Site URL/`NEXT_PUBLIC_SITE_URL` เป็น canonical เดียวกัน และคง callback query `next=/reset-password`/`recovery_nonce` ผ่าน `{{ .ConfirmationURL }}` ไม่เปลี่ยนเป็น reset URL เปล่าหรือ signup-only token-hash endpoint ปิด tracking ของลิงก์ Auth ตามเดิม
- Quota rollout เดิมคง Production `RESEND_QUOTA_ALERTS_ENABLED=true`, Staging `false` และ webhook เดิม ไม่เปลี่ยน key/secret/flags/URL จากงานนี้

## หลักฐานและ gates

- Original Staging patches ผ่าน local full suite/build/runtime และเจ้าของรายงาน fresh recovery core flow/same-password/success/old-password rejection/new-password login ผ่านแล้ว ผลนี้แยกจาก Production manual test ที่ยังรอ
- Candidate full Vitest: **326 files / 4,671 tests ผ่าน**; TypeScript และ token lint ผ่าน Independent read-only review ไม่พบ blocker และยืนยัน exact five-file scope
- Node24 production Webpack build compile และ TypeScript ผ่าน แต่ prerender หลาย routes หยุดด้วย Next16 `Invariant: Expected workStore to be initialized` ทั้งกรณี shared dependency symlink, explicit production/symlink-preservation และ physical dependency clone จึงหยุด retry โดยไม่เปลี่ยน Next config หรือ app prerender behavior เป็น workaround ยังไม่พิสูจน์สาเหตุด้วย baseline `216d492` ใน dependency/build context เดียวกัน และ **ห้ามถือว่า build gate ผ่านหรือพร้อม deploy**
- Isolated local runtime snapshot ใช้ loopback Auth provider, synthetic cookies/grants/keys และ server fetch guard ที่ปฏิเสธ external services เท่านั้น Next MCP ยืนยัน snapshot path และ compilation issues `[]` แต่ Cua browser เปิด fixture ไม่ได้ (`ERR_BLOCKED_BY_CLIENT`) จึงไม่อ้าง UI/action runtime ผ่านจากรอบนี้ หยุด server 3074 แล้ว Root เตรียม primary localhost UI verification แยก ไม่ใช้ hosted Auth, บัญชีจริง หรือ SMTP ใน local checks
- ก่อน release ต้องตรวจ Vercel Production `NEXT_PUBLIC_SITE_URL` สดอีกครั้งให้ตรง canonical `https://www.korkru.com`; candidate ไม่แก้ env contract หรือบันทึกค่า provider เพิ่ม
- Root เป็นผู้ review/release และทำ primary localhost parity หลัง Production Ready; candidate นี้ไม่ deploy หรือแก้ provider/DB/env
- หลัง release/parity แล้ว เจ้าของบันทึก SMTP ส่วนตัวและขอ recovery ใหม่หนึ่งครั้งในเบราว์เซอร์เดิม ตรวจ Inbox/ลิงก์/รหัสเดิมซ้ำ/รหัสใหม่/notice สีที่คงอยู่/old-password rejection/new-password login พร้อมตรวจ reused/expired link ตามโอกาส ไม่ใช้ผล mock แทนการยืนยัน SMTP จริง

อ้างอิง: [Resend SMTP](https://resend.com/docs/send-with-supabase-smtp), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

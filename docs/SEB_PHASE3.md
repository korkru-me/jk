# SEB รายข้อสอบ — เฟส 3: ร่างรหัสบนเว็บ

อัปเดต 5 กันยายน 2026

## สถานะจริง

ผู้ใช้ขอให้ทำเฟสที่เหลือต่อและจะทดสอบแอป SEB ด้วยตนเองภายหลัง งานนี้ต่อจาก core ใน commit `940e39f` เป็น **หน้าเว็บ + Server Action + persistence RPC ของร่างรหัส** แล้ว ไม่ใช่ระบบออกรหัสที่มีผลกับ SEB จริง

- เส้นทางครู: ห้องเรียน → งานที่มอบหมาย → ข้อสอบ SEB ของตน → **ร่างรหัสออก SEB**
- หน้า `/assignments/[id]/seb-password` ตรวจ session/เจ้าของ/สมาชิกองค์กร/ประเภทข้อสอบใหม่ และแสดงสาเหตุแยกเมื่อไม่มีสิทธิ์หรือระบบยังไม่พร้อม
- บันทึก/ลบร่างได้เมื่อผู้ดูแลเปิด feature flag, provision dedicated keyring และ apply migration บนฐานเป้าหมายแล้วเท่านั้น ไม่จำลองผลสำเร็จ
- การบันทึกแก้เฉพาะร่าง ไม่เปลี่ยนไฟล์ที่แจกแล้ว ไม่ออก native/session token ไม่เปลี่ยน CK + BEK gate และยังไม่มีปุ่มออกหลังส่งอัตโนมัติ
- migration ใหม่ยัง **ไม่ apply** กับ Supabase ที่เชื่อมอยู่; env จริง, Vercel, production config และ native SEB ไม่ถูกแก้หรือเปิด
- เฟส 4 (SEB Server integration/ไฟล์รายข้อสอบ) และเฟส 5 (ทางออกหลังส่ง/อนุญาตออกกลางคัน) **ยังไม่ได้ implement** ไม่ใช่เพียงรอ manual test ต้องมี server ที่เข้าถึงได้และพิสูจน์ protocol/session binding ก่อน

คู่มือเตรียมระบบและรายการทดสอบที่ส่งมอบอยู่ใน [SEB_PASSWORD_ROLLOUT.md](SEB_PASSWORD_ROLLOUT.md) ห้ามเรียกงานนี้ว่าเสร็จทุกเฟสหรือพร้อมสอบจริง

## เส้นทางข้อมูลและสิทธิ์

1. Server page/action ตรวจ `auth.getUser()` และ profile ผ่าน session-bound Supabase client
2. อ่านเฉพาะ assignment ID ที่ร้องขอและ `created_by = auth user`; ตรวจ membership ของ `assignment.org_id` ไม่ใช้ personal org มาแทน
3. ใช้ policy เดิม: actor active, teacher/admin, เป็นเจ้าของเอง, exam + online + seb_required ไม่มี co-teacher/global admin bypass
4. หลังผ่านจึงสร้าง admin client และเรียก service-role-only RPC ซึ่งตรวจเจ้าของ/สถานะ/membership ซ้ำ ไม่รับ actor/org/owner context จาก browser
5. รหัส ASCII ไม่มี whitespace 12–64 ตัวและ confirmation ถูก validate ฝั่ง server โดยไม่ trim/normalize ไม่มี fallback รหัสกลาง
6. ส่งกลับเฉพาะ metadata แบบ allowlist ไม่ส่งรหัส/envelope/key/CK/BEK/revision UUID ให้ browser ไม่บันทึก raw exception หรือ SQL parameters ใน log

Server Action รับ untrusted command และตรวจใหม่ทุกครั้ง การเคยเปิดหน้าได้ไม่ใช่สิทธิ์ถาวร Field รหัสอยู่ใน input ไม่เก็บ React state/localStorage/URL; ล้างหลัง submit ทั้งกรณีผ่านและไม่ผ่าน ถ้า network ขัดข้องให้โหลดข้อมูลใหม่ ไม่เดาว่าบันทึกสำเร็จหรือไม่สำเร็จ

## Storage, concurrency และ retention

Migration `20260905072556_add_exam_seb_password_drafts.sql` สร้าง:

- `exam_seb_password_drafts`: หนึ่ง head ต่อ assignment, owner/org, revision counter/UUID, saved/discarded/expired, AES-GCM envelope และเวลา ไม่มี published/applied state
- `exam_seb_password_events`: metadata-only audit ของ saved/discarded/expired ไม่มีรหัส/นักเรียน/คำตอบ/ไฟล์
- owner helper, read/write RPC และ purge RPC ทั้งหมด fixed empty search_path และ execute เฉพาะ service_role
- ตารางทั้งคู่เปิด RLS, revoke ALL จาก PUBLIC/anon/authenticated (รวมสิทธิ์ MAINTAIN ใน PostgreSQL ที่รองรับ); ไม่มี browser policy ไม่ publish Realtime

Write RPC ล็อก assignment row ก่อนสร้าง head ครั้งแรก/แก้ไข ตรวจ expected revision และเขียน head + audit ใน transaction เดียว คำขอจากเวอร์ชันเดียวกันสำเร็จได้เพียงรายการเดียว ไม่ retry ด้วย revision ใหม่อัตโนมัติ บันทึกซ้ำมี cooldown 10 วินาที ส่วนลบร่างทำได้ทันทีและเพิ่ม revision เช่นกัน

การแทนร่างทิ้ง ciphertext ของร่างเก่า เพราะ **ยังไม่มีร่างใดถูกแจกเป็นไฟล์ SEB** ประวัติเดิมเหลือ metadata เท่านั้น ถ้าต่อ publish ในอนาคตต้องมี immutable release storage แยก ห้ามนำ semantics การแทน draft ไปแก้รหัสของ release/session เดิม

ร่างเก็บ secret 30 วันและ read RPC แสดง expired ทันทีเมื่อพ้นอายุ Job `purge-expired-exam-seb-password-drafts` เรียกทุกวัน 03:37 ตาม cron timezone เพื่อล้าง expired ciphertext และ audit เกิน 90 วัน (การล้างทางกายภาพอาจช้ากว่า expiry ถึงรอบ job ถัดไป) Head counter คงไว้กัน revision reset; ลบ parent assignment/owner/org แล้ว cascade เฉพาะข้อมูลร่าง/audit ที่เกี่ยวข้อง การลบร่างใน UI ต้องยืนยันและบอกว่าคำตอบ/คะแนน/ไฟล์ที่แจกไว้ไม่เปลี่ยน

ไม่มีการย้ายหรืออ่าน Quit Password เดิมจากไฟล์ production/บัญชีผู้ใช้ ไม่มี KMS client หรือ automatic key rotation ในเฟสนี้

## Encryption และ key management

`lib/seb-password-vault.ts` ใช้ Node crypto AES-256-GCM, IV สุ่ม 12 bytes, tag 16 bytes และ master key 32 bytes แบบ base64 canonical; AAD ผูก purpose/version/algorithm/key ID/org/teacher/assignment/revision UUID/counter ตรวจ GCM tag ก่อนคืน plaintext ตาม [Node crypto](https://nodejs.org/api/crypto.html#class-decipheriv)

`lib/seb-password-config.ts` โหลด server-only env เมื่อมี request:

- `SEB_PASSWORD_DRAFTS_ENABLED`: เปิดเฉพาะ string `true`
- `SEB_PASSWORD_ACTIVE_KEY_ID`
- `SEB_PASSWORD_KEYRING`: JSON keyring มีได้ไม่เกิน 5 keys, ขนาดไม่เกิน 1024 characters

ใช้ deployment secret manager ที่จำกัดสิทธิ์ ไม่ reuse SEB_SESSION_SECRET/CK/BEK/Supabase/รหัสครู ทำ backup keyring แยกจาก DB และทดสอบ restore ใน staging ก่อน enable สร้างข้อเสนอ keyring ใหม่ด้วย `npm run seb:password:prepare-keyring` ซึ่งเขียนไฟล์ private 0600 ใน directory 0700 ที่ git ignore; ไม่พิมพ์ key ไม่ overwrite env เดิม ไม่ deploy/rotate/เปิดฟีเจอร์

หมุน master key โดยเพิ่ม key ใหม่และเปลี่ยน active ID พร้อมเก็บ old keys จนครบ retention/backup recovery ไม่ใช่ลบทิ้งแล้วกดบันทึกใหม่ ห้ามมีเกิน 5 keys; หากทำ key หาย ร่างที่เกี่ยวข้องถอดไม่ได้ ต้อง discard/ตั้งร่างใหม่ ห้ามใช้รหัสกลางทดแทน การหมุน key ภายในไม่เปลี่ยน native Quit Password และไม่ได้ยกเลิก session ใด

Plaintext มีใน request/server memory ระหว่าง validate/seal; JavaScript ไม่รับประกัน secure erasure ของ string ห้ามอ้างว่ารหัสไม่เคยอยู่ใน memory หรือมี end-to-end encryption จาก browser ถึง native

## ไฟล์หลัก

- policy/vault: `lib/seb-password-policy.ts`, `lib/seb-password-vault.ts`
- configuration/service/DTO: `lib/seb-password-config.ts`, `lib/seb-password-service.ts`, `lib/seb-password-settings.ts`
- live adapter/action: `lib/seb-password-repository.ts`, `lib/actions/seb-password.ts`
- page/form: `app/(app)/assignments/[id]/seb-password/`, `components/exam/seb-password-form.tsx`
- SQL และ tests: migration ข้างต้น, `lib/seb-password*.test.ts`, `scripts/seb-password/`

## Verification และข้อจำกัด

- `npm run seb:password:test`: 159 tests ผ่าน ณ รอบตรวจล่าสุด
- `npm test`: 970 tests / 76 files ผ่าน; รอบ sandbox ปฏิเสธ loopback listen ทำให้ transport fixtures 4 ข้อรันไม่ได้ จึงรันใหม่ด้วยสิทธิ์เปิด 127.0.0.1 แล้วผ่านทั้งหมด ไม่เชื่อม SEB Server/ฐานนักเรียนจริง
- `npx tsc --noEmit`, `npm run build`, `npm run lint:tokens` และ `git diff --check` ผ่าน; build มี route ร่างรหัสใหม่และไม่ได้ deploy
- SQL tests ใช้ [PGlite 0.5.8](https://pglite.dev/docs/) dev-only เป็น PostgreSQL ใน memory รัน migration **ไฟล์จริงที่ไม่ดัดแปลง** บน dependency schema สมมติ ไม่ใช่ Supabase schema/history ทั้งระบบ
- ทดสอบ CAS, owner/student/cross-org/removed membership/suspension, ACL/RLS, envelope redaction, purge/expiry, cascade, malformed payload และ RPC acknowledgement จริงใน engine
- cron.schedule เป็น stub ใน fixture เพื่อบันทึก job definition ไม่ได้รัน scheduler; PGlite มี connection เดียวจึงยังไม่ใช่ multi-connection contention test
- repository/Server Action tests mock Supabase เพื่อพิสูจน์ลำดับ fresh auth → scope → privileged RPC และ error redaction ไม่ใช่ live Auth/PostgREST tests
- เปิด local browser ด้วยบัญชีที่ผู้ใช้ล็อกอินไว้แบบอ่านอย่างเดียว ยืนยันว่าข้อสอบที่ไม่ได้เปิด SEB ไม่แสดงปุ่มและเข้า route รหัสแล้วถูกปฏิเสธ ไม่แก้ข้อสอบจริงเพื่อให้ทดสอบผ่าน
- หน้า save/discard กับ live Supabase, migration/cron บนฐานจริง, key provisioning/restore, native ทุก platform และ SEB Server integration ยังไม่ผ่านการตรวจจริง
- หลังผู้ใช้อนุญาตให้ส่ง dependency metadata ไป npm registry รัน `npm audit --json` แล้วพบ 56 รายการ (high 13, moderate 40, low 3, critical 0) ไม่พบ advisory ของ test dependency `@electric-sql/pglite` ที่เพิ่มใหม่ มี `next` รวมอยู่ใน high และต้องแยกงาน upgrade/compatibility test ต่อ ห้ามถือว่า build/test ผ่านเท่ากับไม่มีช่องโหว่ ไม่รัน audit fix หรือเปลี่ยน dependencies อื่นอัตโนมัติ; ตอนติดตั้งมี peer warnings ของ Excalidraw/React ด้วย

ข้อจำกัดการเลื่อน manual test: ไม่เปิด CK-only, ไม่รับ unknown/heuristic-only ASK, ไม่ถือว่า SEB Server Active เป็นหลักฐาน และไม่ใช้ static Quit URL/ซ่อนปุ่มเป็นวิธีป้องกันออกก่อนส่ง รายละเอียด protocol blockers อยู่ใน [เฟส 2](SEB_PHASE2.md)

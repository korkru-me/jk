# SEB waiting room — W6 evidence ledger

อัปเดต 10 ตุลาคม 2026 · fixed-exam pilot `waiting-room-completion-experimental-v1`

**W2–W6 software/preparation/deploy: DONE ตาม scope ด้านล่าง.** เอกสารนี้แยกผลที่ตรวจแล้ว
ออกจากสิ่งที่ยังต้องรอ W7 ไม่ใช่ native release certificate
และไม่ประกาศว่า end-to-end/native gates ผ่านครบ **W7: HOLD / NOT RUN / `pending_w7`**
ยังไม่ขอให้เจ้าของเปิดอุปกรณ์หรือเก็บคีย์ ไม่เปลี่ยน r2/keys/evidence เดิมหรือ Production

## Software validation — PASSED ในขอบเขตที่ระบุ

- Frozen code/deployment candidate `a6ed37b9a4208812d5dff2873fc7ce635bc73929` รวม
  localhost real-client lab `140410f`, proof startup fix `7e4c8b0` และ actual-client harness
  `f48e01d` + final navigation error assertion; runtime/browser harness rerun PASSED
- Full suite **236 files / 3,598 tests PASSED**; `npx tsc --noEmit`, design-token lint
  และ guarded Next.js **16.3.5 webpack production build PASSED** บน Staging environment
  ที่ผ่าน isolation guard ไม่ใช่ Production rollout หรือ native physical result
- `lib/seb-waiting-journey.test.ts` มี composed offline server journey **11 tests PASSED**:
  real Proxy/middleware/entry/password Auth binding/signed context/waiting/closed API/
  start/save/submit/resource/completion modules; แทนเฉพาะ framework request context/cache
  และ external Auth/DB/Storage พร้อม synthetic native inputs และ assert zero network
- ครอบคลุม question-free/no-timer wait → explicit server start → autosave failure/retry →
  resume ID/`started_at`/answer row เดิม → submit failure/no exit → committed retry/receipt →
  frozen completion bytes รวม host/origin/context/CSRF/closed-operation/resource/account/
  expiry/streak negatives ผลนี้ไม่ใช่ rendered browser, real Auth/PostgREST/RLS หรือ
  independent PostgreSQL transaction proof
- Localhost actual-client/intercepted-backend runtime UI QA **PASSED — 8 observations**:
  explicit Start ก่อน actual React WaitingExamRunner/ExamClient/timer/inputs mount,
  numeric/MCQ autosave, received refusal คง pending และไม่ replay อัตโนมัติ, offline
  backup/remount restored answer + exact `started_at`/timer ไม่ reset/reconnect clearing,
  lost upload response retry คง uploadId เดิม/หนึ่ง binary/หนึ่ง answer reference,
  submit refusal คงหน้าสอบ และ success ไป exact canonical submitted receipt ที่ intercept
  ไม่มี unexpected requests/ordinary actions/external requests/new client errors Scoped
  Next MCP compilation/config/session diagnostics ว่าง มี historical `/` preflight missing-
  Supabase env error 1 รายการรายงานแยก ไม่อ้าง global-zero-errors ทุก browser history
  Backend Auth/DB/Storage/native ไม่ได้ทดสอบใน UI นี้ และไม่เพิ่ม mocks ลง deployed endpoints

## Actual isolated-Staging fixture — PREPARED ไม่ใช่การเริ่มสอบ

- ภายใต้คำอนุมัติ W6 TEST สร้างผ่าน real Auth + actual application actions: **2 synthetic
  accounts / 1 classroom / 3 questions** (written, MCQ, file upload) และ **1 draft fixed
  online `seb_required` exam** ที่ `access_code IS NULL` ไม่มีรหัสเข้าสอบเพิ่มเติม
- Current teacher-owned quit revision **1**, รหัส ASCII 6 หลักเฉพาะ fixture ไม่ใช่ shared
  password; credentials และ Auth/org/classroom/question/assignment IDs อยู่ใน private
  receipt เท่านั้น ไม่ใส่เอกสาร Git/log/ภาพ/แชต
- Selected actual authenticated read checks **PASSED**: student questions=0,
  draft assignments=0, registry denied และ teacher-owned positive reads ตามที่ตรวจ
  ไม่เหมารวมว่า whole-flow/direct-RLS proof เพราะ classroom/join actions ใช้ service role
  หลัง application authorization; positive action flow ไม่แทน cross-role/RLS-negative matrix
- ไม่มี publish, student start, submission/attempt หรือ enrolled waiting release ใหม่
  การจัด fixture ไม่ mint native session และไม่อนุญาตให้เอา keys สมมติลง cloud registry

## Fresh scoped seed — PREPARED ไม่ใช่ native final

- Private path: `.local/seb-waiting-w6/korkru-waiting-w6-r1-seed.seb`
- Size: **4,039 bytes**
- SHA-256: `7a8ffa675f6d86865754a0427572a1c5d83c0dcdd2fdf90a0f83f132593107ea`
- Scoped prepare ตรวจ current draft/owner/org/revision/pilot predicate/no active attempt/
  no release แล้วสร้าง seed และ fresh private admin credential โดยไม่ upload/enroll
  Seed policy ไม่มี Exam/Settings file-entry password, initial Quit URL ว่าง และใช้ canonical
  assignment/revision entry/completion + finite filters แต่ยังไม่พิสูจน์ native loading/exit
- ไม่มี native final save, real native CK/BEK/evidence, terminal cloud artifact, enrollment
  หรือ manifest activation ใช้ private receipt เดิมเพื่อตรวจ scope ห้ามทับ seed/สร้าง fixture
  ซ้ำเพื่อข้าม unknown outcome; native step ต่อไปต้องรอคำอนุมัติ W7

## Database/deployment evidence และช่องว่าง

- Atomic-start migration `20261009142610` applied เฉพาะ Staging; migration parity **141
  matching entries** ตรวจ service-only RPC permission ด้วย invalid-input request ผ่าน
  ผลนี้ไม่สร้าง attempt และไม่ใช่ independent concurrent-start proof
- PGlite rollback/idempotence tests ผ่านใน software suite แต่ใช้ serialized connection
  เดียว ไม่ใช่หลักฐาน independent backends; scratch experiment รอบแรก **NOT OBSERVED**
  และ removed/cleaned แล้ว เก็บผลแรกตามจริง ไม่ย้อนเปลี่ยนเป็น pass จากรอบใหม่

### Independent PostgreSQL scratch proof02 — PASSED / cleanup removed

- Observed proof run `8403ead7-f719-4272-b6ac-1a0ef0560422` ผ่านบน isolated Staging
  **3 rounds**, แต่ละรอบมี **4 distinct backend PIDs**: holder, contenders 2 ตัว และ
  observer; เห็น contenders ทั้งสอง active + `Lock` waiting โดย blocker chain ไปถึง
  exact held assignment จริง (รวม transitive blocker) ไม่ถือเพียงการรอ lock ใด ๆ เป็น pass
- ทดสอบ exact committed/live function body ที่ rebind ไป private scratch schema
  พร้อม **14-table models** ไม่ใช่การเรียก public application RPC ทั้ง flow Migration
  SHA-256 `dbc55e2b142bae082dbb9aad4073be173422e9540872d97ec66e3781ab22b395`;
  function-body SHA-256 `e16b2db8276b2d8482a3392d99b78c34d0733a5493d011206c5420d3ac9f7c3a`
- หลังปล่อย holder lock ผลยืนยัน one allocation ต่อ generation, immutable submission ID/
  `started_at`/answer snapshots, completed-generation replay ไม่เปิดรอบใหม่, snapshot
  constraint `23514` rollback header/answers และไม่กิน generation; wrong-only carried
  metadata ที่ assertions กำหนดคงเดิมครบ ไม่ regrade/reset teacher-edited evidence
- รอบแรกยังไม่เห็น holder; source audit/probes พบ CLI auth/login-role startup interference
  ที่ควรหลีกเลี่ยง Source `7e4c8b0` เพิ่ม bounded
  startup stagger **2,500 ms** เฉพาะการเริ่ม CLI ไม่ serialize SQL ไม่ลด acceptance:
  holder 15 seconds/observer window 5 seconds และ strict distinct-PID/blocker-chain
  assertions คงเดิม การรันทับซ้อนจริงยืนยันจาก observed backends/locks ไม่ใช่ timing assumption
- Cleanup disposition: **scratch removed** หลังรอบ proof02 ไม่เหลือ model tables/function
  ของรอบนี้ SQL ของ harness ไม่สร้าง application/test roles และไม่เปลี่ยน application
  RLS/grading authority หรือ DB password; อย่างไรก็ตาม normal CLI authentication อาจ
  mint/refresh temporary CLI login role จึง **ไม่อ้างว่าไม่มี role mutation ทุกชนิด**
- ผลนี้ปิด scoped independent PostgreSQL concurrency/rollback proof ของ function body
  บน scratch models เท่านั้น ไม่ใช่ public RPC integration, entire live RLS/schema proof,
  canonical browser/native journey หรือ W7 pass ไม่สร้าง submission ใน actual fixture

### Dedicated UAT deployment — PASSED

- Candidate commit/push `a6ed37b9a4208812d5dff2873fc7ce635bc73929` ก่อน deploy จาก
  clean frozen checkout ไป dedicated `https://korkru-seb-uat.vercel.app` เท่านั้น
  deployment `dpl_8PiUS9WjtqFXCHEaFV4ThhJMgQe4` ตรวจ exact project/source/alias/READY,
  login HTTP 200 + STAGING badge, UI labs และ missing-context canonical start HTTP 403
  ผ่าน Runtime/build overrides คง `SEB_EXAM_WAITING_ENABLED=false`, manifest `[]`
  ไม่ enroll/publish/activate native release, ไม่ merge master/แตะ Production/Cron
  ภายหลัง deployment commit มีเฉพาะ docs attestation ไม่เปลี่ยน candidate runtime policy

## จุดหยุดและการปิดรายการ

Pilot รับเฉพาะ fixed passwordless online SEB exam; **streak excluded/fail closed**
จนมีคำอนุมัติและผล atomic verdict/summary contract แยก ไม่เปลี่ยน legacy Browser/Android/
streak หรือทำ account-wide restriction ทาง runtime/SQL เอง

Software W2–W6 ปิดแล้วตาม machine/runtime UI/proof02/cleanup/fixture/seed/deployment
evidence ที่แยกไว้ ไม่ลด requirement หรือย้าย live/native gap มาเป็น mock pass
Native passwordless entry, early-quit denial, completion/reconfiguration failures,
teacher emergency quit และ committed terminal exit ทุก platform ยัง **W7 NOT RUN**
HTTP/byte/hash/local mocks/software tests ไม่แทน observed native evidence

แผน: [SEB_COMPLETION_PLAN.md](./SEB_COMPLETION_PLAN.md) · native handoff/negative matrix:
[SEB_WAITING_ROOM_NATIVE_HANDOFF.md](./SEB_WAITING_ROOM_NATIVE_HANDOFF.md)

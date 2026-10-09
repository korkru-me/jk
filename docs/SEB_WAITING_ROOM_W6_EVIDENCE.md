# SEB waiting room — W6 evidence ledger

อัปเดต 10 ตุลาคม 2026 · fixed-exam pilot `waiting-room-completion-experimental-v1`

เอกสารนี้แยกผลที่ตรวจแล้วออกจากสิ่งที่ยัง pending ของ W2–W6 ไม่ใช่ native release certificate
และไม่ประกาศว่า end-to-end/native gates ผ่านครบ **W7: HOLD / NOT RUN / `pending_w7`**
ยังไม่ขอให้เจ้าของเปิดอุปกรณ์หรือเก็บคีย์ ไม่เปลี่ยน r2/keys/evidence เดิมหรือ Production

## Software validation — PASSED ในขอบเขตที่ระบุ

- Validation source `054ea61` รวม localhost real-client lab code `140410f`; documentation
  snapshot ที่ใช้บันทึกรอบนี้คือ `2e49aec` ผล validation ไม่เท่ากับ source ที่ deploy แล้ว
- Full suite **236 files / 3,597 tests PASSED**; `npx tsc --noEmit`, design-token lint
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
- Localhost actual-client/intercepted-backend runtime UI QA **PENDING** ณ snapshot นี้
  การมี lab code/build/tests ไม่ใช่ผลการเดิน UI แล้วจริง และ intercepted backend ไม่ใช่
  live canonical/native integration ไม่เพิ่ม mock replacement ลง deployed exam endpoints

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
  เดียว Independent PostgreSQL scratch experiment รอบแรก **NOT OBSERVED**, scratch
  removed/cleaned; diagnostics/ผลรอบถัดไป **PENDING** ไม่บันทึกเป็น concurrency pass
  และไม่สร้าง DB role/rotate password/เปลี่ยน application authority เพื่อให้ gate ผ่าน
- Last attested dedicated UAT deployment: source `7cde7b4`,
  `dpl_H24Jhy2A5YYjjkLKv1L4LZgMRf2r`, `https://korkru-seb-uat.vercel.app`
  exact source/project/alias/READY/login STAGING badge ถูกตรวจในรอบนั้น flags ยังคง
  `SEB_EXAM_WAITING_ENABLED=false`, manifest `[]`; deploy/source attestation รอบใหม่
  **PENDING** ห้ามถือ latest local code ว่า live แล้วหรือเติม deploy pass ล่วงหน้า

## จุดหยุดและการปิดรายการ

Pilot รับเฉพาะ fixed passwordless online SEB exam; **streak excluded/fail closed**
จนมีคำอนุมัติและผล atomic verdict/summary contract แยก ไม่เปลี่ยน legacy Browser/Android/
streak หรือทำ account-wide restriction ทาง runtime/SQL เอง

ก่อนปิด software W2–W6 ให้เติม observed runtime UI result, independent PostgreSQL
result + cleanup disposition และ exact new deployment/source/flags หลังตรวจจริง หาก
result ยังไม่เกิดให้คง `pending|blocked|not_observed` ไม่ลด requirement เพื่อเปลี่ยนเป็น pass
Native passwordless entry, early-quit denial, completion/reconfiguration failures,
teacher emergency quit และ committed terminal exit ทุก platform ยัง **W7 NOT RUN**
HTTP/byte/hash/local mocks/software tests ไม่แทน observed native evidence

แผน: [SEB_COMPLETION_PLAN.md](./SEB_COMPLETION_PLAN.md) · native handoff/negative matrix:
[SEB_WAITING_ROOM_NATIVE_HANDOFF.md](./SEB_WAITING_ROOM_NATIVE_HANDOFF.md)

# SEB S0 Baseline Audit

วันที่ตรวจ: 22 กันยายน 2026  
branch: `codex/seb-completion`  
ฐานโค้ด: `origin/master` ที่ `15be506d38e06449a9a2d40242a2b9a0d919fa91`

เอกสารนี้เป็นผลตรวจ read-only ของเฟส S0 ตาม
[`SEB_COMPLETION_PLAN.md`](./SEB_COMPLETION_PLAN.md) ยังไม่มีการเปลี่ยน runtime,
ฐานข้อมูล, Storage, Staging หรือ Production และไม่ใช่หลักฐาน manual UAT

## ขอบเขตและข้อห้ามที่ยืนยันแล้ว

- งานนี้ครอบคลุมเฉพาะ SEB และ Exam
- Drawing Board เฟส 0–8 อยู่บน Production แล้ว แต่ manual UAT ยัง **NOT READY**
- ไม่แก้ `config/drawing-board-uat-evidence.json`, Drawing Board candidate/status,
  canonical Staging alias, schema, migration, RLS หรือ Storage policy ของ Drawing Board
- ไม่ยกผลทดสอบ SEB ไปเป็น Drawing Board UAT และไม่รวมหลักฐานจากคนละ source revision,
  deployment หรือ SEB config
- branch ทดลอง SEB เก่าไม่ใช่ ancestor ของ `master` และห้าม merge/cherry-pick ทั้ง branch
- การทดสอบที่แตะ deploy/Auth/Supabase/Storage/SEB ต้องใช้ Staging และข้อมูลสมมติ

## Runtime ปัจจุบัน

ระบบรับ CK และ BEK request hash จาก SEB JavaScript API แล้วตรวจบน server กับ URL challenge
ที่ต้องตรง user, assignment, purpose และ route จากนั้นจึงออก cookie แบบ HttpOnly,
SameSite Strict อายุ 12 ชั่วโมง ซึ่งผูก user + assignment และระบุ platform/version

`getExamAccessSession()` รวมสองโหมดที่ server ยืนยันได้:

- `seb` จาก signed SEB session
- `android_monitored` เฉพาะเมื่อข้อสอบอนุญาตและครูอนุมัติแล้ว

Android monitored ไม่ถูกนับเป็น SEB และ request ที่มาจาก browser ปกติไม่สามารถสร้าง SEB
session ได้โดยไม่มี CK+BEK ที่ถูกต้อง

### Server-boundary matrix

| เส้นทาง | สถานะบนฐานปัจจุบัน | จุดตรวจหลัก |
| --- | --- | --- |
| system check / ออก session | ป้องกันแล้ว | auth, published assignment, roster, purpose, exact challenge URL, CK+BEK |
| start / resume submission | ป้องกันแล้ว | owner, assignment, access code, deadline และ exam access session |
| อ่าน attempt/questions | ป้องกันแล้ว | exact user + assignment + exam access session |
| บันทึก/ตรวจคำตอบ | ป้องกันแล้ว | owner, in-progress, timer/deadline และ exam access session |
| สุ่มข้อ dynamic streak | ป้องกันแล้ว | write-block checks รวม exam access session |
| บันทึก Drawing Board artifact | ป้องกันแล้ว | signed upload/receipt และ shared exam access context |
| proctor heartbeat/signal | ป้องกันแล้ว | exact attempt owner/status และ exam access session |
| submit | ป้องกันแล้ว | secure-browser enforcement ก่อน finalize |
| forced expiry finalization | ยกเว้นโดยตั้งใจ | server ปิด attempt ที่หมดอายุได้แม้นักเรียนไม่มี live session |
| อัปโหลดรูปวิธีทำเดิม (`work-images`) | **ช่องว่าง** | browser upload ตรวจเพียง Supabase auth + user folder |
| อัปโหลดไฟล์คำตอบ (`submission-files`) | **ช่องว่าง** | browser upload ตรวจเพียง Supabase auth + user folder |

## ช่องว่างที่ต้องจัดการต่อ

### 1. Legacy upload อยู่นอก live SEB boundary — ลำดับสูง

`components/exam/work-image-upload.tsx` และ
`components/exam/file-submission-upload.tsx` อัปโหลด/ลบไฟล์จาก browser ไป public bucket
โดยตรง ส่วน Storage policy ตรวจเพียงว่า segment แรกของ path เท่ากับ `auth.uid()`

ผลที่เกิดขึ้น:

- ผู้ใช้ที่ login อยู่สามารถสร้างไฟล์กำพร้าได้ แม้ไม่มี attempt ที่กำลังทำหรือไม่มี live SEB session
- การลบตรวจ ownership ที่ระดับโฟลเดอร์ แต่ไม่ตรวจ assignment/answer/status/timer/session
- การนำ URL ไปบันทึกในคำตอบยังผ่าน Server Action ที่มี gate อยู่ จึงยังไม่พบทางเขียนคำตอบข้ามคน
  จากจุดนี้โดยตรง แต่ upload lifecycle และ resource/evidence integrity ยังไม่ตรงกับ assurance ที่เอกสาร
  ความปลอดภัยอธิบายไว้

S1 ต้องออกแบบให้ server อนุญาต upload ตาม exact attempt/answer/session หรือพิสูจน์วิธีที่เทียบเท่า
ก่อนแก้จริง หากวิธีที่ถูกต้องต้องเปลี่ยน Storage policy หรือ migration ให้หยุดและรายงานเจ้าของผลิตภัณฑ์
ก่อนตามข้อห้ามของงานนี้ ห้ามอาศัยการซ่อนปุ่ม client เป็น authorization

ช่องว่างนี้เป็นของ bucket legacy `work-images`/`submission-files` ไม่ใช่
`student-work-artifacts` ของ Drawing Board และ S0 ไม่ได้แก้ bucket ใด

#### ผลติดตาม S1 — ปิดช่องว่างใน branch แล้ว ยังไม่ deploy

- browser ขอ signed upload target ผ่าน Server Action ที่ตรวจ exact authenticated student,
  submission answer, assignment mode, attempt `in_progress`, timer/deadline และ live
  SEB/Android monitored session ก่อนทุกครั้ง
- path ใหม่ผูก `{student}/{submission}/{answer}/{upload}` และ server ตรวจ metadata กับ
  byte signature ของ object หลัง upload ก่อนคืน URL; `saveAnswer`, `saveWorkImage` และ student
  final submit ตรวจ origin/path/object ซ้ำ ไม่ยอมรับ URL ภายนอกหรือ object ที่ไม่มีจริง
- path legacy สอง segment ยอมรับเฉพาะ reference เดิมของ attempt ที่กำลังทำ เพื่อไม่ทำลาย
  attempt ที่เปิดค้างระหว่าง rollout; การอัปโหลดใหม่ใช้ path แบบใหม่เท่านั้น
- migration `20260922005743_gate_exam_attachment_writes.sql` ถอนเฉพาะ direct browser
  INSERT/DELETE ของ `work-images` และ `submission-files`; public read และ owner list compatibility
  ยังอยู่ ส่วน orphan cleanup ที่ authenticated เปลี่ยนไปใช้ server role หลังตรวจ user/prefix/RPC
- migration นี้ไม่แตะ `student_work_artifacts`, Drawing Board schema/RLS/Storage หรือหลักฐาน UAT
  และยังไม่ได้ apply กับ Staging/Production

### 2. Runtime key registry ยังเป็น global flat list

- `SEB_CONFIG_KEY` รับค่าเดียว
- `SEB_BROWSER_EXAM_KEYS` เป็นรายการ BEK แบบ global โดยยังไม่ผูกใน runtime กับ config revision,
  platform และ supported build ที่อยู่ใน evidence manifest
- ค่า version/platform ที่ parse ได้ถูกบันทึกใน session แต่ไม่ได้ใช้เลือก BEK registration ราย build

โครงสร้างนี้ใช้กับ config กลาง v1 ได้ แต่ยังไม่รองรับ config แยกครู/revision และยังไม่ทำให้
platform evidence เป็น authorization registry โดยอัตโนมัติ S2 ต้องกำหนด contract ที่ versioned ก่อน
ขยายความสามารถ

### 3. Session และ challenge lifecycle ต้องมี regression ชัดเจน

- challenge เป็น signed stateless token จึงใช้ซ้ำได้ภายในช่วงอายุที่กำหนด แต่ยังต้องตรง
  user + assignment + purpose + exact URL และ CK+BEK
- signed session ไม่มี per-session revocation; หมดอายุตามเวลา หรือถูกยกเลิกทั้งหมดเมื่อ rotate secret
- ห้าม rotate CK/BEK/session secret ระหว่างการสอบจริง

S1 ต้องเพิ่ม regression สำหรับ expired/tampered/wrong-purpose/wrong-user/wrong-assignment และบันทึก
design property เหล่านี้ให้ชัดก่อนตัดสินใจว่าต้องเปลี่ยน runtime หรือไม่

### 4. Release evidence ยังใช้ข้าม revision ไม่ได้

- `config/seb-platform-evidence.json` ยืนยัน native core ผ่านบน macOS, iPadOS, iOS และ Windows
  แต่ production BEK, Staging mock exam และ physical UAT ยัง pending
- `config/exam-uat-evidence.json` ยัง pending ทุก suite
- `config/exam-release-candidate.json` ชี้ candidate `final-release-uat-r8` ซึ่งเก่ากว่า Drawing Board
  revision ล่าสุด จึงห้ามใช้เป็นหลักฐาน release รอบใหม่
- worktree ไม่มี QA/SEB secret ที่ฉีดจาก Keychain/CI การตรวจ readiness ในเครื่องจึงรายงานไม่พร้อม
  ตามที่ออกแบบไว้ และไม่ได้แปลว่าค่าบน Vercel ถูกลบ

## Test inventory และสิ่งที่ยังขาด

มี automated tests โดยตรงสำหรับ core hash/session helpers, preflight, proctoring และ math-work
หลายส่วน เช่น `lib/seb.test.ts`, `lib/seb-preflight.test.ts`, `lib/exam-proctor*.test.ts` และ
`lib/math-work*.test.ts`

ยังไม่มี regression matrix ครบที่ระดับ Server Action สำหรับ:

- start/resume และ exam read
- save/check/dynamic draw/submit ในเงื่อนไข session ผิดรูปแบบต่าง ๆ
- legacy work-image/submission-file upload lifecycle
- timer expiry และ forced-finalization exception
- การแยก normal browser, SEB และ Android monitored ทุก write boundary

รายการนี้เป็นขอบเขตหลักของ S1 ไม่ใช่สถานะว่าระบบทั้งหมดไม่ปลอดภัย

## การประเมิน branch ทดลองเดิม

ตรวจ `feat/seb-phase1-prototype`, `feat/seb-phase2-server-lab` และ
`feat/seb-phase3-password-core` แล้ว พบว่า branch เหล่านี้มีหน้า exam รุ่นเก่าและงานอื่นปะปน
กับ draft เรื่อง quit password/vault จึงมีข้อสรุปดังนี้:

- ไม่ merge หรือ cherry-pick ทั้ง commit/branch
- ไม่นำ migration/vault เก่ามาใช้โดยไม่ทบทวน tenant isolation, encryption key recovery,
  ledger และ BEK lifecycle ใหม่
- นำเฉพาะ requirement ที่ยังต้องการมาออกแบบบนฐานปัจจุบันใน S4
- native SEB intercepts Quit URL ก่อน HTTP handler จึงห้ามอ้างว่าปุ่มเว็บหรือ hidden URL
  เป็น authorization boundary สำหรับการปิดแอป

## Shared surface กับ Drawing Board

ไฟล์/contract ที่ S1 ต้องถือเป็น shared และรัน regression ก่อน commit ได้แก่:

- `lib/actions/math-work.ts` และ signed artifact flow
- `lib/actions/submissions.ts` และ submission/timer contract
- `lib/exam-taking.ts`, `lib/exam-access-session.ts` และ Auth/session
- exam page/components ที่ render ทั้ง legacy attachment และ Drawing Board
- environment/Vercel configuration และ package dependencies

หากการแก้ legacy upload ต้องเปลี่ยน contract ของ Drawing Board หรือ bucket
`student-work-artifacts` ให้หยุดก่อน ไม่ขยาย scope เอง

## ผลตัวตรวจ read-only ที่ baseline นี้

- `npm run check:exam-candidate` — **PASS** สำหรับความสอดคล้องของไฟล์ candidate ปัจจุบัน
- `npm run check:seb-platforms` — **NOT READY** เพราะ BEK/mock/physical evidence ยังไม่ครบ
- `npm run check:exam-uat` — **NOT READY** เพราะทุก suite ยัง pending
- `npm run check:exam-release` — **NOT READY** เพราะ environment/evidence ยังไม่ครบ
- `npm run check:seb-readiness` — **NOT READY ใน worktree นี้** เพราะไม่มี injected secret
- ไม่มีการรัน manual/native UAT ใน S0

ผล NOT READY เป็น blocker ที่ถูกต้องและไม่มีการแก้ manifest เพื่อทำให้ผ่านเทียม

## ข้อสรุป S0

S0 **ผ่านในระดับ audit/documentation**: ฐานโค้ด, branch, runtime, evidence, test inventory,
branch ทดลอง, shared surface และช่องว่างสำคัญถูกระบุครบโดยไม่แตะ Production หรือ Drawing Board

งานถัดไปคือ S1: เพิ่ม regression ของ server boundary ก่อน แล้วเสนอวิธีปิดช่องว่าง legacy upload
โดยยังไม่ทำ migration/RLS/Storage change จนกว่าจะยืนยันผลกระทบและได้รับอนุมัติเมื่อจำเป็น
